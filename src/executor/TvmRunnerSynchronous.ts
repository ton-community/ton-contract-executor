import { TVMExecuteConfig, TVMExecutionResult, runTVM } from "./executor";
import { TvmRunner } from "./TvmRunner";

export class TvmRunnerSynchronous implements TvmRunner {
    async invoke(config: TVMExecuteConfig): Promise<TVMExecutionResult> {
        return await runTVM(config)
    }
}

export const getInstance = () => new TvmRunnerSynchronous()