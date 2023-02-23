# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2023-02-23

This release drops the old `ton` dependency in favor of the new `ton-core` package. This release contains breaking changes.

### Added

- Added `smartContract.sendMessage` method that accepts a `Message` from `ton-core`, as well as the old optional `opts` argument with the gas limits
- Added helpers for creating `Message`s: `internal` and `externalIn`
- Added helpers for creating `CommonMessageInfo`: `internalInfo` and `externalInInfo`

### Changed

All of the following changes are breaking.

- Changed `ton` peer dependency to `ton-core` and `ton-crypto` peer dependencies
- `stackInt` helper now accepts `number|bigint` instead of `number|BN`
- Fields `balance` and `randSeed` of `C7Config` are now of type `bigint` instead of `BN`
- `NormalizedStackEntry` now has a `bigint` variant instead of the old `BN` one
- Both `smartContract.sendInternalMessage` and `smartContract.sendExternalMessage` now accept `Message` as their first argument instead of `InternalMessage` or `ExternalMessage`. They are now aliases for `smartContract.sendMessage` that only check the type of the provided message
- `smartContract.setBalance` now accepts `bigint` instead of `BN`
- `SendMsgAction` now has `message: MessageRelaxed` instead of `message: RawMessageRelaxed`
- `ReserveCurrencyAction` now has `currency: CurrencyCollection` instead of `currency: RawCurrencyCollection`

### Removed

- Removed `bn.js` dependency