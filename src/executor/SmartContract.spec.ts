import {bocToCell, cellToBoc, SmartContract} from "./SmartContract";
import {Address, Cell, CellMessage, CommonMessageInfo, ExternalMessage, InternalMessage, Slice, toNano} from "ton";
import {
    getSelectorForMethod,
    runTVM,
    TVMStack,
    TVMStackEntryCell,
    TVMStackEntryInt,
    TVMStackEntryTuple
} from "./executor";
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

        let res = await contract.invokeGetMethod('test', [{type: 'cell', value: await cellToBoc(cell)}])

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

        let res = await contract.invokeGetMethod('test', [{type: 'int', value: '123'}])

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
                {type: 'int', value: '1'},
                {type: 'int', value: '2'},
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

        let contract = await SmartContract.fromFuncSource(source, dataCell, {getMethodsMutate: true})

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


    it('123', async () => {
        let code = Cell.fromBoc(Buffer.from('te6cckECEwEAAf4AART/APSkE/S88sgLAQIBYgIDAgLNBAUCASANDgIBIAYHAgFICwwD7UIMcAkVvgAdDTAwFxsJFb4PpAMO1E0PpA0z/U1NQwBtMf0z+CEGk9OVBSMLqOKRZfBgLQEoIQqMsArXCAEMjLBVAFzxYk+gIUy2oTyx/LPwHPFsmAQPsA4DFRZccF8uGRIMAB4wIgwALjAjQDwAPjAl8FhA/y8ICAkKAC1QHIyz/4KM8WyXAgyMsBE/QA9ADLAMmABiMATTP1MTu/LhklMTugH6ANQwJxA0WfAFjhMBpEQzAshQBc8WE8s/zMzMye1Ukl8F4gCiMHAF1DCON4BA9JZvpSCOKQikIIEA+r6T8sGP3oEBkyGgUye78vQC+gDUMCJURjDwBSW6kwSkBN4Gkmwh4rPmMDRANMhQBc8WE8s/zMzMye1UACgD+kAwQzTIUAXPFhPLP8zMzMntVAAbPkAdMjLAhLKB8v/ydCAAPRa8ANwIfAEd4AYyMsFWM8WUAT6AhPLaxLMzMlx+wCACASAPEAAlvILfaiaH0gaZ/qamoYLehqGCxABDuLXTHtRND6QNM/1NTUMBAkXwTQ1DHUMNBxyMsHAc8WzMmAIBIBESAC+12v2omh9IGmf6mpqGDYg6GmH6Yf9IBhAALbT0faiaH0gaZ/qamoYCi+CeAG4APgCQFlTuZA==', 'base64'))[0]
        let data = Cell.fromBoc(Buffer.from('te6cckECEAEAAjEAA1OAELqUWZGOV7pY/Xe2uVyCHyPk9dz7nCpp12KwXLj2+N0AAAAAAAAAAJABAgMCAAQFART/APSkE/S88sgLBgBLABkD6IAQupRZkY5Xulj9d7a5XIIfI+T13PucKmnXYrBcuPb43RAAbAFpcGZzOi8vUW1ZbkN4YXRvUXhDNXFYS3l3OXFlZ2hBWFNibzVEZE5qMjh2MUh2aUN6RzVTWQAAAgFiBwgCAs4JCgAJoR+f4AMCASALDAAdQDyMs/WM8WAc8WzMntVIAqMMiHHAJJfA+DQ0wMBcbCSXwPg+kAw8AEEs44RMDI0UgLHBfLhlQH6QNQw8ALgBdMf0z+CEF/MPRRSMLrjAjA0NTWCEC/LJqIUuuMCXwSED/LwgDQ4AOztRNDTP/pAINdJwgCafwH6QNQwECQQI+AwcFltbYAH8MhA2XiIBUSTHBfLhkQH6QPpA0gAx+gCCCvrwgBqhIaEgwgDy4ZIhjj6CEAUTjZHIUAjPFlAKzxZxJEgUVEaQcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wAQNpQQKTZb4ibXCwHDAJQQJmwx4w1VAvACDwB2cIIQi3cXNQTIy/9QBc8WECQQI4BAcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wAAZIIQ1TJ22xA3RARtcXCAEMjLBVAHzxZQBfoCFctqEssfyz8ibrOUWM8XAZEy4gHJAfsAbyu4Ig==', 'base64'))[0]

        let contract = await SmartContract.fromCell(code, data)
        let res = await contract.invokeGetMethod('get_nft_address_by_index', [{ type: 'int', value: '1' }])
        console.log(res)
    })
})