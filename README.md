# TON Contract Executor

This library allows you to run Ton Virtual Machine locally and execute contract.
That allows you to write & debug & fully test your contracts before launching them to the network.

## Features

TON Contract executor allows you to: 

- execute smart contracts from existing code and data Cells
- get TVM execution logs
- debug your contracts via debug primitives
- seamlessly handle internal state changes of contract data and code
- call so-called get methods of smart contracts
- send and debug internal and external messages
- debug messages sent by smart contract
- manipulate the C7 register of the smart contract (including time, random seed, network config, etc.)
- make some gas optimizations

**Basically you can develop, debug, and fully cover your contract with unit-tests fully locally without deploying it to the network**

## Installation

```bash
yarn add ton-contract-executor
```

## How it works 
This package internally uses original TVM which runs on actual validator nodes to execute smart contracts.
TVM is built to WASM so this library could be used on any platform.
We also added some layer of abstraction on top of original TVM to allow it to run contracts via JSON configuration (those changes could be found [here](https://github.com/ton-community/ton-blockchain/tree/vm-exec/crypto/vm-exec))

## Usage

Usage is pretty straightforward: first of all, you should create an instance of SmartContract.
You could think of SmartContract as an existing deployed smart contract with which you can communicate.


Creating SmartContract from FunC source code (here the `@ton-community/func-js` package is used for compilation):
```typescript
import { compileFunc } from "@ton-community/func-js";
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

    const compileResult = await compileFunc({
        sources: {
            'contract.fc': source,
        },
        entryPoints: ['contract.fc'],
    })

    if (compileResult.status === 'error') throw new Error('compilation failed')

    const contract = await SmartContract.fromCell(
        Cell.fromBoc(Buffer.from(compileResult.codeBoc, 'base64'))[0],
        new Cell(),
    )
}
```

In some cases it's useful to create SmartContract from existing precompiled code Cell & data Cell.
For example if you need to debug some existing contract from network.

Here is an example of creating a local copy of existing wallet smart contract from the network deployed at ``EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t`` address and getting its seq:

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

Once you have created instance of SmartContract you can start interacting with it.

### Invoking get methods

You can invoke any get method on contract using ```invokeGetMethod``` function:

```typescript
import { SmartContract, stackInt } from "ton-contract-executor";
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

    const compileResult = await compileFunc({
        sources: {
            'contract.fc': source,
        },
        entryPoints: ['contract.fc'],
    })

    if (compileResult.status === 'error') throw new Error('compilation failed')

    const contract = await SmartContract.fromCell(
        Cell.fromBoc(Buffer.from(compileResult.codeBoc, 'base64'))[0],
        new Cell(),
    )
    
    const res = await contract.invokeGetMethod('sum', [
        // argument a
        stackInt(1),
        // argument b
        stackInt(2),
    ])
    
    console.log('1 + 2 = ', res.result[0])
}
```

You can create arguments of other types for get methods using exported functions `stackInt`, `stackCell`, `stackSlice`, `stackTuple` and `stackNull`.

### Sending messages to contract

You can send both external and internal messages to your contract via calling ```sendInternalMessage``` or ```sendExternalMessage```:

```typescript
import { SmartContract } from "ton-contract-executor";
import { Cell, InternalMessage, CommonMessageInfo, CellMessage } from "ton";

async function main() {
    const contract = await SmartContract.fromCell(
        Cell.fromBoc(Buffer.from(compileResult.codeBoc, 'base64'))[0],
        new Cell(),
    )
    
    const msgBody = new Cell()
    
    const res = await this.contract.sendInternalMessage(new InternalMessage({
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

### Setting gas limits

`invokeGetMethod`, `sendInternalMessage`, `sendExternalMessage` all support last optional `opts?: { gasLimits?: GasLimits; }` argument for setting gas limits.
As an example, the following code

```typescript
import { compileFunc } from "@ton-community/func-js";
import { SmartContract, stackInt } from "ton-contract-executor";
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

    const compileResult = await compileFunc({
        sources: {
            'contract.fc': source,
        },
        entryPoints: ['contract.fc'],
    })

    if (compileResult.status === 'error') throw new Error('compilation failed')

    let contract = await SmartContract.fromCell(
        Cell.fromBoc(Buffer.from(compileResult.codeBoc, 'base64'))[0],
        new Cell(),
    )

    console.log(await contract.invokeGetMethod('sum', [
        stackInt(1),
        stackInt(2),
    ], {
        gasLimits: {
            limit: 308,
        },
    }))
}
```
will output a `failed` execution result to console, because such a call requires 309 gas.

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

### Configuration of SmartContract

You also can configure some parameters of your smart contract:

```fromCell``` accepts configuration object as third parameter:

```typescript
type SmartContractConfig = {
    getMethodsMutate: boolean;  // this allows you to use set_code in get methods (useful for debugging)
    debug: boolean;             // enables or disables TVM logs (it's useful to disable logs if you rely on performance)
    runner: TvmRunner;
};
```

TvmRunner allows you to select TVM executor for specific contract, by default all contracts use ```TvmRunnerAsynchronous``` which runs thread pool of WASM TVM (it uses worker_threads on node and web workers when bundled for web).

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

### Termination of worker threads

In order for your tests to terminate successfully, you need to terminate the spawned worker threads, which can be done as follows:

```typescript
import {TvmRunnerAsynchronous} from "ton-contract-executor";

await TvmRunnerAsynchronous.getShared().cleanup()
```

### Shipping to web

`ton-contract-executor` can be bundled using webpack, but a polyfill for `Buffer` is required.

This can be done by installing the `buffer` package and adding the following to your webpack configuration:

```js
  resolve: {
    fallback: {
      "buffer": require.resolve("buffer/")
    }
  }
```

However, if you are using `@ton-community/func-js` for compilation, you also need polyfills for `crypto` and `stream` (`crypto-browserify` and `stream-browserify` respectively), and add the following to your webpack configuration:

```js
  resolve: {
    fallback: {
      "fs": false,
      "path": false,
      "crypto": require.resolve("crypto-browserify"),
      "stream": require.resolve("stream-browserify"),
      "buffer": require.resolve("buffer/")
    }
  }
```

### Building the WASM part

If you need to build the WASM part of this package, you can use [this repo](https://github.com/ton-community/ton-vm-exec-builder)

# License

MIT
