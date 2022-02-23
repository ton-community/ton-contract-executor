import {Address, Cell} from "ton";
import {crc16} from "../utils/crc16";
import {initializeVmExec, vm_exec} from '../vm-exec/vmExec'
import {randomBytes} from "crypto";
import BN from "bn.js";

export type TVMConfig = {
    function_selector: number,
    init_stack: TVMStack,
    code: string,               // base64 encoded TVM fift assembly
    data: string,               // base64 encoded boc(data_cell)
    c7_register: TVMStackEntryTuple
}

export type TVMStack = TVMStackEntry[]

export type TVMExecutionResult = {
    exit_code: number,           // TVM Exit code
    gas_consumed: number,
    stack?: TVMStack,            // TVM Resulting stack
    data_cell?: string           // base64 encoded BOC
    action_list_cell?: string    // base64 encoded BOC
    logs: string
}

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

const makeIntEntry = (value: number|BN): TVMStackEntryInt => ({ type: 'int', value: value.toString(10) })
const makeTuple = (items: TVMStackEntry[]): TVMStackEntryTuple => ({ type: 'tuple', value: items})
const makeNull = (): TVMStackEntryNull => ({ type: 'null' })
const makeCell = (cell: Cell): TVMStackEntryCell => ({ type: 'cell', value: cell.toBoc({ idx: false }).toString('base64') })

export type C7Config = {
    unixtime?: number,
    balance?: number,
    myself?: Address,
    randSeed?: BN
    actions?: number
    messagesSent?: number
    blockLt?: number
    transLt?: number
    globalConfig?: Cell
}

export function buildC7(config: C7Config) {
    let now = Math.floor(Date.now() / 1000)

    let seed = randomBytes(32)
    let seedInt = new BN(seed)

    let currentConfig: Required<C7Config> = {
        unixtime: now,
        balance: 1000,
        myself: new Address(0, Buffer.alloc(256 / 8)),
        randSeed: seedInt,
        actions: 0,
        messagesSent: 0,
        blockLt: now,
        transLt: now,
        globalConfig: new Cell(),
        ...config
    }

    // workchain_id:int8 address:bits256  = MsgAddressInt;
    let address = makeTuple([makeIntEntry(currentConfig.myself.workChain),makeIntEntry(new BN(currentConfig.myself.hash))])
    // [Integer (Maybe Cell)]
    let balance = makeTuple([makeIntEntry(currentConfig.balance), makeNull()])

    return makeTuple([
        makeTuple([
            makeIntEntry(0x076ef1ea),           // [ magic:0x076ef1ea
            makeIntEntry(currentConfig.actions),      // actions:Integer
            makeIntEntry(currentConfig.messagesSent), // msgs_sent:Integer
            makeIntEntry(currentConfig.unixtime),     // unixtime:Integer
            makeIntEntry(currentConfig.blockLt),      // block_lt:Integer
            makeIntEntry(currentConfig.transLt),      // trans_lt:Integer
            makeIntEntry(currentConfig.randSeed),     // rand_seed:Integer
            balance,                                  // balance_remaining:[Integer (Maybe Cell)]
            address,                                  // myself:MsgAddressInt
            makeCell(currentConfig.globalConfig),     // global_config:(Maybe Cell) ] = SmartContractInfo;
        ])
    ])
}

export async function runTVM(config: TVMConfig): Promise<TVMExecutionResult> {
    await initializeVmExec()
    let {result} = await vm_exec(JSON.stringify(config))
    return JSON.parse(result)
}

export async function runContract(code: Cell, dataCell: Cell, stack: TVMStack, method: string, c7: TVMStackEntryTuple): Promise<TVMExecutionResult> {
    let data = (await dataCell.toBoc({idx: false})).toString('base64')
    let executorConfig = {
        function_selector: getSelectorForMethod(method),
        init_stack: stack,
        code: (await code.toBoc({ idx: false })).toString('base64'),
        data,
        c7_register: c7
    }
    return await runTVM(executorConfig)
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