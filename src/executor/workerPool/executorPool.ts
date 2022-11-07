import {TVMExecuteConfig, TVMExecutionResult} from "../executor";

export type WorkerResponseMessage = {
    id: number
    result: TVMExecutionResult
}

export type WorkerRequestMessage = {
    id: number
    config: TVMExecuteConfig
}

export interface ExecutorWorker {
    onMessage(handler: (msg: WorkerResponseMessage) => void): void;
    postMessage(msg: WorkerRequestMessage): void;
}

export class ExecutorPool {
    private reqNo = 0
    private workers: ExecutorWorker[] = []
    private tasks = new Map<number, (result: any) => void>()

    constructor(size: number, createWorker: () => ExecutorWorker) {
        this.setupWorkers(size, createWorker)
    }

    private setupWorkers(size: number, createWorker: () => ExecutorWorker) {
        for (let i = 0; i < size; i++) {
            const worker = createWorker()
            worker.onMessage(msg => this.onWorkerMessage(msg))
            this.workers.push(worker)
        }
    }

    private onWorkerMessage(message: WorkerResponseMessage) {
        let cb = this.tasks.get(message.id)
        if (!cb) {
            throw new Error('No callback was found for response: ' + JSON.stringify(message))
        }
        cb(message.result)
        this.tasks.delete(message.id)
    }

    execute(config: TVMExecuteConfig): Promise<TVMExecutionResult> {
        let requestId = this.reqNo++
        let worker = this.workers[requestId % this.workers.length]

        worker.postMessage({
            id: requestId,
            config
        })

        return new Promise(resolve => {
            this.tasks.set(requestId, resolve)
        })
    }
}