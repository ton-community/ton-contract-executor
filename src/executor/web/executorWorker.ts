import {runTVM} from "../executor";
import {WorkerRequestMessage, WorkerResponseMessage} from "../workerPool/executorPool";

const run = async (msg: WorkerRequestMessage) => {
    const response: WorkerResponseMessage = {
        id: msg.id,
        result: await runTVM(msg.config)
    }
    self.postMessage(response)
}

self.onmessage = (msg) => {
    run(msg.data)
}