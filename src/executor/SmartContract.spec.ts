import {bocToCell, cellToBoc, SmartContract} from "./SmartContract";
import {Cell} from "ton";
import {TVMStackEntryCell, TVMStackEntryInt, TVMStackEntryTuple} from "./executor";

describe('SmartContract', () => {
    it('should run basic contract', async () => {
        const source = `
            () main() {
                ;; noop
            }
        
            int test() method_id {
                return 777;
            }
        `
        let contract = await SmartContract.fromFuncSource(source, new Cell())
        let res = await contract.invokeGetMethod('test', [])

        expect(res.stack[0].type).toEqual('int')
        expect((res.stack[0] as TVMStackEntryInt).value).toEqual('777')
    })

    it('handle cells', async () => {
        const source = `
            () main() {
                ;; noop
            }
        
            cell test(cell in_cell) method_id {
                return in_cell;
            }
        `
        let contract = await SmartContract.fromFuncSource(source, new Cell())
        let cell = new Cell()
        cell.bits.writeUint(0xFFFFFFFF, 32)

        let res = await contract.invokeGetMethod('test', [{ type: 'cell', value: await cellToBoc(cell) }])

        expect(res.stack[0].type).toEqual('cell')
        let receivedCell = bocToCell((res.stack[0] as TVMStackEntryCell).value)
        expect(receivedCell.toString()).toEqual(cell.toString())
    })

    it('handle integers', async () => {
        const source = `
            () main() {
                ;; noop
            }
        
            int test(int in_int) method_id {
                return in_int;
            }
        `
        let contract = await SmartContract.fromFuncSource(source, new Cell())

        let res = await contract.invokeGetMethod('test', [{ type: 'int', value: '123' }])

        expect(res.stack[0].type).toEqual('int')
        expect((res.stack[0] as TVMStackEntryInt).value).toEqual('123')
    })

    it('handle tuples', async () => {
        const source = `
            () main() {
                ;; noop
            }
        
            [int, int] test([int, int] in_tuple) method_id {
                return in_tuple;
            }
        `
        let contract = await SmartContract.fromFuncSource(source, new Cell())

        let tuple: TVMStackEntryTuple = {
            type: 'tuple',
            value: [
                { type: 'int', value: '1' },
                { type: 'int', value: '2' },
            ]
        }

        let res = await contract.invokeGetMethod('test', [tuple])
        expect(res.stack[0]).toEqual(tuple)
    })

    it('should update contract state between calls', async () => {
        const source = `
            () main() {
                ;; noop
            }
        
            int test() method_id {
                ;; Load seq from data
                slice ds = get_data().begin_parse();
                var seq = ds~load_uint(32);
                ds.end_parse();
                
                ;; Store new seq
                set_data(begin_cell().store_uint(seq + 1, 32).end_cell());
                
                return seq;
            }
        `
        let dataCell = new Cell()
        dataCell.bits.writeUint(0, 32)

        let contract = await SmartContract.fromFuncSource(source, dataCell, { getMethodsMutate: true })

        let res = await contract.invokeGetMethod('test', [])
        expect(res.stack[0]).toEqual({ type: 'int', value: '0' })

        let res2 = await contract.invokeGetMethod('test', [])
        expect(res2.stack[0]).toEqual({ type: 'int', value: '1' })

        let res3 = await contract.invokeGetMethod('test', [])
        expect(res3.stack[0]).toEqual({ type: 'int', value: '2' })
    })
})