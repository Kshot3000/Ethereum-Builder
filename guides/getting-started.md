# Getting started — Ethereum L1 and its Layer 2s

Verified official resources (all links checked live at launch, 2026-10-13). By Kyle Cox, [@kshot9000](https://x.com/kshot9000) — [github.com/Kshot3000](https://github.com/Kshot3000).

## Ethereum L1

- [ethereum.org](https://ethereum.org) — the official portal: protocol and developer documentation. Team: [@ethereum](https://github.com/ethereum) on GitHub, [@ethereum](https://x.com/ethereum) on X.
- [viem](https://viem.sh) / [github.com/wevm/viem](https://github.com/wevm/viem) — the TypeScript interface I use and contribute to (my PRs #5176 and #5196 are merged there).
- [ethers.js](https://github.com/ethers-io/ethers.js) — complete Ethereum library and wallet implementation in JavaScript.
- Clients: [reth](https://github.com/paradigmxyz/reth) (Rust execution), [Lodestar](https://github.com/ChainSafe/lodestar) (TypeScript consensus), [Prysm](https://github.com/OffchainLabs/prysm) (Go consensus).
- Standards: [ethereum/ERCs](https://github.com/ethereum/ERCs) — the ERC repository.
- The [OP Stack monorepo](https://github.com/ethereum-optimism/optimism) — the rollup framework Base is built on.

## Base

- [base.org](https://www.base.org) — Coinbase's Ethereum L2. Team: [@base](https://github.com/base) on GitHub, [@base](https://x.com/base) on X.
- [docs.base.org](https://docs.base.org) — Base developer documentation: deploy, bridge, and build.

## Unichain

- [unichain.org](https://www.unichain.org) — Uniswap's Ethereum L2, designed for DeFi. Team: [@Uniswap](https://github.com/Uniswap) on GitHub, [@Uniswap](https://x.com/Uniswap) and [@unichain](https://x.com/unichain) on X.

## Robinhood Chain

- [robinhood.com/us/en/chain/](https://robinhood.com/us/en/chain/) — Robinhood's official chain page.
- [docs.robinhood.com/chain](https://docs.robinhood.com/chain) — official developer docs. In brief, per those docs: a permissionless, EVM-compatible Ethereum L2 built on Arbitrum technology, using ETH as its gas token, aimed at tokenized real-world assets and onchain finance, and described there as live. Team: [@robinhood](https://github.com/robinhood) on GitHub, [@RobinhoodApp](https://x.com/RobinhoodApp) on X.

## Working rules I build by

- Exact math only: wei/gwei/ETH amounts are BigInt decimal strings, never floats.
- Verify before claiming: reproduce a bug red, fix it, prove it green, then open the PR.
- Testnet is labelled testnet; models are labelled models; no demo data is ever presented as live chain data.

Support my Ethereum work — ETH: `0x4b48c98cd9d99d00dafe5cc4bb9e965345c5b15a`

Independent guide — I am not affiliated with the Ethereum Foundation, Base, Uniswap, or Robinhood.
