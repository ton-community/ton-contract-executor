# TON Contract Executor

This library allows you to run Ton Virtual Machine locally and execute contract.
That allows you to write & debug & fully test your contracts before launching them to the network.

## Features

TON Contract executor allows you to: 

- execute smart contracts from FunC source code
- execute smart contracts from existing data & code Cells
- get TVM executing logs
- debug your contracts via debug primitives
- it handles internal state changes of contract data
- allows calling of so-called GET methods of smart contracts
- allows sending & debugging internal messages
- allows sending & debugging external messages
- allows debugging of messages sent by smart contract
- handle changes in smart contract code
- allows manipulations with C7 register of smart contract (including time, random seed, network config, etc.)
- allows you to make some gas optimizations

**Basically you can develop, debug, and fully cover your contract with unit-tests fully locally without deploying it to the network**

## Installation

```bash
yarn add ton-contract-executor
```

## How it works 
This package internally uses original TVM which runs on actual validator nodes to execute smart contract.
TVM build to WASM so this library could be used on any platform.
We also added some layer of abstraction on top of original TVM to allow it to run contracts via some JSON configurations (those changes could be found [here](https://github.com/Naltox/ton/tree/master/crypto/vm-exec))

## Usage

Usage is pretty straightforward: firstly you should create instance of SmartContract.
You could think of SmartContract as an existing deployed smart contract with which you can communicate.


Creating SmartContract from FunC source code:
```typescript
import { SmartContract } from "ton-contract-executor";
import { Cell } from "ton";

async function main() {
    const source = `
    () main() {
        ;; noop
    }

    int sum(int a, int b) method_id {
        return a + b;
    }
`

    let contract = await SmartContract.fromFuncSource(
        source,     // String with FunC source code of contract 
        new Cell()  // Data Cell (empty Cell in this case)
    )
}
```

In some cases it's useful to create SmartContract from existing precompiled code Cell & data cell.
For example if you need to debug some existing contract from network.

Here is an example of creating local copy of existing wallet smart contract from the network deployed at ``EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t`` address and getting it's seq:

```typescript
import {Address, Cell, TonClient} from "ton";
import {SmartContract} from "ton-contract-executor";

const contractAddress = Address.parse('EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t')

let client = new TonClient({
    endpoint: 'https://toncenter.com/api/v2/jsonRPC'
})

async function main() {
    let state = await client.getContractState(contractAddress)

    let code = Cell.fromBoc(state.code!)[0]
    let data = Cell.fromBoc(state.data!)[0]

    let wallet = await SmartContract.fromCell(code, data)

    let res = await wallet.invokeGetMethod('seqno', [])
    console.log('Wallet seq is: ', res.result[0])
}

```

## Interacting with contract

Once you have created instance of SmartContract you can start to interact with it.

### Invoking get methods

You can invoke any get method on contract using ```invokeGetMethod``` function:

```typescript
import { SmartContract } from "ton-contract-executor";
import { Cell } from "ton";

async function main() {
    const source = `
    () main() {
        ;; noop
    }

    int sum(int a, int b) method_id {
        return a + b;
    }
`

    let contract = await SmartContract.fromFuncSource(source, new Cell())
    
    let res = await contract.invokeGetMethod('sum', [
        // argument a
        { type: 'int', value: '1' },
        // argument b
        { type: 'int', value: '2' },
    ])
    
    console.log('1 + 2 = ', res.result[0])
}
```

### Sending messages to contract

You can send both external and internal messages to your contract via calling ```sendInternalMessage``` or ```sendExternalMessage```:

```typescript
import { SmartContract } from "ton-contract-executor";
import { Cell, InternalMessage, CommonMessageInfo, CellMessage  } from "ton";

async function main() {
    let contract = await SmartContract.fromFuncSource(source, new Cell())
    
    let msgBody = new Cell()
    
    let res = await this.contract.sendInternalMessage(new InternalMessage({
        to: contractAddress,
        from: from,
        value: 1, // 1 nanoton
        bounce: false,
        body: new CommonMessageInfo({
            body: new CellMessage(msgBody)
        })
    }))
}
```


### Execution result

As the result of calling ```sendInternalMessage```, ```sendExternalMessage``` or ```invokeGetMethod``` ExecutionResult object is returned.

ExecutionResult could be either successful or failed:

```typescript
declare type FailedExecutionResult = {
    type: 'failed';
    exit_code: number;
    gas_consumed: number;
    result: NormalizedStackEntry[];
    actionList: OutAction[];
    action_list_cell?: Cell;
    logs: string;
};
declare type SuccessfulExecutionResult = {
    type: 'success';
    exit_code: number;
    gas_consumed: number;
    result: NormalizedStackEntry[];
    actionList: OutAction[];
    action_list_cell?: Cell;
    logs: string;
};
declare type ExecutionResult = FailedExecutionResult | SuccessfulExecutionResult;
```

What is what: 

- exit_code: exit code of TVM
- result: resulting stack (basically the result of function in case of get methods) 
- gas_consumed: consumed gas amount
- actionList (list of output actions of smart contract, such as messages )
- action_list_cell: raw cell with serialized action list 
- logs: logs of TVM

###

### Configuration of SmartContract

You also can configure some parameters of your smart contract:

Firstly both ```fromFuncSource``` and ```fromCell``` accept configuration object as third parameter:

```typescript
type SmartContractConfig = {
    getMethodsMutate: boolean;  // this allows you to use set_code in get methods (usefull for debug)
    debug: boolean;             // enables or disables TVM logs (it's usefull to disable logs if you rely on performance)
    runner: TvmRunner;
};
```

TvmRunner allows you to select TVM executor for specific contract, by default all contracts use ```TvmRunnerAsynchronous``` which runs thread pool of wasm TVM.

### Contract time

By default, for each call to TVM current unixtime is set to C7 register, but you can change it by calling ```setUnixTime``` on SmartContract instance.

### C7 register

C7 register is used to access some external information in contract: 

```typescript
export declare type C7Config = {
    unixtime?: number;
    balance?: number;
    myself?: Address;
    randSeed?: BN;
    actions?: number;
    messagesSent?: number;
    blockLt?: number;
    transLt?: number;
    globalConfig?: Cell;
};
```

We prefill it by default, but you can change it by calling ```setC7Config``` or ```setC7```.

# License

MIT