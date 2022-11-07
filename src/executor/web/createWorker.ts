import {runTVM} from "../executor"
import {ExecutorWorker, WorkerRequestMessage, WorkerResponseMessage} from "../workerPool/executorPool"

class WebExecutorWorker implements ExecutorWorker {
    constructor(
        private readonly worker: Worker,
    ) {}

    onMessage(handler: (msg: WorkerResponseMessage) => void): void {
        this.worker.onmessage = (msg) => handler(msg.data)
    }

    postMessage(msg: WorkerRequestMessage): void {
        this.worker.postMessage(msg)
    }

    terminate() {
        this.worker.terminate()
    }
}

class WebFallbackExecutorWorker implements ExecutorWorker {
    private handlers: ((msg: WorkerResponseMessage) => void)[] = []

    onMessage(handler: (msg: WorkerResponseMessage) => void): void {
        this.handlers.push(handler)
    }

    async postMessage(msg: WorkerRequestMessage): Promise<void> {
        const response: WorkerResponseMessage = {
            id: msg.id,
            result: await runTVM(msg.config),
        }
        this.handlers.forEach(h => h(response));
    }

    terminate() {
        // do nothing
    }
}

export const createWorker = (): ExecutorWorker => {
    if (window.Worker) {
        // The ignored error has to do with the fact that `import.meta` can only be used when "module" is "es2020" or higher.
        // Changing the "module" setting to silence this error creates more errors which are even harder to fix.
        // tsc still generates code even with that error.
        // @ts-ignore
        return new WebExecutorWorker(new Worker(new URL('./executorWorker.js', import.meta.url))) as unknown
    } else {
        return new WebFallbackExecutorWorker()
    }
}

export const maxWorkers = () => 2