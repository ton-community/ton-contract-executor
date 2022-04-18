import {runTVM, TVMExecuteConfig, TVMExecutionResult} from "./executor";
import {ExecutorPool} from "./worker_pool/executorPool";
import * as os from "os";

export interface TvmRunner {
    invoke(config: TVMExecuteConfig): Promise<TVMExecutionResult>
}

export class TvmRunnerSynchronous implements TvmRunner {
    async invoke(config: TVMExecuteConfig): Promise<TVMExecutionResult> {
        return await runTVM(config)
    }
}

export class TvmRunnerAsynchronous implements TvmRunner  {
    private pool: ExecutorPool
    private static shared: TvmRunnerAsynchronous|null = null

    constructor(workersCount: number) {
        this.pool = new ExecutorPool(workersCount)
    }

    async invoke(config: TVMExecuteConfig): Promise<TVMExecutionResult> {
        return await this.pool.execute(config)
    }

    static getShared(): TvmRunnerAsynchronous {
        if (!TvmRunnerAsynchronous.shared) {
            let workersCount = Math.max(2, os.cpus().length / 2)
            TvmRunnerAsynchronous.shared = new TvmRunnerAsynchronous(workersCount)
        }
        return TvmRunnerAsynchronous.shared
    }
}