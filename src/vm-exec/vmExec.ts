// const VmExec: any = require('../vm-exec/vm-exec')
const VmExec: any = require('/Users/altox/Desktop/ton/build/crypto/vm-exec.js')

let vmExecInitialized = false
let onVmExecInit = () => {}

VmExec.onRuntimeInitialized = () => {
    vmExecInitialized = true
    onVmExecInit()
}

export async function initializeVmExec() {
    if (vmExecInitialized) {
        return
    }

    await new Promise<void>(resolve => {
        onVmExecInit = resolve
    })
}

export function vm_exec(config: string) {
    let bytes = VmExec.intArrayFromString(config)
    let ref = VmExec.allocate(bytes, VmExec.ALLOC_NORMAL)
    let res = VmExec._vm_exec(bytes.length - 1, ref)
    let out = {
        result: VmExec.UTF8ToString(res)
    }
    return out
}