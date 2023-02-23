import { Address, Cell, CommonMessageInfo, ExternalAddress, Message } from "ton-core";

export type InternalMessageInfoParams = {
    src?: Address,
    dest: Address,
    value: bigint,
    bounce: boolean,
    bounced?: boolean,
    createdAt?: number,
    createdLt?: bigint,
    ihrDisabled?: boolean,
    ihrFee?: bigint,
    forwardFee?: bigint,
}

export function internalInfo(params: InternalMessageInfoParams): CommonMessageInfo {
    return {
        type: 'internal',
        ihrDisabled: params.ihrDisabled ?? true,
        ihrFee: params.ihrFee ?? 0n,
        bounce: params.bounce,
        bounced: params.bounced ?? false,
        src: params.src ?? new Address(0, Buffer.alloc(32)),
        dest: params.dest,
        value: { coins: params.value },
        forwardFee: params.forwardFee ?? 0n,
        createdAt: params.createdAt ?? 0,
        createdLt: params.createdLt ?? 0n,
    }
}

export type OtherMessageParams = {
    body: Cell
    init?: { code?: Cell, data?: Cell }
}

export type InternalMessageParams = InternalMessageInfoParams & OtherMessageParams

export function internal(params: InternalMessageParams): Message {
    return {
        body: params.body,
        info: internalInfo(params),
        init: params.init
    }
}

export type ExternalInMessageInfoParams = {
    src?: ExternalAddress
    dest: Address
    importFee?: bigint
}

export function externalInInfo(params: ExternalInMessageInfoParams): CommonMessageInfo {
    return {
        type: 'external-in',
        src: params.src,
        dest: params.dest,
        importFee: params.importFee ?? 0n,
    }
}

export type ExternalInMessageParams = ExternalInMessageInfoParams & OtherMessageParams

export function externalIn(params: ExternalInMessageParams): Message {
    return {
        body: params.body,
        info: externalInInfo(params),
        init: params.init
    }
}
