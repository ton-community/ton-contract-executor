import {RawCommonMessageInfo, RawCurrencyCollection, RawMessage, RawStateInit, Slice} from "ton";

export function readCurrencyCollection(slice: Slice): RawCurrencyCollection {
    const coins = slice.readCoins();
    if (slice.readBit()) {
        throw Error('Currency collctions are not supported yet');
    }
    return { coins };
}

function readCommonMsgInfo(slice: Slice): RawCommonMessageInfo {

    if (!slice.readBit()) {
        // Internal
        let ihrDisabled = slice.readBit();
        let bounce = slice.readBit();
        let bounced = slice.readBit();
        let src = slice.readAddress();
        let dest = slice.readAddress();
        let value = readCurrencyCollection(slice);
        let ihrFee = slice.readCoins();
        let fwdFee = slice.readCoins();
        let createdLt = slice.readUint(64);
        let createdAt = slice.readUintNumber(32);
        return {
            type: 'internal',
            ihrDisabled,
            bounce,
            bounced,
            src,
            dest,
            value,
            ihrFee,
            fwdFee,
            createdLt,
            createdAt
        }
    } else if (slice.readBit()) {
        // Outgoing external
        let src = slice.readAddress();
        let dest = slice.readAddress();
        let createdLt = slice.readUint(64);
        let createdAt = slice.readUintNumber(32);
        return {
            type: 'external-out',
            src,
            dest,
            createdLt,
            createdAt
        }
    } else {
        // Incoming external
        let src = slice.readAddress();
        let dest = slice.readAddress();
        let importFee = slice.readCoins()
        return {
            type: 'external-in',
            src,
            dest,
            importFee
        }
    }
}

function readStateInit(slice: Slice) {
    if (slice.readBit()) {
        throw Error('Unsupported');
    }
    if (slice.readBit()) {
        throw Error('Unsupported');
    }
    const hasCode = slice.readBit();
    const code = hasCode ? slice.readCell() : null;
    const hasData = slice.readBit();
    const data = hasData ? slice.readCell() : null;
    if (slice.readBit()) {
        throw Error('Unsupported');
    }

    return { data, code };
}

export function readMessage(slice: Slice): RawMessage {
    const info = readCommonMsgInfo(slice);
    const hasInit = slice.readBit();
    let init: RawStateInit | null = null;
    if (hasInit) {
        if (!slice.readBit()) {
            init = readStateInit(slice);
        } else {
            init = readStateInit(slice.readRef());
        }
    }
    const body = slice.readBit() ? slice.readRef().toCell() : slice.toCell();

    return {
        info,
        init,
        body
    };
}