import {join} from "path";
import {tmpdir} from "os";
import {unlink, writeFile} from "fs/promises";

export async function createTempFile(data: string) {
    let name = (Math.random() * 100000).toString(16)
    let path = join(tmpdir(), name)


    await writeFile(path, data, {encoding: 'utf-8'})

    return {
        path,
        destroy: async () => {
            await unlink(path)
        }
    }
}