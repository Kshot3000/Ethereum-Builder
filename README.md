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
8. **CREATE address calculator** — the classic deployment address, `keccak256(rlp([sender, nonce]))[12:]`, with a from-spec RLP encoder; verified in the tests against the long-published worked example for this formula (sender `0x6ac7…dbf0`, nonces 0–3) and the RLP specification's own encoding examples. Computes the address only — nothing is deployed.
9. **EIP-712 typed-data digest calculator (Ether Mail)** — the full signable digest `keccak256(0x1901 ‖ domainSeparator ‖ hashStruct(message))` for the EIP-712 specification's own example schema (`Mail` of two `Person` structs plus contents), with recursive struct hashing; verified in the tests against the published values in the EIP's example implementation (Mail type hash `0xa0cede…`, `hashStruct` `0xc52c0e…`, final digest `0xbe609a…`). That one fixed schema only — not a general typed-data encoder. Computes hashes only — nothing is signed.
10. **Proxy & namespaced storage slot calculator** — the ERC-1967 proxy slots (implementation, beacon, admin, plus rollback from the ERC's reference implementation) as `bytes32(uint256(keccak256(label)) − 1)`, and ERC-7201 namespaced-storage roots as `keccak256(abi.encode(uint256(keccak256(id)) − 1)) & ~0xff`; verified in the tests against the slot values published in ERC-1967 and ERC-7201's worked example for `example.main`. Computes slot constants only — no chain state is read.
11. **ABI calldata encoder** — encodes a full function call (selector + head/tail argument encoding) for `uint<M>`/`int<M>`, `address`, `bool`, `bytes<M>`/`bytes`, `string`, and fixed/dynamic arrays of those, nested, with integers carried as strings so no `uint256` ever loses precision; verified in the tests byte-for-byte against all five worked examples in the Solidity ABI specification (`baz`, `bar`, `sam`, `f`, and the nested `g`). Tuple and fixed-point types are rejected rather than guessed at. Encodes data only — nothing is sent and no transaction is made.
12. **ABI calldata decoder** — the strict inverse of the encoder: given a signature and calldata, it verifies the selector matches and decodes the arguments back, rejecting non-canonical encodings rather than tolerating them (out-of-range integer words, a bool other than 0/1, non-zero address leading bytes or padding, offsets into the head or past the end, invalid UTF-8 strings, truncated data, trailing bytes). Verified in the tests by decoding all five Solidity ABI specification examples back to their published arguments and re-encoding them byte-for-byte. Decodes data only — nothing is sent and no chain is queried.
13. **Merkle root & proof calculator** — builds a sorted-pair Keccak-256 tree over one leaf per line (`0x` lines contribute their hex bytes, other lines their UTF-8 bytes), the commutative pair hashing OpenZeppelin's `MerkleProof` uses on-chain, with odd nodes promoted unchanged; returns the root plus any leaf's proof and folds the proof back to the root as a self-check. Verified in the tests against an independent pure-Python Keccak-256 implementation written from the Keccak specification for this tool (roots and proofs for 4- and 5-leaf trees, including the promoted-odd-leaf proof), plus a hand-composed 2-leaf root. The page carries OpenZeppelin's 64-byte-leaf second-preimage caution. Computes hashes only — nothing is sent and no chain is queried.
14. **Raw transaction decoder** — strictly decodes a raw transaction's RLP (legacy incl. EIP-155, EIP-2930 type 1, EIP-1559 type 2) into every field plus the signing hash and transaction hash, rejecting non-canonical encodings rather than tolerating them (0x81-prefixed small bytes, long form for short payloads, leading-zero lengths/integers, wrong field counts, bad v, trailing bytes; type 3 blob transactions refused, signature decoded but not verified, no sender recovered). Verified in the tests against the signed transaction published in EIP-155 itself — all fields and its published signing hash `0xdaf5a779…` — plus type 1 / type 2 vectors produced by an independent pure-Python RLP + Keccak oracle written from the specifications. Decodes data only — nothing is sent and no chain is queried.
15. **Signature recovery (ecrecover) calculator** — given a 32-byte digest and a signature's v / r / s, recovers the signer's address with pure-JS secp256k1 point arithmetic, exactly as the EVM's `ecrecover` precompile does; v is accepted as 0/1, 27/28, or an EIP-155 value, and `s` must be in the lower half of the curve order (the canonical EIP-2 form — the malleable high-s twin is rejected). Verified in the tests against three independent anchors: the EIP-155 example (its published signing hash and r/s recover the address an independent pure-Python secp256k1 oracle derives from the private key the EIP itself prints), EIP-712's printed `eth_signTypedData` signature recovering its published signing account over the spec digest, and Python-oracle sign/recover vectors with fixed keys. Recovers an address from a signature only — nothing is signed, no key is used, and no chain is queried.
16. **Signed message verification (EIP-191 personal_sign)** — given a message and the 65-byte signature a wallet returned, rebuilds the EIP-191 version-0x45 digest (`keccak256("\x19Ethereum Signed Message:\n" ‖ byte length ‖ message)` — the length counts UTF-8 bytes, not characters) and recovers the signer, with an optional expected-address comparison; exactly-65-byte signatures and the canonical low-`s` form are enforced, so malformed or malleable signatures are refused rather than half-verified. Verified in the tests against an independent pure-Python Keccak-256 + secp256k1 oracle written from the specifications (Keccak anchored on the published `''` / `hello world` vectors; address derivation anchored on the published addresses of private key 1 and of the private key EIP-155 prints), over an ASCII message, the empty message, and a multibyte UTF-8 message. Verifies a signature only — nothing is signed, no key is used, and no chain is queried.
17. **Transaction sender recovery** — composes the raw transaction decoder and the ecrecover calculator: strictly decode a signed transaction, recompute its signing hash from the unsigned payload, and recover the sender from the transaction's own v / r / s (legacy 27/28 or EIP-155 values, typed y-parity 0/1). Unsigned transactions are refused (they have no sender), and the canonical low-`s` form is enforced, so the malleable high-`s` twin of a signature is refused rather than recovered. Verified in the tests against EIP-155's published transaction recovering its published sender, plus type 1 (Unichain 130), type 2 (Base 8453), and legacy transactions signed by an independent pure-Python Keccak-256 + secp256k1 oracle written from the specifications with two known keys (private key 1 and the private key EIP-155 prints), each recovering that key's published address. Recovers an address only — nothing is signed, no key is used, and no chain is queried.

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
