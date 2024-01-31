import {Cell, Message, Slice, storeMessage, beginCell} from "@ton/core";
import {
    buildC7,
    C7Config,
    GasLimits,
    getSelectorForMethod,
    TVMExecuteConfig,
    TVMStack,
    TVMStackEntry,
    TVMStackEntryTuple
} from "../executor/executor";
import {bocToCell, cellToBoc} from "../utils/cell";
import {TvmRunner} from "../executor/TvmRunner";
import {OutAction, parseActionsList, SetCodeAction} from "../utils/parseActionList";
import {TvmRunnerAsynchronous} from "../executor/TvmRunnerAsynchronous";

type NormalizedStackEntry =
    | null
    | Cell
    | Slice
    | bigint
    | NormalizedStackEntry[]

async function normalizeTvmStackEntry(entry: TVMStackEntry): Promise<NormalizedStackEntry> {
    if (entry.type === 'null') {
        return null
    }
    if (entry.type === 'cell') {
        return bocToCell(entry.value)
    }
    if (entry.type === 'int') {
        return BigInt(entry.value)
    }
    if (entry.type === 'cell_slice') {
        return bocToCell(entry.value).beginParse()
    }
    if (entry.type === 'tuple') {
        return await Promise.all(entry.value.map(v => normalizeTvmStackEntry(v)))
    }
    throw new Error('Unknown TVM stack entry' + JSON.stringify(entry))
}

async function normalizeTvmStack(stack: TVMStack) {
    return await Promise.all(stack.map(v => normalizeTvmStackEntry(v)))
}

export type SmartContractConfig = {
    // Whether or not get methods should update smc data, false by default (useful for debug)
    getMethodsMutate: boolean
    // Return debug logs
    debug: boolean
    // Tvm runner for execution
    runner: TvmRunner
}

export type FailedExecutionResult = {
    type: 'failed'
    exit_code: number
    gas_consumed: number,
    result: NormalizedStackEntry[]
    actionList: OutAction[]
    action_list_cell?: Cell
    logs: string
    debugLogs: string[]
    c7: NormalizedStackEntry[]
}

export type SuccessfulExecutionResult = {
    type: 'success',
    exit_code: number,
    gas_consumed: number,
    result: NormalizedStackEntry[]
    actionList: OutAction[]
    action_list_cell?: Cell
    logs: string
    debugLogs: string[]
    c7: NormalizedStackEntry[]
}

export type ExecutionResult = FailedExecutionResult | SuccessfulExecutionResult

const decodeLogs = (logs: string) => Buffer.from(logs, 'base64').toString()

//
//  Mutable Smart Contract
//
//  Invoking mutating methods of contract mutates data cell
//
export class SmartContract {
    public codeCell: Cell
    public dataCell: Cell
    private codeCellBoc: string
    private dataCellBoc: string
    private config: SmartContractConfig
    private c7Config: C7Config = {}
    private c7: TVMStackEntryTuple | null = null

    private constructor(codeCell: Cell, dataCell: Cell, config?: Partial<SmartContractConfig>) {
        this.codeCell = codeCell
        this.dataCell = dataCell
        this.codeCellBoc = cellToBoc(codeCell)
        this.dataCellBoc = cellToBoc(dataCell)

        this.config = {
            getMethodsMutate: config?.getMethodsMutate ?? false,
            debug: config?.debug ?? false,
            runner: config?.runner ?? TvmRunnerAsynchronous.getShared()
        }
    }

    private async runContract(method: string | number, stack: TVMStack, opts: { mutateData: boolean, mutateCode: boolean, gasLimits?: GasLimits }): Promise<ExecutionResult> {
        let executorConfig: TVMExecuteConfig = {
            debug: this.config.debug,
            function_selector: typeof method === 'string' ? getSelectorForMethod(method) : method,
            init_stack: stack,
            code: this.codeCellBoc,
            data: this.dataCellBoc,
            c7_register: this.getC7(),
            gas_limit: opts.gasLimits?.limit ?? -1,
            gas_max: opts.gasLimits?.max ?? -1,
            gas_credit: opts.gasLimits?.credit ?? -1,
        }
        let res = await this.config.runner.invoke(executorConfig)

        // In this case probably there wa something wrong with executor config
        if (!res.ok && res.error) {
            throw new Error(`Cant execute vm: ${res.error}}`)
        }

        // In this case TVM failed
        if (res.exit_code !== 0 || !res.ok) {
            let logs = res.logs ? decodeLogs(res.logs) : ''

            return {
                type: 'failed',
                exit_code: res.exit_code!,
                gas_consumed: 0,
                result: [] as NormalizedStackEntry[],
                action_list_cell: undefined,
                actionList: [],
                logs: logs,
                debugLogs: res.debugLogs,
                c7: await normalizeTvmStack(res.c7.value),
            }
        }

        if (opts?.mutateData && res.data_cell) {
            this.setDataCell(bocToCell(res.data_cell))
        }

        let actionListCell = bocToCell(res.action_list_cell)
        let actionList = parseActionsList(actionListCell)

        let setCode = actionList.find(a => a.type === 'set_code')
        if (setCode && opts?.mutateCode) {
            this.setCodeCell((setCode as SetCodeAction).newCode)
        }

        return {
            type: 'success',
            exit_code: res.exit_code,
            gas_consumed: res.gas_consumed,
            result: await normalizeTvmStack(res.stack || []),
            action_list_cell: actionListCell,
            logs: decodeLogs(res.logs),
            actionList,
            debugLogs: res.debugLogs,
            c7: await normalizeTvmStack(res.c7.value),
        }
    }

    async invokeGetMethod(method: string | number, args: TVMStack, opts?: { gasLimits?: GasLimits }): Promise<ExecutionResult> {
        return await this.runContract(method, args, {
            mutateData: this.config.getMethodsMutate,
            mutateCode: this.config.getMethodsMutate,
            gasLimits: opts?.gasLimits,
        })
    }

    async sendMessage(message: Message, opts?: { gasLimits?: GasLimits }): Promise<ExecutionResult> {
        const msgValue = message.info.type === 'internal' ? message.info.value.coins : 0n
        const balance = (this.c7Config.balance ?? 0n) + msgValue


        return await this.runContract(message.info.type === 'internal' ? 'recv_internal' : 'recv_external', [
            {type: 'int', value: balance.toString(10)}, // smc_balance
            {type: 'int', value: msgValue.toString(10)}, // msg_value
            {type: 'cell', value: cellToBoc(beginCell().storeWritable(storeMessage(message)).endCell())}, // msg cell
            {type: 'cell_slice', value: cellToBoc(message.body)}, // body slice
        ], {mutateCode: true, mutateData: true, gasLimits: opts?.gasLimits})
    }

    async sendInternalMessage(message: Message, opts?: { gasLimits?: GasLimits }): Promise<ExecutionResult> {
        if (message.info.type !== 'internal') {
            throw new Error('Message is not internal')
        }

        return await this.sendMessage(message, opts)
    }

    async sendExternalMessage(message: Message, opts?: { gasLimits?: GasLimits }): Promise<ExecutionResult> {
        if (message.info.type !== 'external-in') {
            throw new Error('Message is not external-in')
        }

        return await this.sendMessage(message, opts)
    }

    setUnixTime(time: number) {
        this.c7Config.unixtime = time
    }

    setBalance(value: bigint) {
        this.c7Config.balance = value
    }

    setC7Config(conf: C7Config) {
        this.c7Config = conf
    }

    setC7(c7: TVMStackEntryTuple) {
        this.c7 = c7
    }

    getC7() {
        if (this.c7) {
            return this.c7
        } else {
            return buildC7(this.c7Config)
        }
    }

    setDataCell(dataCell: Cell) {
        this.dataCell = dataCell
        this.dataCellBoc = cellToBoc(dataCell)
    }

    setCodeCell(codeCell: Cell) {
        this.codeCell = codeCell
        this.codeCellBoc = cellToBoc(codeCell)
    }

    /**
     * @deprecated Use SmartContract.fromCell instead. Compilation of FunC is possible through https://github.com/ton-community/func-js and https://github.com/ton-community/ton-compiler
     */
    static async fromFuncSource(source: string, dataCell: Cell, config?: Partial<SmartContractConfig>): Promise<SmartContract> {
        throw new Error('SmartContract.fromFuncSource is no longer supported. Use SmartContract.fromCell instead. Compilation of FunC is possible through https://github.com/ton-community/func-js and https://github.com/ton-community/ton-compiler')
    }

    static async fromCell(codeCell: Cell, dataCell: Cell, config?: Partial<SmartContractConfig>) {
        return new SmartContract(codeCell, dataCell, config)
    }
}