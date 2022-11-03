import {runTVM, TVMExecuteConfig, TVMExecutionResult} from "./executor";

export interface TvmRunner {
    invoke(config: TVMExecuteConfig): Promise<TVMExecutionResult>
}

export class TvmRunnerSynchronous implements TvmRunner {
    async invoke(config: TVMExecuteConfig): Promise<TVMExecutionResult> {
        return await runTVM(config)
    }
}