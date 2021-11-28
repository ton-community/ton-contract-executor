import {exec} from "child_process";

export async function execAsync(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, (err, stdout, stderr) => {
            if (stderr.length > 0) {
                reject(stderr)
                return
            }
            resolve(stdout)
        })
    })
}
