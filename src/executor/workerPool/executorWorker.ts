import {parentPort} from "worker_threads";
import {runTVM, TVMExecuteConfig} from "../executor";

if (!parentPort) {
    throw new Error('This code should be executed in worker thread')
}

type WorkerRequestMessage = {
    id: number
    config: TVMExecuteConfig
}

parentPort.on('message', async (msg: WorkerRequestMessage) => {
    let res = await runTVM(msg.config)
    parentPort!.postMessage({
        id: msg.id,
        result: res
    })
})