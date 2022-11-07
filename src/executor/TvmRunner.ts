import {TVMExecuteConfig, TVMExecutionResult} from "./executor";

export interface TvmRunner {
    invoke(config: TVMExecuteConfig): Promise<TVMExecutionResult>
}