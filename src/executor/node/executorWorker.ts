import {parentPort} from "worker_threads";
import {runTVM} from "../executor";
import { WorkerRequestMessage, WorkerResponseMessage } from "../workerPool/executorPool";

if (!parentPort) {
    throw new Error('This code should be executed in worker thread')
}

parentPort.on('message', async (msg: WorkerRequestMessage) => {
    const response: WorkerResponseMessage = {
        id: msg.id,
        result: await runTVM(msg.config)
    }
    parentPort!.postMessage(response)
})