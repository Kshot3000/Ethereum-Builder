# Ethereum Builder

**Build and fix code on Ethereum and its Layer 2s — Base, Unichain, and Robinhood Chain.**

Live hub: https://kshot3000.github.io/Ethereum-Builder/

I'm Kyle Cox (@kshot9000), an independent builder. This repo is my home base for Ethereum work: an hourly loop builds and fixes code here, hunts verified bugs upstream across the Ethereum ecosystem, and ships tested, honest tools to the hub site. Progress digests land in [issue #1](https://github.com/Kshot3000/Ethereum-Builder/issues/1) (find it in the repo's Issues tab).

## My Ethereum record so far

- **wevm/viem** — PR [#5176](https://github.com/wevm/viem/pull/5176) merged 2026-10-04 and PR [#5196](https://github.com/wevm/viem/pull/5196) merged 2026-10-11 (concurrent-wait observer fixes, merged by maintainer jxom).
- Forks under [Kshot3000](https://github.com/Kshot3000) for upstream work: reth, lodestar, prysm, optimism, ethers.js, ERCs.
- **wPRL** — wrapped-Pearl bridge proposal scoped to Base Sepolia testnet only ([pearl-research-labs/pearl#347](https://github.com/pearl-research-labs/pearl/issues/347)).

## Tools on the hub (browser-local, exact math, offline)

1. **Wei converter** — ETH ⇄ gwei ⇄ wei with BigInt decimal-string parsing. No floats.
2. **EIP-55 address inspector** — pure-JS Keccak-256 verifies and produces checksummed addresses; passes the official EIP-55 test vectors (covered in `tests/test-site.js`).
3. **EIP-1559 gas cost estimator** — gas × (base + priority) expected cost, and max cost at maxFeePerGas = 2×base + priority. Clearly a wallet-convention model, not live data.
4. **Function selector & event topic calculator** — Keccak-256 of a canonical signature gives the 4-byte calldata selector and the 32-byte event topic0; verified in the tests against the canonical ERC-20 selectors (`transfer(address,uint256)` → `0xa9059cbb`) and the Transfer/Approval topic hashes.
5. **CREATE2 address calculator** — EIP-1014 deterministic deployment addresses from deployer + salt + init code; verified in the tests against all seven official EIP-1014 examples. Computes the address only — nothing is deployed.
6. **ENS namehash calculator** — EIP-137 namehash (and the trailing label's labelhash) for a name, folded right-to-left with Keccak-256; verified in the tests against the official EIP-137 vectors (`''`, `eth`, `foo.eth`). ASCII labels only: internationalised names need full UTS-46 normalisation, so they are rejected rather than mis-hashed. Computes the identifier only — no name or resolver is looked up.

7. **EIP-712 domain separator calculator** — the `DOMAIN_SEPARATOR` for the canonical four-field `EIP712Domain` (name, version, chain ID, verifying contract), ABI-word encoded and hashed with Keccak-256; verified in the tests against the EIP-712 specification's own Ether Mail example (type hash `0x8b73c3c6…` and separator `0xf2cee375…`). Domains that omit fields or add a salt are out of scope rather than guessed at. Computes the separator only — nothing is signed.

## Scope

- **Ethereum L1** — clients and tooling: reth, Lodestar, Prysm, viem, ethers.js, ERC standards.
- **Base** — Coinbase's L2 (@base on GitHub, @base on X; docs at docs.base.org).
- **Unichain** — Uniswap's L2 (@Uniswap on GitHub; @Uniswap / @unichain on X).
- **Robinhood Chain** — Robinhood's permissionless L2 for onchain finance (@robinhood on GitHub, @RobinhoodApp on X; live per its official docs at docs.robinhood.com/chain).

Tagging the teams whose work this touches: @ethereum · @base · @Uniswap · @robinhood — thanks for building the ecosystem this hub builds on.

## Run the tests

```sh
node tests/test-site.js
```

## Support / attribution

Built by Kyle Cox — [@kshot9000](https://x.com/kshot9000) · [github.com/Kshot3000](https://github.com/Kshot3000)

ETH donations for my Ethereum work: `0x4b48c98cd9d99d00dafe5cc4bb9e965345c5b15a`

Independent project — I am not affiliated with the Ethereum Foundation, Base, Uniswap, or Robinhood. No real funds, no mainnet transactions, no wallet signing from this hub; testnet work is labelled testnet. Not financial advice.
