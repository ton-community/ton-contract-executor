import {ExecutorWorker, WorkerRequestMessage, WorkerResponseMessage} from "../workerPool/executorPool"
import {Worker} from "worker_threads"
import * as os from "os"

class NodeExecutorWorker implements ExecutorWorker {
    constructor(
        private readonly worker: Worker,
    ) {}

    onMessage(handler: (msg: WorkerResponseMessage) => void): void {
        this.worker.on('message', handler);
    }

    postMessage(msg: WorkerRequestMessage): void {
        this.worker.postMessage(msg)
    }

    terminate() {
        this.worker.terminate()
    }
}

export const createWorker = (): ExecutorWorker => {
    if (__filename.endsWith('.ts')) {
        return new NodeExecutorWorker(new Worker(__dirname + '/worker.js', {
            workerData: {
                path: './executorWorker.ts'
            }
        }))
    } else {
        return new NodeExecutorWorker(new Worker(__dirname + '/executorWorker.js'))
    }
}

export const maxWorkers = () => Math.max(2, os.cpus().length / 2)