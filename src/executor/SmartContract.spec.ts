import {bocToCell, cellToBoc, SmartContract} from "./SmartContract";
import {Address, Cell, CellMessage, CommonMessageInfo, ExternalMessage, InternalMessage, Slice, toNano} from "ton";
import {TVMStackEntryCell, TVMStackEntryInt, TVMStackEntryTuple} from "./executor";
import BN from "bn.js";
import exp from "constants";

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

        expect(res.result[0]).toBeInstanceOf(BN)
        expect(res.result[0]).toEqual(new BN(777))
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

        expect(res.result[0]).toBeInstanceOf(Cell)
        expect((res.result[0] as Cell).toString()).toEqual(cell.toString())
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

        expect(res.result[0]).toBeInstanceOf(BN)
        expect(res.result[0]).toEqual(new BN(123))
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
        expect(res.result[0]).toEqual([
            new BN(1),
            new BN(2)
        ])
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
        expect(res.result[0]).toEqual(new BN(0))

        let res2 = await contract.invokeGetMethod('test', [])
        expect(res2.result[0]).toEqual(new BN(1))

        let res3 = await contract.invokeGetMethod('test', [])
        expect(res3.result[0]).toEqual(new BN(2))
    })

    it('should handle custom time', async () => {
        const source = `
            () main() {
                ;; noop
            }
        
            int get_time() method_id {
                return now();
            }
        `
        let now = Math.floor(Date.now() / 1000)
        let contract = await SmartContract.fromFuncSource(source, new Cell())
        contract.setUnixTime(now)
        let res = await contract.invokeGetMethod('get_time', [])

        expect(res.result[0]).toBeInstanceOf(BN)
        expect(res.result[0]).toEqual(new BN(now))
    })

    it('should handle internal messages', async () => {
        const source = `
            (cell, slice) recv_internal(int smc_balance, int msg_value, cell msg, slice msg_body) {
                return (msg, msg_body);
            }
        `

        let contract = await SmartContract.fromFuncSource(source, new Cell())
        let bodyCell = new Cell()
        bodyCell.bits.writeUint(777, 256)

        let msg = new InternalMessage({
            to: Address.parse('EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t'),
            value: toNano(1),
            bounce: false,
            body: new CommonMessageInfo({
                body: new CellMessage(bodyCell)
            })
        })

        let msgCell = new Cell()
        msg.writeTo(msgCell)

        let res = await contract.sendInternalMessage(msg)
        let [resCell, resBody] = res.result as [Cell, Slice]
        expect(resCell.toString()).toEqual(msgCell.toString())
        expect(resBody.toCell().toString()).toEqual(bodyCell.toString())
    })

    it('should handle external messages', async () => {
        const source = `
            (cell, slice) recv_internal(int smc_balance, int msg_value, cell msg, slice msg_body) {
                return (msg, msg_body);
            }
            
             (cell, slice) recv_external(int smc_balance, int msg_value, cell msg, slice msg_body) {
                return (msg, msg_body);
            }
        `

        let contract = await SmartContract.fromFuncSource(source, new Cell())
        let bodyCell = new Cell()
        bodyCell.bits.writeUint(777, 256)

        let msg = new ExternalMessage({
            to: Address.parse('EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t'),
            body: new CommonMessageInfo({
                body: new CellMessage(bodyCell)
            })
        })

        let msgCell = new Cell()
        msg.writeTo(msgCell)

        let res = await contract.sendExternalMessage(msg)
        let [resCell, resBody] = res.result as [Cell, Slice]
        expect(resCell.toString()).toEqual(msgCell.toString())
        expect(resBody.toCell().toString()).toEqual(bodyCell.toString())
    })
})