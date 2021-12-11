import {Cell, ExternalMessage, InternalMessage, Slice} from "ton";
import {runContractAssembly, TVMStack, TVMStackEntry} from "./executor";
import {compileFunc} from "ton-compiler";
import BN from "bn.js";

export const cellToBoc = async (cell: Cell) => {
    return (await cell.toBoc({idx: false})).toString('base64')
}

export const bocToCell = (boc: string) => {
    return Cell.fromBoc(Buffer.from(boc, 'base64'))[0]
}

type NormalizedStackEntry =
    | null
    | Cell
    | Slice
    | BN
    | NormalizedStackEntry[]

async function normalizeTvmStackEntry(entry: TVMStackEntry): Promise<NormalizedStackEntry> {
    if (entry.type === 'null') {
        return null
    }
    if (entry.type === 'cell') {
        return bocToCell(entry.value)
    }
    if (entry.type === 'int') {
        return new BN(entry.value, 10)
    }
    if (entry.type === 'cell_slice') {
        return Slice.fromCell(bocToCell(entry.value))
    }
    if (entry.type === 'tuple') {
        return await Promise.all(entry.value.map(v => normalizeTvmStackEntry(v)))
    }
    throw new Error('Unknown TVM stack entry' + JSON.stringify(entry))
}

async function normalizeTvmStack(stack: TVMStack) {
    return await Promise.all(stack.map(v => normalizeTvmStackEntry(v)))
}

class TVMExecutionException extends Error {
    public code: number

    constructor(code: number, message?: string) {
        super(message)

        this.code = code
    }
}

//
//  Mutable Smart Contract
//
//  Invoking mutating methods of contract mutates data cell
//

type SmartContractConfig = {
    // Whether or not get methods should update smc data, false by default (useful for debug)
    getMethodsMutate: boolean
}

export class SmartContract {
    private assemblyCode: string
    private dataCell: Cell
    private config: SmartContractConfig

    private constructor(assemblyCode: string, dataCell: Cell, config?: SmartContractConfig) {
        this.assemblyCode = assemblyCode
        this.dataCell = dataCell
        this.config = config || { getMethodsMutate: false }
    }

    async invokeGetMethod(method: string, args: TVMStack) {
        let res = await runContractAssembly(
            this.assemblyCode,
            this.dataCell,
            args,
            method
        )

        if (res.exit_code !== 0) {
            return { exit_code: res.exit_code, result: [] as NormalizedStackEntry[] }
        }

        if (this.config.getMethodsMutate && res.data_cell) {
            this.dataCell = bocToCell(res.data_cell)
        }

        return {
            exit_code: res.exit_code,
            gas_consumed: res.gas_consumed,
            result: await normalizeTvmStack(res.stack || []),
            action_list_cell: res.action_list_cell ? bocToCell(res.action_list_cell) : undefined
        }
    }

    async sendInternalMessage(message: InternalMessage) {
        let msgCell = new Cell()
        message.writeTo(msgCell)

        let bodyCell = new Cell()
        message.body.writeTo(bodyCell)

        let res = await runContractAssembly(
            this.assemblyCode,
            this.dataCell,
            [
                {type: 'int', value: '1000'},                           // smc_balance
                {type: 'int', value: '100' },                           // msg_value
                {type: 'cell', value: await cellToBoc(msgCell)},        // msg cell
                {type: 'cell_slice', value: await cellToBoc(bodyCell)}, // body slice
            ],
            'recv_internal'
        )

        if (res.exit_code !== 0) {
            return { exit_code: res.exit_code, result: [] as NormalizedStackEntry[] }
        }

        if (res.data_cell) {
            this.dataCell = bocToCell(res.data_cell)
        }

        // TODO: handle code update

        return {
            exit_code: res.exit_code,
            gas_consumed: res.gas_consumed,
            result: await normalizeTvmStack(res.stack || []),
            action_list_cell: res.action_list_cell ? bocToCell(res.action_list_cell) : undefined
        }
    }

    async sendExternalMessage(message: ExternalMessage) {
        let msgCell = new Cell()
        message.writeTo(msgCell)

        let bodyCell = new Cell()
        message.body.writeTo(bodyCell)

        let res = await runContractAssembly(
            this.assemblyCode,
            this.dataCell,
            [
                {type: 'int', value: '1000'},                           // smc_balance
                {type: 'int', value: '0'},                              // msg_value
                {type: 'cell', value: await cellToBoc(msgCell)},        // msg cell
                {type: 'cell_slice', value: await cellToBoc(bodyCell)}, // body slice
            ],
            'recv_external'
        )

        if (res.exit_code !== 0) {
            return { exit_code: res.exit_code, result: [] as NormalizedStackEntry[] }
        }

        if (res.data_cell) {
            this.dataCell = bocToCell(res.data_cell)
        }

        // TODO: handle code update

        return {
            exit_code: res.exit_code,
            gas_consumed: res.gas_consumed,
            result: await normalizeTvmStack(res.stack || []),
            action_list_cell: res.action_list_cell ? bocToCell(res.action_list_cell) : undefined
        }
    }

    static async fromFuncSource(source: string, dataCell: Cell, config?: SmartContractConfig) {
        let compiledSource = await compileFunc(source)
        return new SmartContract(compiledSource.fift, dataCell, config)
    }

    static async fromAssembly(source: string, dataCell: Cell, config?: SmartContractConfig) {
        return new SmartContract(source, dataCell, config)
    }
}