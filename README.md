# X2

Contracts for the X2 protocol.

The X2 protocol allows rebasing bull and bear tokens to be minted using any collateral token.
At anytime, all bull and bear tokens are redeemable for the collateral token at a 1:1 ratio.

The protocol uses [Chainlink](https://chain.link/) price feeds to determine rebasing amounts.
[More info](https://xvix.medium.com/x2-the-next-stage-for-xvix-b7dfbf59dee7).

## X2 Contracts

An overview of the X2 contracts.

### X2Factory

Allows market creation and determines fee amounts.

### X2Router

Router to deposit / withdraw collateral tokens in exchange for bull / bear tokens.
Provides convenience functions to support automatic ETH wrapping and unwrapping.

### X2Market

Manages collateral and rebasing of bull / bear tokens.

### X2Token

Rebasing tokens which reference an X2Market for its rebased value.

### X2Fee

Fee token that can be used to pay for protocol fees.

## Install Dependencies

If npx is not installed yet:
`npm install -g npx`

Install packages:
`npm i`

## Compile Contracts

`npx hardhat compile`

## Run Tests

`npx hardhat test`
