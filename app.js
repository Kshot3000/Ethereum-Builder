"use strict";
/* Ethereum Builder — browser-local tools. All math is exact: decimal strings
   are parsed to BigInt-scaled integers, never floats. Keccak-256 below is a
   pure-JS implementation (original Keccak padding, as used by Ethereum /
   EIP-55 — not SHA-3's 0x06 domain byte). */

/* ---------- exact decimal helpers ---------- */
const UNIT_DECIMALS = { wei: 0, gwei: 9, eth: 18 };

/* Parse a non-negative decimal string into a BigInt scaled by 10^decimals.
   Returns null on invalid input or too many decimal places. */
function parseScaled(str, decimals) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [intPart, fracPart = ""] = s.split(".");
  if (fracPart.length > decimals) return null;
  const fracPadded = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

/* Format a BigInt scaled by 10^decimals as a plain decimal string. */
function formatScaled(value, decimals) {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const intPart = v / base;
  const fracPart = v % base;
  let out = intPart.toString();
  if (decimals > 0 && fracPart !== 0n) {
    out += "." + fracPart.toString().padStart(decimals, "0").replace(/0+$/, "");
  }
  return (neg ? "-" : "") + out;
}

/* Convert a decimal amount between wei / gwei / eth, exactly. */
function convertUnit(valueStr, fromUnit, toUnit) {
  if (!(fromUnit in UNIT_DECIMALS) || !(toUnit in UNIT_DECIMALS)) return null;
  const wei = parseScaled(valueStr, UNIT_DECIMALS[fromUnit]);
  if (wei === null) return null;
  return formatScaled(wei, UNIT_DECIMALS[toUnit]);
}

/* ---------- Keccak-256 (pure JS, BigInt lanes) ---------- */
const MASK64 = (1n << 64n) - 1n;
const KECCAK_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];
const KECCAK_ROT = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14
];
function rotl64(x, n) {
  if (n === 0) return x & MASK64;
  const b = BigInt(n);
  return ((x << b) | (x >> (64n - b))) & MASK64;
}
function keccakF1600(state) {
  for (let round = 0; round < 24; round++) {
    /* theta */
    const c = [], d = [];
    for (let x = 0; x < 5; x++) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
    }
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) state[x + 5 * y] ^= d[x];
    }
    /* rho + pi */
    const b = new Array(25).fill(0n);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(state[x + 5 * y], KECCAK_ROT[x + 5 * y]);
      }
    }
    /* chi */
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        state[x + 5 * y] = b[x + 5 * y] ^ ((~b[((x + 1) % 5) + 5 * y]) & b[((x + 2) % 5) + 5 * y]);
      }
    }
    /* iota */
    state[0] ^= KECCAK_RC[round];
    for (let i = 0; i < 25; i++) state[i] &= MASK64;
  }
}
/* Keccak-256 digest of a byte array, returned as an array of 32 bytes. */
function keccak256Digest(inputBytes) {
  const RATE = 136; /* bytes: (1600 - 512) / 8 */
  const bytes = Array.from(inputBytes);
  /* Keccak pad10*1: 0x01 ... 0x80 within the final rate block */
  bytes.push(0x01);
  while (bytes.length % RATE !== RATE - 1) bytes.push(0x00);
  bytes.push(0x80);
  const state = new Array(25).fill(0n);
  for (let block = 0; block < bytes.length; block += RATE) {
    for (let lane = 0; lane < RATE / 8; lane++) {
      let v = 0n;
      for (let j = 7; j >= 0; j--) {
        v = (v << 8n) | BigInt(bytes[block + lane * 8 + j]);
      }
      state[lane] ^= v;
    }
    keccakF1600(state);
  }
  const out = [];
  for (let lane = 0; lane < 4; lane++) {
    let v = state[lane];
    for (let j = 0; j < 8; j++) {
      out.push(Number(v & 0xffn));
      v >>= 8n;
    }
  }
  return out;
}
function bytesToHex(bytes) {
  return bytes.map(b => b.toString(16).padStart(2, "0")).join("");
}
/* Keccak-256 of a byte array, returned as lowercase hex (no 0x). */
function keccak256Bytes(bytes) {
  return bytesToHex(keccak256Digest(bytes));
}
/* Keccak-256 of an ASCII string, returned as lowercase hex (no 0x). */
function keccak256(ascii) {
  const bytes = [];
  for (let i = 0; i < ascii.length; i++) bytes.push(ascii.charCodeAt(i) & 0xff);
  return keccak256Bytes(bytes);
}

/* ---------- EIP-55 address inspector ---------- */
function toChecksumAddress(addr) {
  if (typeof addr !== "string") return null;
  const m = /^0x([0-9a-fA-F]{40})$/.exec(addr.trim());
  if (!m) return null;
  const lower = m[1].toLowerCase();
  const hash = keccak256(lower);
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}
function inspectAddress(addr) {
  if (typeof addr !== "string") return { valid: false };
  const trimmed = addr.trim();
  const m = /^0x([0-9a-fA-F]{40})$/.exec(trimmed);
  if (!m) return { valid: false };
  const checksum = toChecksumAddress(trimmed);
  const hasMixedCase = /[a-f]/.test(m[1]) && /[A-F]/.test(m[1]);
  return {
    valid: true,
    checksum,
    lowercase: "0x" + m[1].toLowerCase(),
    checksumValid: hasMixedCase ? trimmed === checksum : null,
    isAllLowerOrUpper: !hasMixedCase
  };
}

/* ---------- EIP-1559 gas cost estimator (model, not live data) ---------- */
function gasEstimate(gasUnitsStr, baseFeeGweiStr, priorityFeeGweiStr) {
  const gas = parseScaled(String(gasUnitsStr).trim(), 0);
  const baseWei = parseScaled(String(baseFeeGweiStr).trim(), 9);
  const priorityWei = parseScaled(String(priorityFeeGweiStr).trim(), 9);
  if (gas === null || baseWei === null || priorityWei === null) return null;
  const effectiveWei = baseWei + priorityWei;
  const maxFeeWei = 2n * baseWei + priorityWei;
  return {
    effectiveGwei: formatScaled(effectiveWei, 9),
    maxFeeGwei: formatScaled(maxFeeWei, 9),
    expectedEth: formatScaled(gas * effectiveWei, 18),
    maxEth: formatScaled(gas * maxFeeWei, 18)
  };
}

/* ---------- Function selector / event topic (Keccak-256) ----------
   A function selector is the first 4 bytes of Keccak-256 of the canonical
   signature, e.g. transfer(address,uint256) -> 0xa9059cbb. An event topic0
   is the full 32-byte hash, e.g. Transfer(address,address,uint256). */
function normalizeSignature(sig) {
  if (typeof sig !== "string") return null;
  /* Canonical signatures carry no whitespace; users often type it, so strip it. */
  const s = sig.trim().replace(/\s+/g, "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*\([A-Za-z0-9_,\[\]]*\)$/.test(s)) return null;
  /* Reject empty type slots such as "f(address,,uint256)" or "f(,)" */
  const params = s.slice(s.indexOf("(") + 1, -1);
  if (params !== "" && params.split(",").some(p => p === "" || p === "[]")) return null;
  return s;
}
function functionSelector(sig) {
  const s = normalizeSignature(sig);
  if (s === null) return null;
  return "0x" + keccak256(s).slice(0, 8);
}
function eventTopic(sig) {
  const s = normalizeSignature(sig);
  if (s === null) return null;
  return "0x" + keccak256(s);
}

/* ---------- CREATE2 address calculator (EIP-1014) ----------
   address = last 20 bytes of keccak256(0xff ++ deployer(20B) ++ salt(32B)
   ++ keccak256(init_code)). Deterministic deployment: the same deployer,
   salt and init code give the same address on every EVM chain. */
/* Parse a hex string (optional 0x prefix, even length) into bytes.
   expectedLen, when given, must match exactly. Returns null on bad input. */
function parseHexBytes(str, expectedLen) {
  if (typeof str !== "string") return null;
  let s = str.trim();
  if (s.startsWith("0x") || s.startsWith("0X")) s = s.slice(2);
  if (s.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(s)) return null;
  if (expectedLen !== undefined && s.length !== expectedLen * 2) return null;
  const out = [];
  for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16));
  return out;
}
function create2Address(deployer, salt, initCode) {
  const deployerBytes = parseHexBytes(deployer, 20);
  const saltBytes = parseHexBytes(salt, 32);
  const initBytes = parseHexBytes(initCode);
  if (deployerBytes === null || saltBytes === null || initBytes === null) return null;
  const preimage = [0xff, ...deployerBytes, ...saltBytes, ...keccak256Digest(initBytes)];
  const digest = keccak256Digest(preimage);
  return toChecksumAddress("0x" + bytesToHex(digest.slice(12)));
}

/* ---------- CREATE address calculator ----------
   The original deployment opcode derives the contract address from the
   creator alone: address = last 20 bytes of keccak256(rlp([sender,
   nonce])). The nonce is RLP-encoded as an integer (0 is the empty
   string, no leading zero bytes), which is why the same account deploys
   to a predictable sequence of addresses on every EVM chain. Computes
   the address locally; nothing is deployed. */
function rlpEncodeBytes(bytes) {
  if (bytes.length === 1 && bytes[0] < 0x80) return bytes.slice();
  if (bytes.length <= 55) return [0x80 + bytes.length, ...bytes];
  const lenBytes = [];
  let len = bytes.length;
  while (len > 0) { lenBytes.unshift(len & 0xff); len >>= 8; }
  return [0xb7 + lenBytes.length, ...lenBytes, ...bytes];
}
function createAddress(sender, nonceStr) {
  const senderBytes = parseHexBytes(sender, 20);
  if (senderBytes === null) return null;
  const n = String(nonceStr).trim();
  if (!/^\d+$/.test(n)) return null;
  const nonce = BigInt(n);
  if (nonce >= (1n << 256n)) return null;
  const nonceBytes = [];
  let v = nonce;
  while (v > 0n) { nonceBytes.unshift(Number(v & 0xffn)); v >>= 8n; }
  const payload = [...rlpEncodeBytes(senderBytes), ...rlpEncodeBytes(nonceBytes)];
  let listPrefix;
  if (payload.length <= 55) {
    listPrefix = [0xc0 + payload.length];
  } else {
    const lenBytes = [];
    let len = payload.length;
    while (len > 0) { lenBytes.unshift(len & 0xff); len >>= 8; }
    listPrefix = [0xf7 + lenBytes.length, ...lenBytes];
  }
  const digest = keccak256Digest([...listPrefix, ...payload]);
  return toChecksumAddress("0x" + bytesToHex(digest.slice(12)));
}

/* ---------- ENS namehash (EIP-137) ----------
   namehash folds labels right-to-left: node starts as 32 zero bytes, and
   for each label from the rightmost, node = keccak256(node ++
   keccak256(label)). The empty name is the root node (32 zero bytes).
   Honest scope: ENS proper names go through UTS-46 normalisation first.
   This tool lowercases the input (namehash is case-insensitive after
   normalisation) and accepts ASCII labels [a-z0-9-_]; internationalised
   names that need full UTS-46 mapping are rejected, never mis-hashed. */
function utf8Bytes(str) {
  if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(str));
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let cp = str.charCodeAt(i);
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
}
function labelhash(label) {
  if (typeof label !== "string") return null;
  const l = label.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(l)) return null;
  return "0x" + keccak256Bytes(utf8Bytes(l));
}
function namehash(name) {
  if (typeof name !== "string") return null;
  const n = name.trim().toLowerCase();
  if (n === "") return "0x" + "00".repeat(32);
  const labels = n.split(".");
  if (labels.some(l => !/^[a-z0-9_-]+$/.test(l))) return null;
  let node = new Array(32).fill(0);
  for (let i = labels.length - 1; i >= 0; i--) {
    node = keccak256Digest([...node, ...keccak256Digest(utf8Bytes(labels[i]))]);
  }
  return "0x" + bytesToHex(node);
}

/* ---------- EIP-712 domain separator ----------
   domainSeparator = hashStruct(EIP712Domain): the Keccak-256 of the ABI
   encoding of the domain type hash, keccak256(name), keccak256(version),
   chainId and verifyingContract, each as one 32-byte word. This is the
   value contracts expose as DOMAIN_SEPARATOR and wallets bind typed-data
   signatures to (EIP-2612 permits, Seaport orders, …).
   Honest scope: this covers the canonical four-field domain only. The
   EIP lets protocols omit fields or add a bytes32 salt, and those domains
   hash a different type string — this tool does not guess at them. It
   computes the separator locally; nothing is signed. */
const EIP712_DOMAIN_TYPE = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
const EIP712_DOMAIN_TYPEHASH = "0x" + keccak256(EIP712_DOMAIN_TYPE);
function uint256WordBytes(value) {
  if (typeof value !== "bigint" || value < 0n || value >= (1n << 256n)) return null;
  const out = new Array(32).fill(0);
  let v = value;
  for (let i = 31; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
}
function eip712DomainSeparator(name, version, chainIdStr, verifyingContract) {
  if (typeof name !== "string" || typeof version !== "string") return null;
  const n = name.trim(), ver = version.trim();
  if (n === "" || ver === "") return null;
  const cid = String(chainIdStr).trim();
  if (!/^\d+$/.test(cid)) return null;
  const chainId = BigInt(cid);
  if (chainId < 1n || chainId >= (1n << 256n)) return null;
  const contractBytes = parseHexBytes(verifyingContract, 20);
  if (contractBytes === null) return null;
  const encoded = [
    ...parseHexBytes(EIP712_DOMAIN_TYPEHASH, 32),
    ...keccak256Digest(utf8Bytes(n)),
    ...keccak256Digest(utf8Bytes(ver)),
    ...uint256WordBytes(chainId),
    ...new Array(12).fill(0), ...contractBytes
  ];
  return "0x" + keccak256Bytes(encoded);
}

/* ---------- EIP-712 typed-data digest (Ether Mail schema) ----------
   The full signable digest of an EIP-712 message is
   keccak256(0x1901 ‖ domainSeparator ‖ hashStruct(message)), where
   hashStruct(s) = keccak256(typeHash ‖ encodeData(s)), string members
   encode as keccak256(their UTF-8 bytes), address members as one
   left-padded 32-byte word, and struct members recursively as their
   own hashStruct. This tool implements the specification's own example
   schema — Person(string name, address wallet) and Mail(Person from,
   Person to, string contents) — end to end, so its published example
   values (Mail type hash, hashStruct, final digest in the EIP's
   Example.js) serve as known-answer tests.
   Honest scope: this is that one fixed schema, not a general
   typed-data encoder — arbitrary schemas are out of scope rather than
   guessed at. It computes hashes only; nothing is signed. */
const EIP712_PERSON_TYPE = "Person(string name,address wallet)";
const EIP712_MAIL_TYPE = "Mail(Person from,Person to,string contents)Person(string name,address wallet)";
const EIP712_PERSON_TYPEHASH = "0x" + keccak256(EIP712_PERSON_TYPE);
const EIP712_MAIL_TYPEHASH = "0x" + keccak256(EIP712_MAIL_TYPE);
function eip712HashPerson(name, wallet) {
  if (typeof name !== "string") return null;
  const n = name.trim();
  if (n === "") return null;
  const walletBytes = parseHexBytes(wallet, 20);
  if (walletBytes === null) return null;
  const encoded = [
    ...parseHexBytes(EIP712_PERSON_TYPEHASH, 32),
    ...keccak256Digest(utf8Bytes(n)),
    ...new Array(12).fill(0), ...walletBytes
  ];
  return "0x" + keccak256Bytes(encoded);
}
function eip712MailDigest(domainName, domainVersion, chainIdStr, verifyingContract,
                          fromName, fromWallet, toName, toWallet, contents) {
  const domainSeparator = eip712DomainSeparator(domainName, domainVersion, chainIdStr, verifyingContract);
  if (domainSeparator === null) return null;
  if (typeof contents !== "string") return null;
  const fromHash = eip712HashPerson(fromName, fromWallet);
  const toHash = eip712HashPerson(toName, toWallet);
  if (fromHash === null || toHash === null) return null;
  const mailEncoded = [
    ...parseHexBytes(EIP712_MAIL_TYPEHASH, 32),
    ...parseHexBytes(fromHash, 32),
    ...parseHexBytes(toHash, 32),
    ...keccak256Digest(utf8Bytes(contents))
  ];
  const structHash = "0x" + keccak256Bytes(mailEncoded);
  const digest = "0x" + keccak256Bytes([
    0x19, 0x01, ...parseHexBytes(domainSeparator, 32), ...parseHexBytes(structHash, 32)
  ]);
  return { domainSeparator, mailTypeHash: EIP712_MAIL_TYPEHASH, structHash, digest };
}

/* ---------- Proxy & namespaced storage slots (ERC-1967 / ERC-7201) ----------
   ERC-1967 proxy slots: bytes32(uint256(keccak256(label)) - 1) for the labels
   eip1967.proxy.implementation / .beacon / .admin (plus .rollback, defined in
   the ERC's reference implementation). ERC-7201 namespaced storage:
   erc7201(id) = keccak256(abi.encode(uint256(keccak256(id)) - 1)) & ~0xff —
   the second hash keeps namespaces out of the standard storage tree and the
   mask aligns the root to a multiple of 256. Both are pure derivations of a
   string; this tool computes slot constants only — it reads no chain state. */
const ERC1967_LABELS = {
  implementation: "eip1967.proxy.implementation",
  beacon: "eip1967.proxy.beacon",
  admin: "eip1967.proxy.admin",
  rollback: "eip1967.proxy.rollback"
};
function bytes32HexToBigInt(hex) {
  return BigInt("0x" + hex);
}
function bigIntToSlotHex(n) {
  return "0x" + n.toString(16).padStart(64, "0");
}
function bigIntToBytes32(n) {
  const out = new Array(32);
  let v = n;
  for (let i = 31; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
}
function erc1967Slot(kind) {
  if (typeof kind !== "string") return null;
  const label = ERC1967_LABELS[kind.trim()];
  if (label === undefined) return null;
  return bigIntToSlotHex(bytes32HexToBigInt(keccak256(label)) - 1n);
}
function erc7201Slot(id) {
  if (typeof id !== "string") return null;
  const s = id.trim();
  /* ERC-7201: a namespace id should not contain any whitespace. */
  if (s === "" || /\s/.test(s)) return null;
  const inner = bytes32HexToBigInt(keccak256(s)) - 1n;
  const outer = bytes32HexToBigInt(keccak256Bytes(bigIntToBytes32(inner)));
  return bigIntToSlotHex(outer & ~0xffn);
}

/* ---------- ABI calldata encoder (Solidity ABI specification) ----------
   Encodes a function call as selector ++ enc(arguments): static types are
   encoded in place as 32-byte words; dynamic types (bytes, string, T[],
   T[k] of dynamic T) put a byte offset in the head and their data in the
   tail, recursively. Supported: uint<M>/int<M> (M a multiple of 8, plus
   the bare uint/int aliases, canonicalised to 256), address, bool,
   bytes<M>/bytes, string, and fixed/dynamic arrays of any supported type,
   nested. Tuples and fixed-point types are rejected, not guessed at.
   Argument values follow a strict JSON convention (see the page): integers
   as decimal/0x strings (JSON numbers only when safe integers, so a uint256
   can never lose precision silently), bool as JSON true/false, bytes as a
   0x hex string or plain text (its UTF-8 bytes). Verified in the tests
   against all five worked examples in the ABI specification itself. */
function abiWord(value) {
  let x = ((value % (1n << 256n)) + (1n << 256n)) % (1n << 256n);
  const out = new Array(32);
  for (let i = 31; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}
function abiParseType(s) {
  if (typeof s !== "string" || s === "") return null;
  const suffixes = [];
  let base = s;
  while (base.endsWith("]")) {
    const open = base.lastIndexOf("[");
    if (open < 0) return null;
    const inner = base.slice(open + 1, -1);
    if (inner !== "" && !/^\d+$/.test(inner)) return null;
    suffixes.unshift(inner === "" ? null : Number(inner));
    base = base.slice(0, open);
  }
  let node, m;
  if ((m = /^(uint|int)(\d*)$/.exec(base))) {
    const bits = m[2] === "" ? 256 : Number(m[2]);
    if (bits < 8 || bits > 256 || bits % 8 !== 0) return null;
    node = { kind: m[1], bits };
  } else if (base === "address") node = { kind: "address" };
  else if (base === "bool") node = { kind: "bool" };
  else if (base === "string") node = { kind: "string" };
  else if ((m = /^bytes(\d*)$/.exec(base))) {
    if (m[1] === "") node = { kind: "bytes" };
    else {
      const n = Number(m[1]);
      if (n < 1 || n > 32) return null;
      node = { kind: "bytesN", n };
    }
  } else return null;
  /* suffixes were collected outermost-first and unshifted, so they now run
     innermost-first — wrapping in that order rebuilds the type. */
  for (const size of suffixes) {
    if (size !== null && size < 1) return null;
    node = { kind: "array", elem: node, len: size };
  }
  return node;
}
function abiCanonicalType(t) {
  switch (t.kind) {
    case "uint": return "uint" + t.bits;
    case "int": return "int" + t.bits;
    case "address": return "address";
    case "bool": return "bool";
    case "string": return "string";
    case "bytes": return "bytes";
    case "bytesN": return "bytes" + t.n;
    case "array": return abiCanonicalType(t.elem) + "[" + (t.len === null ? "" : t.len) + "]";
  }
  return null;
}
function abiIsDynamic(t) {
  if (t.kind === "bytes" || t.kind === "string") return true;
  if (t.kind === "array") return t.len === null || abiIsDynamic(t.elem);
  return false;
}
function abiStaticSize(t) {
  if (t.kind === "array") return t.len * abiStaticSize(t.elem);
  return 32;
}
function abiParseIntValue(v, signed) {
  let x;
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) return null;
    x = BigInt(v);
  } else if (typeof v === "string") {
    const s = v.trim();
    if (/^0[xX][0-9a-fA-F]+$/.test(s)) x = BigInt(s);
    else if (/^-?\d+$/.test(s)) x = BigInt(s);
    else return null;
  } else return null;
  if (!signed && x < 0n) return null;
  return x;
}
function abiCoerceBytes(v, exactLen) {
  if (typeof v !== "string") return null;
  let bytes;
  if (/^0[xX]/.test(v.trim())) {
    bytes = parseHexBytes(v);
    if (bytes === null) return null;
  } else bytes = utf8Bytes(v);
  if (exactLen !== undefined && bytes.length !== exactLen) return null;
  return bytes;
}
function abiEncodeStatic(t, v) {
  switch (t.kind) {
    case "uint": {
      const x = abiParseIntValue(v, false);
      if (x === null || x >= (1n << BigInt(t.bits))) return null;
      return abiWord(x);
    }
    case "int": {
      const x = abiParseIntValue(v, true);
      if (x === null) return null;
      const b = BigInt(t.bits);
      if (x < -(1n << (b - 1n)) || x >= (1n << (b - 1n))) return null;
      return abiWord(x);
    }
    case "address": {
      const b = parseHexBytes(v, 20);
      if (b === null) return null;
      return [...new Array(12).fill(0), ...b];
    }
    case "bool": {
      if (v !== true && v !== false) return null;
      return abiWord(v ? 1n : 0n);
    }
    case "bytesN": {
      const b = abiCoerceBytes(v, t.n);
      if (b === null) return null;
      return [...b, ...new Array(32 - t.n).fill(0)];
    }
    case "array": {
      if (!Array.isArray(v) || v.length !== t.len) return null;
      const out = [];
      for (const el of v) {
        const e = abiEncodeStatic(t.elem, el);
        if (e === null) return null;
        out.push(...e);
      }
      return out;
    }
  }
  return null;
}
function abiEncodeElements(elemType, values) {
  if (!abiIsDynamic(elemType)) {
    const out = [];
    for (const el of values) {
      const e = abiEncodeStatic(elemType, el);
      if (e === null) return null;
      out.push(...e);
    }
    return out;
  }
  const heads = [], tails = [];
  let offset = 32 * values.length;
  for (const el of values) {
    const tail = abiEncodeDynamic(elemType, el);
    if (tail === null) return null;
    heads.push(...abiWord(BigInt(offset)));
    tails.push(...tail);
    offset += tail.length;
  }
  return [...heads, ...tails];
}
function abiEncodeDynamic(t, v) {
  switch (t.kind) {
    case "bytes": {
      const b = abiCoerceBytes(v);
      if (b === null) return null;
      const pad = (32 - (b.length % 32)) % 32;
      return [...abiWord(BigInt(b.length)), ...b, ...new Array(pad).fill(0)];
    }
    case "string": {
      if (typeof v !== "string") return null;
      const b = utf8Bytes(v);
      const pad = (32 - (b.length % 32)) % 32;
      return [...abiWord(BigInt(b.length)), ...b, ...new Array(pad).fill(0)];
    }
    case "array": {
      if (!Array.isArray(v)) return null;
      if (t.len === null) {
        const body = abiEncodeElements(t.elem, v);
        if (body === null) return null;
        return [...abiWord(BigInt(v.length)), ...body];
      }
      if (v.length !== t.len) return null;
      return abiEncodeElements(t.elem, v);
    }
  }
  return null;
}
function abiEncodeTuple(types, values) {
  if (!Array.isArray(values) || values.length !== types.length) return null;
  const headSize = types.reduce((a, t) => a + (abiIsDynamic(t) ? 32 : abiStaticSize(t)), 0);
  const heads = [], tails = [];
  let offset = headSize;
  for (let i = 0; i < types.length; i++) {
    if (abiIsDynamic(types[i])) {
      const tail = abiEncodeDynamic(types[i], values[i]);
      if (tail === null) return null;
      heads.push(...abiWord(BigInt(offset)));
      tails.push(...tail);
      offset += tail.length;
    } else {
      const h = abiEncodeStatic(types[i], values[i]);
      if (h === null) return null;
      heads.push(...h);
    }
  }
  return [...heads, ...tails];
}
function abiEncodeCall(sig, values) {
  if (typeof sig !== "string") return null;
  const s = sig.trim().replace(/\s+/g, "");
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/.exec(s);
  if (!m) return null;
  const paramStrs = m[2] === "" ? [] : m[2].split(",");
  const types = [];
  for (const p of paramStrs) {
    const t = abiParseType(p);
    if (t === null) return null;
    types.push(t);
  }
  const canonical = m[1] + "(" + types.map(abiCanonicalType).join(",") + ")";
  const body = abiEncodeTuple(types, values);
  if (body === null) return null;
  const selector = "0x" + keccak256(canonical).slice(0, 8);
  return { canonical, selector, calldata: selector + bytesToHex(body) };
}

/* ---------- ABI calldata decoder (strict inverse of the encoder) ----------
   Decodes calldata for a known signature back into its arguments: the
   4-byte selector must match the signature's canonical form, and decoding
   is strict — values must be canonically encoded for their type (a uint32
   word with bits above 32 set, a bool other than 0/1, an address with
   non-zero leading bytes, non-zero padding after bytes/bytes<M> data, an
   int<M> that is not correctly sign-extended, offsets that are unaligned,
   point into the head, or run past the end, strings that are not valid
   UTF-8, truncated data, and trailing bytes after the last argument are
   all rejected rather than silently tolerated). Decoded values mirror the
   encoder's conventions in reverse: integers as decimal strings (a
   uint256 can never lose precision), addresses and bytes as 0x hex,
   strings as text, arrays as nested arrays. Verified in the tests by
   decoding the Solidity ABI specification's five worked examples back to
   their published arguments. */
function abiWordAt(bytes, pos) {
  if (pos < 0 || pos + 32 > bytes.length) return null;
  let x = 0n;
  for (let i = 0; i < 32; i++) x = (x << 8n) | BigInt(bytes[pos + i]);
  return x;
}
function abiUtf8Decode(bytes) {
  if (typeof TextDecoder === "undefined") return null;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes)); }
  catch (e) { return null; }
}
function abiDecodeStatic(t, bytes, pos) {
  switch (t.kind) {
    case "uint": {
      const x = abiWordAt(bytes, pos); if (x === null) return null;
      if (x >= (1n << BigInt(t.bits))) return null;
      return { value: x.toString(), end: pos + 32 };
    }
    case "int": {
      const x = abiWordAt(bytes, pos); if (x === null) return null;
      const sx = x >= (1n << 255n) ? x - (1n << 256n) : x;
      const b = BigInt(t.bits);
      if (sx < -(1n << (b - 1n)) || sx >= (1n << (b - 1n))) return null;
      return { value: sx.toString(), end: pos + 32 };
    }
    case "address": {
      if (pos + 32 > bytes.length) return null;
      for (let i = 0; i < 12; i++) if (bytes[pos + i] !== 0) return null;
      return { value: "0x" + bytesToHex(bytes.slice(pos + 12, pos + 32)), end: pos + 32 };
    }
    case "bool": {
      const x = abiWordAt(bytes, pos); if (x === null) return null;
      if (x !== 0n && x !== 1n) return null;
      return { value: x === 1n, end: pos + 32 };
    }
    case "bytesN": {
      if (pos + 32 > bytes.length) return null;
      for (let i = t.n; i < 32; i++) if (bytes[pos + i] !== 0) return null;
      return { value: "0x" + bytesToHex(bytes.slice(pos, pos + t.n)), end: pos + 32 };
    }
    case "array": {
      const out = []; let p = pos;
      for (let i = 0; i < t.len; i++) {
        const r = abiDecodeStatic(t.elem, bytes, p); if (r === null) return null;
        out.push(r.value); p = r.end;
      }
      return { value: out, end: p };
    }
  }
  return null;
}
function abiDecodeElements(elem, count, bytes, start) {
  /* Element offsets are relative to `start` — the beginning of the element
     block (just past the length word for a dynamic array). */
  const dyn = abiIsDynamic(elem);
  const headSize = dyn ? 32 : abiStaticSize(elem);
  if (count < 0 || start < 0 || start + count * headSize > bytes.length) return null;
  const out = []; let end = start + count * headSize;
  for (let i = 0; i < count; i++) {
    const hp = start + i * headSize;
    if (dyn) {
      const off = abiWordAt(bytes, hp); if (off === null) return null;
      if (off % 32n !== 0n || off > BigInt(bytes.length)) return null;
      if (Number(off) < count * headSize) return null;
      const r = abiDecodeDynamic(elem, bytes, start + Number(off)); if (r === null) return null;
      out.push(r.value); if (r.end > end) end = r.end;
    } else {
      const r = abiDecodeStatic(elem, bytes, hp); if (r === null) return null;
      out.push(r.value);
    }
  }
  return { value: out, end };
}
function abiDecodeDynamic(t, bytes, pos) {
  switch (t.kind) {
    case "bytes": case "string": {
      const len = abiWordAt(bytes, pos); if (len === null) return null;
      if (len > BigInt(bytes.length)) return null;
      const n = Number(len);
      const padded = Math.ceil(n / 32) * 32;
      if (pos + 32 + padded > bytes.length) return null;
      for (let i = n; i < padded; i++) if (bytes[pos + 32 + i] !== 0) return null;
      const raw = bytes.slice(pos + 32, pos + 32 + n);
      if (t.kind === "bytes") return { value: "0x" + bytesToHex(raw), end: pos + 32 + padded };
      const s = abiUtf8Decode(raw); if (s === null) return null;
      return { value: s, end: pos + 32 + padded };
    }
    case "array": {
      if (t.len === null) {
        const len = abiWordAt(bytes, pos); if (len === null) return null;
        if (len > BigInt(bytes.length)) return null;
        return abiDecodeElements(t.elem, Number(len), bytes, pos + 32);
      }
      return abiDecodeElements(t.elem, t.len, bytes, pos);
    }
  }
  return null;
}
function abiDecodeTuple(types, bytes, start) {
  const headSize = types.reduce((a, t) => a + (abiIsDynamic(t) ? 32 : abiStaticSize(t)), 0);
  if (start < 0 || start + headSize > bytes.length) return null;
  const values = []; let pos = start, end = start + headSize;
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    if (abiIsDynamic(t)) {
      const off = abiWordAt(bytes, pos); if (off === null) return null;
      if (off % 32n !== 0n || off > BigInt(bytes.length)) return null;
      if (Number(off) < headSize) return null;
      const r = abiDecodeDynamic(t, bytes, start + Number(off)); if (r === null) return null;
      values.push(r.value); if (r.end > end) end = r.end;
      pos += 32;
    } else {
      const r = abiDecodeStatic(t, bytes, pos); if (r === null) return null;
      values.push(r.value); pos = r.end;
    }
  }
  return { values, end };
}
function abiDecodeCall(sig, calldata) {
  if (typeof sig !== "string" || typeof calldata !== "string") return null;
  const s = sig.trim().replace(/\s+/g, "");
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/.exec(s);
  if (!m) return null;
  const paramStrs = m[2] === "" ? [] : m[2].split(",");
  const types = [];
  for (const p of paramStrs) {
    const t = abiParseType(p);
    if (t === null) return null;
    types.push(t);
  }
  const canonical = m[1] + "(" + types.map(abiCanonicalType).join(",") + ")";
  const selector = "0x" + keccak256(canonical).slice(0, 8);
  if (!/^0[xX]/.test(calldata.trim())) return null;
  const bytes = parseHexBytes(calldata);
  if (bytes === null || bytes.length < 4) return null;
  if ("0x" + bytesToHex(bytes.slice(0, 4)) !== selector) return null;
  const body = bytes.slice(4);
  const r = abiDecodeTuple(types, body, 0);
  if (r === null || r.end !== body.length) return null;
  return { canonical, selector, args: r.values };
}

/* ---------- Merkle root & proof calculator (sorted-pair Keccak tree) ----------
   The allowlist/airdrop workhorse: a leaf is Keccak-256 of its input bytes
   (a 0x hex line contributes those bytes; any other line contributes its
   UTF-8 bytes). Each internal node is Keccak-256 of its two children
   sorted ascending bytewise before concatenation — the commutative
   hashing OpenZeppelin's MerkleProof uses on-chain (Hashes.
   commutativeKeccak256), so position within a pair never matters. An odd
   node at the end of a level is promoted to the next level unchanged
   rather than hashed against itself. A single leaf's root is its own leaf
   hash and its proof is empty. Deliberately strict, like the decoder:
   empty leaf lists, blank lines, malformed or empty hex leaves, and
   out-of-range proof indexes are rejected, never patched over. Caution
   carried from OpenZeppelin's own docs: keep leaf inputs away from
   exactly 64 bytes if the root will be verified on-chain — a 64-byte
   preimage has the same shape as a concatenated pair of nodes (a
   second-preimage hazard); real airdrop contracts typically hash an
   ABI-encoded entry as the leaf instead of raw user text. Verified in
   the tests against an independent pure-Python Keccak-256 implementation
   written from the Keccak specification for this tool. */
function merkleParseLeaf(input) {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (s === "") return null;
  if (/^0[xX]/.test(s)) {
    const bytes = parseHexBytes(s);
    if (bytes === null || bytes.length === 0) return null;
    return bytes;
  }
  return utf8Bytes(s);
}
function merkleLeafDigest(input) {
  const bytes = merkleParseLeaf(input);
  if (bytes === null) return null;
  return keccak256Digest(bytes);
}
function merkleLeafHash(input) {
  const d = merkleLeafDigest(input);
  return d === null ? null : "0x" + bytesToHex(d);
}
function merkleHashPair(a, b) {
  let lo = a, hi = b;
  for (let i = 0; i < 32; i++) {
    if (a[i] !== b[i]) { if (a[i] > b[i]) { lo = b; hi = a; } break; }
  }
  return keccak256Digest([...lo, ...hi]);
}
function merkleLayers(leafInputs) {
  if (!Array.isArray(leafInputs) || leafInputs.length === 0) return null;
  const leaves = [];
  for (const input of leafInputs) {
    const d = merkleLeafDigest(input);
    if (d === null) return null;
    leaves.push(d);
  }
  const layers = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const level = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? merkleHashPair(level[i], level[i + 1]) : level[i]);
    }
    layers.push(next);
  }
  return layers;
}
function merkleRoot(leafInputs) {
  const layers = merkleLayers(leafInputs);
  if (layers === null) return null;
  return "0x" + bytesToHex(layers[layers.length - 1][0]);
}
function merkleProof(leafInputs, index) {
  const layers = merkleLayers(leafInputs);
  if (layers === null) return null;
  if (!Number.isInteger(index) || index < 0 || index >= layers[0].length) return null;
  const proof = [];
  let idx = index;
  for (let li = 0; li < layers.length - 1; li++) {
    const level = layers[li];
    if (idx % 2 === 1) proof.push("0x" + bytesToHex(level[idx - 1]));
    else if (idx + 1 < level.length) proof.push("0x" + bytesToHex(level[idx + 1]));
    idx = Math.floor(idx / 2);
  }
  return {
    root: "0x" + bytesToHex(layers[layers.length - 1][0]),
    leaf: "0x" + bytesToHex(layers[0][index]),
    proof
  };
}
function merkleVerify(leafInput, proof, root) {
  const leaf = merkleLeafDigest(leafInput);
  if (leaf === null || !Array.isArray(proof) || typeof root !== "string") return false;
  const rootBytes = parseHexBytes(root, 32);
  if (rootBytes === null) return false;
  let node = leaf;
  for (const el of proof) {
    const sib = parseHexBytes(el, 32);
    if (sib === null) return false;
    node = merkleHashPair(node, sib);
  }
  return bytesToHex(node) === bytesToHex(rootBytes);
}

/* ---------- browser wiring ---------- */
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    /* catalogue filter */
    const buttons = document.querySelectorAll("[data-filter]");
    const cards = document.querySelectorAll("[data-cat]");
    buttons.forEach(btn => btn.addEventListener("click", () => {
      buttons.forEach(x => x.classList.toggle("active", x === btn));
      const f = btn.getAttribute("data-filter");
      cards.forEach(card => {
        card.style.display = (f === "all" || card.getAttribute("data-cat").split(" ").includes(f)) ? "" : "none";
      });
    }));

    /* wei converter */
    const convBtn = document.getElementById("conv-btn");
    if (convBtn) convBtn.addEventListener("click", () => {
      const v = document.getElementById("conv-value").value;
      const from = document.getElementById("conv-from").value;
      const to = document.getElementById("conv-to").value;
      const out = convertUnit(v, from, to);
      document.getElementById("conv-out").textContent =
        out === null ? "Enter a valid non-negative amount (check decimal places for the unit)." : `${v} ${from} = ${out} ${to}`;
    });

    /* EIP-55 inspector */
    const addrBtn = document.getElementById("addr-btn");
    if (addrBtn) addrBtn.addEventListener("click", () => {
      const input = document.getElementById("addr-input").value;
      const r = inspectAddress(input);
      const el = document.getElementById("addr-out");
      if (!r.valid) {
        el.textContent = "Not a well-formed Ethereum address — expected 0x followed by 40 hex characters.";
        return;
      }
      let msg = `Well-formed address. EIP-55 checksummed form: ${r.checksum}`;
      if (r.checksumValid === true) msg += " The checksum in your input is valid.";
      else if (r.checksumValid === false) msg += " Warning: your input is mixed-case but its checksum does NOT match — treat it as suspect.";
      else msg += " Your input is single-case, so it carries no checksum to verify.";
      el.textContent = msg;
    });

    /* Function selector / event topic */
    const sigBtn = document.getElementById("sig-btn");
    if (sigBtn) sigBtn.addEventListener("click", () => {
      const input = document.getElementById("sig-input").value;
      const sel = functionSelector(input);
      const el = document.getElementById("sig-out");
      if (sel === null) {
        el.textContent = "Enter a canonical signature like transfer(address,uint256) — a name, then comma-separated types in parentheses, no return types.";
        return;
      }
      el.textContent = `Function selector: ${sel} · Event topic0: ${eventTopic(input)} (both Keccak-256 of "${normalizeSignature(input)}", computed locally).`;
    });
    const sigPreset = document.getElementById("sig-preset");
    if (sigPreset) sigPreset.addEventListener("change", () => {
      if (sigPreset.value) document.getElementById("sig-input").value = sigPreset.value;
    });

    /* CREATE2 calculator */
    const c2Btn = document.getElementById("c2-btn");
    if (c2Btn) c2Btn.addEventListener("click", () => {
      const r = create2Address(
        document.getElementById("c2-deployer").value,
        document.getElementById("c2-salt").value,
        document.getElementById("c2-init").value
      );
      const el = document.getElementById("c2-out");
      el.textContent = r === null
        ? "Check the inputs: deployer must be a 20-byte address (0x + 40 hex), salt a 32-byte value (0x + 64 hex), and init code even-length hex (0x… may be empty)."
        : `CREATE2 address: ${r} (EIP-55 checksummed). The same deployer, salt and init code produce this address on Ethereum, Base, Unichain and Robinhood Chain — computed locally, nothing deployed.`;
    });

    /* CREATE calculator */
    const createBtn = document.getElementById("create-btn");
    if (createBtn) createBtn.addEventListener("click", () => {
      const r = createAddress(
        document.getElementById("create-sender").value,
        document.getElementById("create-nonce").value
      );
      const el = document.getElementById("create-out");
      el.textContent = r === null
        ? "Check the inputs: sender must be a 20-byte address (0x + 40 hex) and nonce a whole number of 0 or more."
        : `CREATE address: ${r} (EIP-55 checksummed). An account deploying with this nonce gets this address on Ethereum, Base, Unichain and Robinhood Chain — computed locally, nothing deployed.`;
    });

    /* ENS namehash */
    const ensBtn = document.getElementById("ens-btn");
    if (ensBtn) ensBtn.addEventListener("click", () => {
      const input = document.getElementById("ens-input").value;
      const r = namehash(input);
      const el = document.getElementById("ens-out");
      if (r === null) {
        el.textContent = "Enter an ENS name made of ASCII labels (a–z, 0–9, hyphen, underscore) separated by dots, e.g. foo.eth. Internationalised names need full UTS-46 normalisation, which this local tool does not do — it will not guess at their hash.";
        return;
      }
      const trimmed = input.trim().toLowerCase();
      const lastLabel = trimmed === "" ? "" : trimmed.split(".").pop();
      const lh = lastLabel ? ` Labelhash of "${lastLabel}": ${labelhash(lastLabel)}.` : " The empty name is the ENS root node.";
      el.textContent = `Namehash (EIP-137): ${r}.${lh} Computed locally — a namehash is an identifier, not a lookup: no resolver is queried and no live chain data is shown.`;
    });

    /* EIP-712 domain separator */
    const domBtn = document.getElementById("dom712-btn");
    if (domBtn) domBtn.addEventListener("click", () => {
      const r = eip712DomainSeparator(
        document.getElementById("dom712-name").value,
        document.getElementById("dom712-version").value,
        document.getElementById("dom712-chain").value,
        document.getElementById("dom712-contract").value
      );
      const el = document.getElementById("dom712-out");
      el.textContent = r === null
        ? "Check the inputs: name and version must be non-empty, chain ID a whole number of 1 or more, and the verifying contract a 20-byte address (0x + 40 hex)."
        : `Domain separator: ${r} · Domain type hash: ${EIP712_DOMAIN_TYPEHASH}. Computed locally for the canonical four-field EIP712Domain — nothing is signed and no wallet is involved.`;
    });

    /* EIP-712 typed-data digest (Ether Mail schema) */
    const mailBtn = document.getElementById("m712-btn");
    if (mailBtn) mailBtn.addEventListener("click", () => {
      const r = eip712MailDigest(
        document.getElementById("m712-dname").value,
        document.getElementById("m712-dversion").value,
        document.getElementById("m712-dchain").value,
        document.getElementById("m712-dcontract").value,
        document.getElementById("m712-from-name").value,
        document.getElementById("m712-from-wallet").value,
        document.getElementById("m712-to-name").value,
        document.getElementById("m712-to-wallet").value,
        document.getElementById("m712-contents").value
      );
      const el = document.getElementById("m712-out");
      el.textContent = r === null
        ? "Check the inputs: domain name and version must be non-empty, chain ID a whole number of 1 or more, every contract/wallet a 20-byte address (0x + 40 hex), and both person names non-empty."
        : `Signable digest: ${r.digest} · hashStruct(Mail): ${r.structHash} · Domain separator: ${r.domainSeparator} · Mail type hash: ${r.mailTypeHash}. This is the hash a wallet would sign for this message — computed locally only; nothing is signed and no wallet is involved.`;
    });

    /* Proxy & namespaced storage slots (ERC-1967 / ERC-7201) */
    const slotBtn = document.getElementById("slot-btn");
    if (slotBtn) slotBtn.addEventListener("click", () => {
      const kind = document.getElementById("slot-kind").value;
      const ns = document.getElementById("slot-ns").value;
      const s1967 = erc1967Slot(kind);
      const s7201 = erc7201Slot(ns);
      const el = document.getElementById("slot-out");
      if (s1967 === null || s7201 === null) {
        el.textContent = "Check the inputs: pick one of the ERC-1967 slots, and give an ERC-7201 namespace ID with no whitespace (e.g. example.main).";
        return;
      }
      el.textContent = `ERC-1967 ${kind} slot: ${s1967} · ERC-7201 slot for "${ns.trim()}": ${s7201}. Both are Keccak-256 derivations computed locally — pass a slot to eth_getStorageAt in your own tooling to read a contract; this page reads no chain state.`;
    });

    /* ABI calldata encoder */
    const abiBtn = document.getElementById("abi-btn");
    if (abiBtn) abiBtn.addEventListener("click", () => {
      const el = document.getElementById("abi-out");
      let values;
      try { values = JSON.parse(document.getElementById("abi-args").value); }
      catch (e) { values = undefined; }
      const r = Array.isArray(values)
        ? abiEncodeCall(document.getElementById("abi-sig").value, values)
        : null;
      el.textContent = r === null
        ? "Check the inputs: a canonical signature over the supported types, and arguments as a JSON array matching it — integers as decimal or 0x strings, true/false for bool, 0x hex or plain text for bytes, arrays as JSON arrays."
        : `Calldata for ${r.canonical} — selector ${r.selector}, ${(r.calldata.length - 2) / 2} bytes total: ${r.calldata}. Encoded locally per the Solidity ABI specification — this is data you could paste into your own tooling; nothing is sent anywhere and no transaction is made.`;
    });

    /* ABI calldata decoder */
    const decBtn = document.getElementById("dec-btn");
    if (decBtn) decBtn.addEventListener("click", () => {
      const r = abiDecodeCall(
        document.getElementById("dec-sig").value,
        document.getElementById("dec-data").value
      );
      const el = document.getElementById("dec-out");
      el.textContent = r === null
        ? "That calldata does not strictly decode for this signature — check the selector matches the signature, the hex is complete (0x-prefixed, even length), and every value is canonically encoded (in-range integers, bool 0/1, zero padding, valid offsets, no trailing bytes)."
        : `Arguments for ${r.canonical} (selector ${r.selector}): ${JSON.stringify(r.args)}. Integers are decimal strings, addresses and bytes are 0x hex — exactly the JSON form the encoder above accepts, so a decode re-encodes byte-for-byte. Decoded locally; nothing is sent anywhere.`;
    });

    /* Merkle root & proof calculator */
    const mrkBtn = document.getElementById("mrk-btn");
    if (mrkBtn) mrkBtn.addEventListener("click", () => {
      const el = document.getElementById("mrk-out");
      const raw = document.getElementById("mrk-leaves").value;
      const leaves = raw.split("\n");
      const idxStr = document.getElementById("mrk-index").value.trim();
      const r = /^\d+$/.test(idxStr) ? merkleProof(leaves, Number(idxStr) - 1) : null;
      if (r === null) {
        el.textContent = "Check the inputs: at least one leaf, no blank lines, hex leaves as 0x-prefixed even-length hex with at least one byte, and a leaf number between 1 and the number of leaves.";
        return;
      }
      const ok = merkleVerify(leaves[Number(idxStr) - 1], r.proof, r.root);
      el.textContent = `Merkle root (over ${leaves.length} leaves): ${r.root} · Leaf #${idxStr} hash: ${r.leaf} · Proof (${r.proof.length} sibling${r.proof.length === 1 ? "" : "s"}, bottom-up): ${JSON.stringify(r.proof)} · Self-check: ${ok ? "the proof folds back to the root ✓" : "FAILED — this is a bug; the proof should always verify"}. Computed locally — nothing is sent anywhere.`;
    });

    /* EIP-1559 estimator */
    const gasBtn = document.getElementById("gas-btn");
    if (gasBtn) gasBtn.addEventListener("click", () => {
      const r = gasEstimate(
        document.getElementById("gas-units").value,
        document.getElementById("gas-base").value,
        document.getElementById("gas-priority").value
      );
      const el = document.getElementById("gas-out");
      el.textContent = r === null
        ? "Enter valid numbers: gas units (whole), base fee and priority fee in gwei (up to 9 decimals)."
        : `Effective gas price: ${r.effectiveGwei} gwei → expected cost ${r.expectedEth} ETH. Max fee per gas (2×base + priority): ${r.maxFeeGwei} gwei → max cost ${r.maxEth} ETH. Model only — not live network data.`;
    });
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseScaled, formatScaled, convertUnit, keccak256, keccak256Bytes, parseHexBytes, toChecksumAddress, inspectAddress, gasEstimate, normalizeSignature, functionSelector, eventTopic, create2Address, rlpEncodeBytes, createAddress, utf8Bytes, labelhash, namehash, eip712DomainSeparator, EIP712_DOMAIN_TYPEHASH, eip712HashPerson, eip712MailDigest, EIP712_PERSON_TYPEHASH, EIP712_MAIL_TYPEHASH, erc1967Slot, erc7201Slot, ERC1967_LABELS, abiEncodeCall, abiDecodeCall, abiParseType, abiCanonicalType, merkleLeafHash, merkleRoot, merkleProof, merkleVerify, UNIT_DECIMALS };
}
