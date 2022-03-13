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

    // it('should run basic contract', async () => {
    //     const source = `
    //         () main() {
    //             ;; noop
    //         }
    //
    //         slice test() method_id {
    //             return my_address();
    //         }
    //     `
    //     let contract = await SmartContract.fromFuncSource(source, new Cell())
    //     let res = await contract.invokeGetMethod('test', [])
    //     console.log((res.result[0] as Slice).readAddress())
    // })

    it('kek', async () => {

        const source = `
            () main() {
                ;; noop
            }

            int test(int a, int b) method_id {
                ~dump(123);
                var c = a + b;
                throw(c);
                return 0;
            }
        `
        let contract = await SmartContract.fromFuncSource(source, new Cell())
        let res = await contract.invokeGetMethod('test', [
            { type: 'int', value: '1'},
            { type: 'int', value: '1'}
        ])
        console.log(res)
        // console.log((res.result[0] as Slice).readAddress())
        //
        // const source = `
        //     () main() {
        //         ;; noop
        //     }
        //
        //     (int) sum(int a, int b) method_id {
        //         return (null());
        //     }
        // `
        // let contract = await SmartContract.fromFuncSource(source, new Cell())
        // let res = await contract.invokeGetMethod('sum', [
        //     { type: 'int', value: '123' },
        //     { type: 'int', value: '123' },
        // ])
        // console.log(res)
        // console.time('run')
        // for (let i = 0; i < 10000; i++) {
        //     let res = await contract.invokeGetMethod('sum', [
        //         { type: 'int', value: '123' },
        //         { type: 'int', value: '123' },
        //     ])
        //
        //     // console.log((res.result[0] as BN).toString())
        // }
        // console.timeEnd('run')
    })

    it('fails', async () => {
        let conf = {"function_selector":102491,"init_stack":[],"code":"te6cckECFwEAA1kAART/APSkE/S88sgLAQIBYgsCAgFYBAMAEbohfwAhAoXwiAIBIAYFAA20Xr4ATZAwAgFICAcADa/n+AEvgkACASAKCQAQqUbwAhA4XwgADqp98AIYXwgCAs4PDAIBIA4NAD0yFAEzxZYzxbLBwHPFskEyMs/UAPPFgHPFszMye1UgAFs7UTQ0z/6QCDXScIAjhL6QNTUMND6QPpA0wf6QDB/VXDgMHBtbW1tJBBXEFZtgAvNDIhxwCSXwPg0NMD+kAw8AIIs45SN18ENDVSIscF8uGVAvpA1PpA+kAwcMjLA8nQJBB4Q4jwA3AgghBQdW5rbXFwgBDIywVQB88WUAX6AhXLahLLH8s/Im6zlFjPFwGRMuIByQH7AOAK0x8hwADjAApxsJJfDOAJ0z+BYQBP6CEF/MPRRSsLqOjTo6EFkQSBA3XjIQNFjgMzuCEC/LJqJSkLqOPV8EMjMzcIIQi3cXNQPIy/9QBM8WFIBAcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wDgghD1MNhnUpC64wJQll8GghA9a4fHE7rjAl8EFBMSEQAIhA/y8ACIUgLHBfLhkwHUMCD7BNDtHu1TcIIQXLs6jlUCbYBAcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wAAlDj6QDAkUWQGEEUQNBAjSarwA3CCEK9XPYQEyMv/UAPPFl4hcXCAEMjLBVAHzxZQBfoCFctqEssfyz8ibrOUWM8XAZEy4gHJAfsAAfYwUUbHBfLhkQH6QPpA0gAx+gCCEAQsHYAcoSGhIMIA8uGSIY48ghAFE42RyCrPFlANzxZxJQROE1RI8HCAEMjLBVAHzxZQBfoCFctqEssfyz8ibrOUWM8XAZEy4gHJAfsAkjsw4iDXCwHDAJMwMjfjDRBWBEUVA3AB8AMVAGSCENUydttKAwRtcXCAEMjLBVAHzxZQBfoCFctqEssfyz8ibrOUWM8XAZEy4gHJAfsABgCyU5XHBfLhkdMfAYIQc2VsbLqORVR3Y1R3ZXEs8ANwghAFE42RIcgpzxYkzxYnVTBxcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wDyAN7ECS7k","data":"te6cckEBBAEApAAClQAAAAAAAAWCgB4YqLN6s4qNV0x/TKC6wZh/xp8ZRJODxfql8gPZrR2GMANN9C4ItRopMat+8eJomTS9CD4apIAXiupVrPi/zZPF8gIBAImAHWXV8v1GUyaOAk5BBDDpDrFRBulaV3rnP465NWdH5GewA6y6vl+oymTRwEnIIIYdIdYqIN0rSu9c5/HXJqzo/Iz0ACABAAMAEjE0MTAuanNvbj+x58g=","c7_register":{"type":"tuple","value":[{"type":"tuple","value":[{"type":"int","value":"124711402"},{"type":"int","value":"0"},{"type":"int","value":"0"},{"type":"int","value":"1647107993"},{"type":"int","value":"1647107993"},{"type":"int","value":"1647107993"},{"type":"int","value":"110894958258829614138638547189547827403311025075287829941656024060528280716567"},{"type":"tuple","value":[{"type":"int","value":"1000"},{"type":"null"}]},{"type":"cell_slice","value":"te6cckEBAQEAJAAAQ4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBK7IKd"},{"type":"cell","value":"te6cckEBAQEAAgAAAEysuc0="}]}]}}
        let res = await runTVM(conf as any)
        console.log(res)
        // conf = {"function_selector":102351,"init_stack":[],"code":"te6cckECFwEAA1kAART/APSkE/S88sgLAQIBYgsCAgFYBAMAEbohfwAhAoXwiAIBIAYFAA20Xr4ATZAwAgFICAcADa/n+AEvgkACASAKCQAQqUbwAhA4XwgADqp98AIYXwgCAs4PDAIBIA4NAD0yFAEzxZYzxbLBwHPFskEyMs/UAPPFgHPFszMye1UgAFs7UTQ0z/6QCDXScIAjhL6QNTUMND6QPpA0wf6QDB/VXDgMHBtbW1tJBBXEFZtgAvNDIhxwCSXwPg0NMD+kAw8AIIs45SN18ENDVSIscF8uGVAvpA1PpA+kAwcMjLA8nQJBB4Q4jwA3AgghBQdW5rbXFwgBDIywVQB88WUAX6AhXLahLLH8s/Im6zlFjPFwGRMuIByQH7AOAK0x8hwADjAApxsJJfDOAJ0z+BYQBP6CEF/MPRRSsLqOjTo6EFkQSBA3XjIQNFjgMzuCEC/LJqJSkLqOPV8EMjMzcIIQi3cXNQPIy/9QBM8WFIBAcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wDgghD1MNhnUpC64wJQll8GghA9a4fHE7rjAl8EFBMSEQAIhA/y8ACIUgLHBfLhkwHUMCD7BNDtHu1TcIIQXLs6jlUCbYBAcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wAAlDj6QDAkUWQGEEUQNBAjSarwA3CCEK9XPYQEyMv/UAPPFl4hcXCAEMjLBVAHzxZQBfoCFctqEssfyz8ibrOUWM8XAZEy4gHJAfsAAfYwUUbHBfLhkQH6QPpA0gAx+gCCEAQsHYAcoSGhIMIA8uGSIY48ghAFE42RyCrPFlANzxZxJQROE1RI8HCAEMjLBVAHzxZQBfoCFctqEssfyz8ibrOUWM8XAZEy4gHJAfsAkjsw4iDXCwHDAJMwMjfjDRBWBEUVA3AB8AMVAGSCENUydttKAwRtcXCAEMjLBVAHzxZQBfoCFctqEssfyz8ibrOUWM8XAZEy4gHJAfsABgCyU5XHBfLhkdMfAYIQc2VsbLqORVR3Y1R3ZXEs8ANwghAFE42RIcgpzxYkzxYnVTBxcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wDyAN7ECS7k","data":"te6cckEBBAEApAAClQAAAAAAAAWCgB4YqLN6s4qNV0x/TKC6wZh/xp8ZRJODxfql8gPZrR2GMANN9C4ItRopMat+8eJomTS9CD4apIAXiupVrPi/zZPF8gIBAImAHWXV8v1GUyaOAk5BBDDpDrFRBulaV3rnP465NWdH5GewA6y6vl+oymTRwEnIIIYdIdYqIN0rSu9c5/HXJqzo/Iz0ACABAAMAEjE0MTAuanNvbj+x58g=","c7_register":{"type":"tuple","value":[{"type":"tuple","value":[{"type":"int","value":"124711402"},{"type":"int","value":"0"},{"type":"int","value":"0"},{"type":"int","value":"1647107993"},{"type":"int","value":"1647107993"},{"type":"int","value":"1647107993"},{"type":"int","value":"59973973734093318746286134922331222865219200399078489805921293097098882945499"},{"type":"tuple","value":[{"type":"int","value":"1000"},{"type":"null"}]},{"type":"cell_slice","value":"te6cckEBAQEAJAAAQ4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABBK7IKd"},{"type":"cell","value":"te6cckEBAQEAAgAAAEysuc0="}]}]}}
        // res = await runTVM(conf as any)
        // console.log(res)
    })
})