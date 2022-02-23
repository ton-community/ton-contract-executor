import {Cell} from "ton";
import {crc16} from "../utils/crc16";
import {initializeVmExec, vm_exec} from '../vm-exec/vmExec'

export type TVMConfig = {
    function_selector: number,
    init_stack: TVMStack,
    code: string,               // base64 encoded TVM fift assembly
    data: string,               // base64 encoded boc(data_cell)
    time: number
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

export async function runTVM(config: TVMConfig): Promise<TVMExecutionResult> {
    await initializeVmExec()
    let {result} = await vm_exec(JSON.stringify(config))

    return JSON.parse(result)
}

export async function runContract(code: Cell, dataCell: Cell, stack: TVMStack, method: string, extra?: { time: number }): Promise<TVMExecutionResult> {
    let data = (await dataCell.toBoc({idx: false})).toString('base64')
    let executorConfig = {
        function_selector: getSelectorForMethod(method),
        init_stack: stack,
        code: (await code.toBoc({ idx: false })).toString('base64'),
        data,
        time: extra ? extra.time : Math.floor(Date.now() / 1000)
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