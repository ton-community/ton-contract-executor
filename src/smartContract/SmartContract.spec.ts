import {SmartContract, SmartContractConfig} from "./SmartContract";
import {Address, beginCell, Cell, Slice, storeMessage, toNano} from "@ton/core";
import {TVMStackEntryTuple} from "../executor/executor";
import {cellToBoc} from "../utils/cell";
import {SendMsgAction} from "../utils/parseActionList";
import {TvmRunnerAsynchronous} from "../executor/TvmRunnerAsynchronous";
import {compileFunc} from "@ton-community/func-js";
import {stdlib} from "./stdlib.fc";
import { externalIn, internal } from "../utils/message";

const smcFromSource = async (source: string, data: Cell, config?: Partial<SmartContractConfig>) => {
    const cr = await compileFunc({
        sources: {
            'main.fc': '#include "stdlib.fc";\n' + source,
            'stdlib.fc': stdlib,
        },
        entryPoints: ['main.fc'],
    });

    if (cr.status === 'error') {
        throw new Error('compilation failed: ' + cr.message);
    }

    return await SmartContract.fromCell(Cell.fromBoc(Buffer.from(cr.codeBoc, 'base64'))[0], data, config);
};

describe('SmartContract', () => {
    jest.setTimeout(15000)

    it('should run basic contract', async () => {
        const source = `
            () main() {
                ;; noop
            }

            int test() method_id {
                return 777;
            }
        `
        let contract = await smcFromSource(source, new Cell())
        let res = await contract.invokeGetMethod('test', [])

        expect(res.result[0]).toEqual(777n)
    })

    it('should fail when out of gas', async () => {
        const source = `
            () main() {
                ;; noop
            }

            int test() method_id {
                return 777;
            }
        `
        let contract = await smcFromSource(source, new Cell())
        let res = await contract.invokeGetMethod('test', [], {
            gasLimits: {
                limit: 324,
            }
        })

        expect(res.type).toBe('failed')
        expect(res.exit_code).toBe(-14) // out of gas (-14 = ~(13), check C++ TVM code)
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
        let contract = await smcFromSource(source, new Cell())
        let cell = beginCell()
            .storeUint(0xFFFFFFFF, 32)
            .endCell()

        let res = await contract.invokeGetMethod('test', [{type: 'cell', value: cellToBoc(cell) }])

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
        let contract = await smcFromSource(source, new Cell())

        let res = await contract.invokeGetMethod('test', [{type: 'int', value: '123'}])

        expect(res.result[0]).toEqual(123n)
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
        let contract = await smcFromSource(source, new Cell())

        let tuple: TVMStackEntryTuple = {
            type: 'tuple',
            value: [
                {type: 'int', value: '1'},
                {type: 'int', value: '2'},
            ]
        }

        let res = await contract.invokeGetMethod('test', [tuple])
        expect(res.result[0]).toEqual([
            1n,
            2n,
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
        let dataCell = beginCell()
            .storeUint(0, 32)
            .endCell()

        let contract = await smcFromSource(source, dataCell, {getMethodsMutate: true})

        let res = await contract.invokeGetMethod('test', [])
        expect(res.result[0]).toEqual(0n)

        let res2 = await contract.invokeGetMethod('test', [])
        expect(res2.result[0]).toEqual(1n)

        let res3 = await contract.invokeGetMethod('test', [])
        expect(res3.result[0]).toEqual(2n)
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
        let contract = await smcFromSource(source, new Cell())
        contract.setUnixTime(now)
        let res = await contract.invokeGetMethod('get_time', [])

        expect(res.result[0]).toEqual(BigInt(now))
    })

    it('should handle custom balance', async () => {
        const source = `
            () main() {
                ;; noop
            }

            int my_balance() method_id {
                [int res, cell a] = get_balance();
                return res;
            }
        `
        let contract = await smcFromSource(source, new Cell())
        contract.setBalance(777n)
        let res = await contract.invokeGetMethod('my_balance', [])

        expect(res.result[0]).toEqual(777n)
    })

    it('should handle internal messages', async () => {
        const source = `
            (cell, slice) recv_internal(int smc_balance, int msg_value, cell msg, slice msg_body) {
                throw_if(403, smc_balance != 1000000500);
                return (msg, msg_body);
            }
        `

        let contract = await smcFromSource(source, new Cell())
        contract.setBalance(500n);
        let bodyCell = beginCell()
            .storeUint(777, 256)
            .endCell()

        let msg = internal({
            dest: Address.parse('EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t'),
            value: toNano(1),
            bounce: false,
            body: bodyCell,
        })

        let res = await contract.sendInternalMessage(msg)
        expect(res.exit_code).toEqual(0)
        let [resCell, resBody] = res.result as [Cell, Slice]
        expect(resCell.equals(beginCell().storeWritable(storeMessage(msg)).endCell())).toBeTruthy()
        expect(resBody.asCell().equals(bodyCell)).toBeTruthy()
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

        let contract = await smcFromSource(source, new Cell())
        let bodyCell = beginCell()
            .storeUint(777, 256)
            .endCell()

        let msg = externalIn({
            dest: Address.parse('EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t'),
            body: bodyCell,
        })

        let res = await contract.sendExternalMessage(msg)
        let [resCell, resBody] = res.result as [Cell, Slice]
        expect(resCell.equals(beginCell().storeWritable(storeMessage(msg)).endCell())).toBeTruthy()
        expect(resBody.asCell().equals(bodyCell)).toBeTruthy()
    })

    it('should return actions', async () => {
        const source = `
            () send_money(slice address, int amount) impure inline {
                var msg = begin_cell()
                    .store_uint(0x10, 6) ;; nobounce
                    .store_slice(address)
                    .store_grams(amount)
                    .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
                    .end_cell();
            
                send_raw_message(msg, 64);
            }    
                     
            () recv_internal(int my_balance, int msg_value, cell in_msg_full, slice in_msg_body) {
                slice cs = in_msg_full.begin_parse();
                int flags = cs~load_uint(4);
                slice sender_address = cs~load_msg_addr();    
                send_money(sender_address, 1);
                return ();
            }
        `

        let contract = await smcFromSource(source, new Cell())

        let res = await contract.sendInternalMessage(internal({
            dest: Address.parse('EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t'),
            value: toNano(1),
            bounce: false,
            body: new Cell(),
        }))
        expect(res.actionList).toHaveLength(1)
        let msgAction = res.actionList[0] as SendMsgAction
        expect(msgAction.type).toEqual('send_msg')
        expect(msgAction.mode).toEqual(64)
    })

    it('should handle code change', async () => {
        const source = `      
            () recv_internal(int my_balance, int msg_value, cell in_msg_full, slice in_msg_body) {
                set_code(begin_cell().end_cell());
                return ();
            }
        `
        let contract = await smcFromSource(source, new Cell())
        let res = await contract.sendInternalMessage(internal({
            dest: Address.parse('EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t'),
            value: toNano(1),
            bounce: false,
            body: new Cell(),
        }))

        expect(contract.codeCell.equals(new Cell())).toBe(true)
    })

    it('should handle exceptions', async () => {
        const source = `
            () main() {
                ;; noop
            }

            int test() method_id {
                throw(777);
                return 777;
            }
        `
        let contract = await smcFromSource(source, new Cell())
        let res = await contract.invokeGetMethod('test', [])
        expect(res.exit_code).toEqual(777)
    })

    it('should handle exceptions handlers', async () => {
        const source = `
            forall X -> int is_int(X x) asm "<{ TRY:<{ 0 PUSHINT ADD DROP -1 PUSHINT }>CATCH<{ 2DROP 0 PUSHINT }> }>CONT 1 1 CALLXARGS";
                  
            () main() {
                ;; noop
            }
            
            int test() method_id {
                var value = begin_cell().end_cell();
                return is_int(value);
            }
        `
        let contract = await smcFromSource(source, new Cell())
        let res = await contract.invokeGetMethod('test', [])
        expect(res.exit_code).toEqual(0)
    })

    afterAll(async () => {
        // close all opened threads
        await TvmRunnerAsynchronous.getShared().cleanup()
    })
})