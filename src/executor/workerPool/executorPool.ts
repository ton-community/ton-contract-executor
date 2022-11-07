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
    onMessage(handler: (msg: WorkerResponseMessage) => void): void
    postMessage(msg: WorkerRequestMessage): void
    terminate(): void
}

export class ExecutorPool {
    private reqNo = 0
    private workers: ExecutorWorker[] = []
    private tasks = new Map<number, (result: TVMExecutionResult) => void>()
    private processingRequestsCount = 0
    
    constructor(
        private readonly maxSize: number,
        private readonly createWorker: () => ExecutorWorker,
    ) {}
        
    private addWorker() {
        const worker = this.createWorker()
        worker.onMessage(msg => {
            this.processingRequestsCount--
            this.onWorkerMessage(msg)
        })
        this.workers.push(worker)
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
        const requestId = this.reqNo++
        let workerIdx = requestId % this.workers.length
        if (this.workers.length === 0 || (this.workers.length < this.maxSize && this.processingRequestsCount > 0)) {
            this.addWorker()
            workerIdx = this.workers.length - 1
        }
        const worker = this.workers[workerIdx]
        
        this.processingRequestsCount++

        // The promise callback needs to be set before `postMessage` because the web fallback worker is not actually async
        const p = new Promise<TVMExecutionResult>(resolve => {
            this.tasks.set(requestId, resolve)
        })

        worker.postMessage({
            id: requestId,
            config
        })
        
        return p
    }
    
    public canCleanup() {
        return this.processingRequestsCount <= 0
    }
    
    public async cleanup() {
        if (!this.canCleanup()) {
            throw new Error('cant cleanup now')
        }
        const workers = this.workers
        this.workers = []
        for (const worker of workers) {
            await worker.terminate()
        }
    }
}