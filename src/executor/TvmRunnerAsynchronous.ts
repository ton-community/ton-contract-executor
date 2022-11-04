import { TVMExecuteConfig, TVMExecutionResult } from "./executor"
import { TvmRunner } from "./TvmRunner"
import { ExecutorPool } from "./workerPool/executorPool"
import * as os from "os"

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

export const getInstance = () => TvmRunnerAsynchronous.getShared()