import {Cell} from "ton";
import {crc16} from "../utils/crc16";
import {execAsync} from "../utils/exec";
import {createTempFile} from "../utils/createTempFile";
import {compileFunc} from "ton-compiler";
import * as path from 'path';
import * as os from 'os';

function getExecutorPath() {
    let arch = os.arch()
    let platform = os.platform()

    if (platform === 'darwin') {
        if (arch === 'x64') {
            return path.resolve(__dirname, '..', '..', 'bin', 'macos', 'vm-exec-x86-64')
        } else if (arch === 'arm64') {
            return path.resolve(__dirname, '..', '..', 'bin', 'macos', 'vm-exec-arm64')
        }
    } else if (platform === 'linux' && arch === 'x64') {
        if (arch === 'x64') {
            return path.resolve(__dirname, '..', '..', 'bin', 'linux', 'vm-exec-x86-64')
        } else if (arch === 'arm64') {
            return path.resolve(__dirname, '..', '..', 'bin', 'linux', 'vm-exec-arm64')
        }
    }

    throw new Error('Unsupported platform & arch combination: ' + platform + ' ' + arch)
}

type TVMConfig = {
    function_selector: number,
    init_stack: TVMStack,
    code: string,               // base64 encoded TVM fift assembly
    data: string                // base64 encoded boc(data_cell)
}

export type TVMStack = TVMStackEntry[]

export type TVMExecutionResult = {
    exit_code: number,           // TVM Exit code
    gas_consumed: number,
    stack?: TVMStack,            // TVM Resulting stack
    data_cell?: string           // base64 encoded BOC
    action_list_cell?: string    // base64 encoded BOC
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
    let configFile = await createTempFile(JSON.stringify(config))
    let res = await execAsync(`${getExecutorPath()} -c ${configFile.path}`)
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