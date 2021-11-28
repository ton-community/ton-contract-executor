import {Cell} from "ton";
import {crc16} from "./crc16";
import {execAsync} from "./exec";
import {createTempFile} from "./createTempFile";
import {compileFunc} from "ton-compiler";
import * as path from 'path';

type TVMConfig = {
    function_selector: number,
    init_stack: TVMStack,
    code: string,
    data: string
}

export type TVMStack = TVMStackEntry[]

type TVMExecutionResult = {
    exit_code: number,
    stack: TVMStack,
    data_cell: string           // Base64 serialized BOC
    action_list_cell: string    // Base64 serialized BOC
    code_cell: string           // Base64 serialized BOC
}

type TVMStackEntry =
    | TVMStackEntryNull
    | TVMStackEntryCell
    | TVMStackEntryInt
    | TVMStackEntryCellSlice
    | TVMStackEntryTuple

type TVMStackEntryNull = { type: 'null' }
type TVMStackEntryCell = { type: 'cell', value: string }
type TVMStackEntryInt = { type: 'int', value: string }
type TVMStackEntryCellSlice = { type: 'cell_slice', value: string }
type TVMStackEntryTuple = { type: 'tuple', value: TVMStackEntry[] }

async function runTVM(config: TVMConfig): Promise<TVMExecutionResult> {
    let configFile = await createTempFile(JSON.stringify(config))
    const vmExecPath = path.resolve(__dirname, '..', 'bin', 'macos', 'vm-exec-arm64')
    let res = await execAsync(`${vmExecPath} -c ${configFile.path}`)
    await configFile.destroy()
    let lines = res.toString().split('\n')
    return JSON.parse(lines[lines.length - 1])
}

export async function runContract(code: string, dataCell: Cell, stack: TVMStack, method: string): Promise<TVMExecutionResult> {
    let tempCodeFile = await createTempFile(code)
    let compiledSource = await compileFunc(code)
    await tempCodeFile.destroy()

    let data = (await dataCell.toBoc({idx: false})).toString('base64')

    let executorConfig = {
        function_selector: getSelectorForMethod(method),
        init_stack: stack,
        code: Buffer.from(compiledSource.fift).toString('base64'),
        data
    }

    return await runTVM(executorConfig)
}

export async function runContractAssembly(code: string, dataCell: Cell, stack: TVMStack, method: string): Promise<TVMExecutionResult> {
    let data = (await dataCell.toBoc({idx: false})).toString('base64')
    let executorConfig = {
        function_selector: getSelectorForMethod(method),
        init_stack: stack,
        code: Buffer.from(code).toString('base64'),
        data
    }

    return await runTVM(executorConfig)
}

function getSelectorForMethod(methodName: string) {
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