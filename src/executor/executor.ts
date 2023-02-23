import {Address, beginCell, Cell} from "ton-core";
import {crc16} from "../utils/crc16";
import {vm_exec} from '../vm-exec/vmExec'
import {TvmRunner} from "./TvmRunner";
import {cellToBoc} from "../utils/cell";

export type TVMExecuteConfig = {
    debug: boolean
    function_selector: number,
    init_stack: TVMStack,
    code: string,               // base64 encoded TVM fift assembly
    data: string,               // base64 encoded boc(data_cell)
    c7_register: TVMStackEntryTuple
    gas_limit: number
    gas_max: number
    gas_credit: number
}

export type TVMStack = TVMStackEntry[]

export type TVMExecutionResultOk = {
    ok: true,
    exit_code: number,           // TVM Exit code
    gas_consumed: number,
    stack: TVMStack,            // TVM Resulting stack
    data_cell: string           // base64 encoded BOC
    action_list_cell: string    // base64 encoded BOC
    logs: string
    debugLogs: string[]
    c7: TVMStackEntryTuple
}

export type TVMExecutionResultFail = {
    ok: false,
    error?: string
    exit_code?: number,
    logs?: string
    debugLogs: string[]
    c7: TVMStackEntryTuple
}

export type TVMExecutionResult =
    | TVMExecutionResultOk
    | TVMExecutionResultFail

export type TVMStackEntry =
    | TVMStackEntryNull
    | TVMStackEntryCell
    | TVMStackEntryInt
    | TVMStackEntryCellSlice
    | TVMStackEntryTuple

export type TVMStackEntryNull = { type: 'null' }
export type TVMStackEntryCell = { type: 'cell', value: string }
export type TVMStackEntryInt = { type: 'int', value: string }
export type TVMStackEntryCellSlice = { type: 'cell_slice', value: string }
export type TVMStackEntryTuple = { type: 'tuple', value: TVMStackEntry[] }

export const stackInt = (value: number|bigint): TVMStackEntryInt => ({ type: 'int', value: value.toString(10) })
export const stackTuple = (items: TVMStackEntry[]): TVMStackEntryTuple => ({ type: 'tuple', value: items })
export const stackNull = (): TVMStackEntryNull => ({ type: 'null' })
export const stackCell = (cell: Cell): TVMStackEntryCell => ({ type: 'cell', value: cellToBoc(cell) })
export const stackSlice = (cell: Cell): TVMStackEntryCellSlice => ({ type: 'cell_slice', value: cellToBoc(cell) })

export type C7Config = {
    unixtime?: number,
    balance?: bigint,
    myself?: Address,
    randSeed?: bigint
    actions?: number
    messagesSent?: number
    blockLt?: number
    transLt?: number
    globalConfig?: Cell
}

const randomBytes = (n: number): Buffer => {
    const b = Buffer.alloc(n)
    for (let i = 0; i < n; i++) {
        b[i] = Math.floor(Math.random() * 256)
    }
    return b
}

const bufferToBigInt = (b: Buffer): bigint => {
    let n = 0n
    for (let i = 0; i < b.length; i++) {
        n <<= 8n
        n += BigInt(b[i])
    }
    return n
}

export function buildC7(config: C7Config) {
    let now = Math.floor(Date.now() / 1000)

    let seed = randomBytes(32)

    let seedInt = bufferToBigInt(seed)

    let currentConfig: Required<C7Config> = {
        unixtime: now,
        balance: 1000n,
        myself: new Address(0, Buffer.alloc(256 / 8)),
        randSeed: seedInt,
        actions: 0,
        messagesSent: 0,
        blockLt: now,
        transLt: now,
        globalConfig: new Cell(),
        ...config
    }

    // addr_std$10 anycast:(Maybe Anycast)
    //    workchain_id:int8 address:bits256  = MsgAddressInt;
    // workchain_id:int8 address:bits256  = MsgAddressInt;
    let addressCell = beginCell()
        .storeAddress(currentConfig.myself)
        .endCell()

    // [Integer (Maybe Cell)]
    let balance = stackTuple([stackInt(currentConfig.balance), stackNull()])

    return stackTuple([
        stackTuple([
            stackInt(0x076ef1ea),           // [ magic:0x076ef1ea
            stackInt(currentConfig.actions),      // actions:Integer
            stackInt(currentConfig.messagesSent), // msgs_sent:Integer
            stackInt(currentConfig.unixtime),     // unixtime:Integer
            stackInt(currentConfig.blockLt),      // block_lt:Integer
            stackInt(currentConfig.transLt),      // trans_lt:Integer
            stackInt(currentConfig.randSeed),     // rand_seed:Integer
            balance,                                  // balance_remaining:[Integer (Maybe Cell)]
            stackSlice(addressCell),                   // myself:MsgAddressInt
            stackCell(currentConfig.globalConfig),     // global_config:(Maybe Cell) ] = SmartContractInfo;
        ])
    ])
}

export async function runTVM(config: TVMExecuteConfig): Promise<TVMExecutionResult> {
    const res = await vm_exec(config)
    return {
        ...res.result,
        debugLogs: res.debugLogs,
    }
}

export type GasLimits = {
    limit?: number
    max?: number
    credit?: number
}

export type RunContractConfig = {
    code: Cell,
    dataCell: Cell,
    stack: TVMStack,
    method: string,
    c7: TVMStackEntryTuple,
    debug: boolean
    executor?: TvmRunner
    gasLimits?: GasLimits
}

export async function runContract(config: RunContractConfig): Promise<TVMExecutionResult> {
    let {
        code,
        dataCell,
        stack,
        method,
        c7,
        debug,
        executor,
        gasLimits,
    } = config

    let executorConfig: TVMExecuteConfig = {
        debug,
        function_selector: getSelectorForMethod(method),
        init_stack: stack,
        code: cellToBoc(code),
        data: cellToBoc(dataCell),
        c7_register: c7,
        gas_limit: gasLimits?.limit ?? -1,
        gas_max: gasLimits?.max ?? -1,
        gas_credit: gasLimits?.credit ?? -1,
    }

    let res
    if (!executor) {
        res = await runTVM(executorConfig)
    } else {
        res = await executor.invoke(executorConfig)
    }

    return res
}

export function getSelectorForMethod(methodName: string) {
    if (methodName === 'main') {
        return 0
    } else if (methodName === 'recv_internal') {
        return 0
    } else if (methodName === 'recv_external') {
        return -1
    } else {
        return (crc16(methodName) & 0xffff) | 0x10000
    }
}