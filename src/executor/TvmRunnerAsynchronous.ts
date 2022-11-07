import { TVMExecuteConfig, TVMExecutionResult } from "./executor"
import { TvmRunner } from "./TvmRunner"
import { ExecutorPool } from "./workerPool/executorPool"
import { createWorker, maxWorkers } from "./node/createWorker"

export class TvmRunnerAsynchronous implements TvmRunner  {
    private pool: ExecutorPool
    private static shared: TvmRunnerAsynchronous|null = null

    constructor(workersCount: number) {
        this.pool = new ExecutorPool(workersCount, createWorker)
    }

    async invoke(config: TVMExecuteConfig): Promise<TVMExecutionResult> {
        return await this.pool.execute(config)
    }

    static getShared(): TvmRunnerAsynchronous {
        if (!TvmRunnerAsynchronous.shared) {
            TvmRunnerAsynchronous.shared = new TvmRunnerAsynchronous(maxWorkers())
        }
        return TvmRunnerAsynchronous.shared
    }
}