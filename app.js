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

/* ---------- EIP-1559 next-block base fee ----------
   The estimator above prices a transaction given a base fee; this is
   the protocol rule that produces the next block's fee from the
   parent's. The parent gas target is parent gas limit // 2 (the
   elasticity multiplier). A parent exactly at target leaves the fee
   unchanged; above target the fee rises by parent fee * (used -
   target) // target // 8, with a floor of 1 wei on the rise (the
   BASE_FEE_MAX_CHANGE_DENOMINATOR is 8, so a full parent raises the
   fee by exactly one eighth — 12.5%); below target it falls by the
   same quotient with no floor. All integer arithmetic in wei, as the
   EIP's own validation pseudocode writes it. Header fields are
   uint64, so gas values at or above 2^64 are refused, as is a gas
   limit so small its target would be zero. Applies the rule to
   values the user supplies — it reads no chain and shows no live
   fee. Base (an OP Stack chain) adjusts its own fee parameters, so
   treat L2 numbers as the L1 rule illustrated, not a quote. */
function nextBaseFee(parentBaseFeeGweiStr, parentGasUsedStr, parentGasLimitStr) {
  const parentFeeWei = parseScaled(String(parentBaseFeeGweiStr).trim(), 9);
  const gasUsed = parseScaled(String(parentGasUsedStr).trim(), 0);
  const gasLimit = parseScaled(String(parentGasLimitStr).trim(), 0);
  if (parentFeeWei === null || gasUsed === null || gasLimit === null) return null;
  if (parentFeeWei >= (1n << 256n)) return null;
  if (gasUsed >= (1n << 64n) || gasLimit >= (1n << 64n)) return null;
  const target = gasLimit / 2n;
  if (target === 0n) return null;
  if (gasUsed > gasLimit) return null;
  let deltaWei, direction;
  if (gasUsed === target) { deltaWei = 0n; direction = "unchanged"; }
  else if (gasUsed > target) {
    const raw = parentFeeWei * (gasUsed - target) / target / 8n;
    deltaWei = raw > 1n ? raw : 1n;
    direction = "up";
  } else {
    deltaWei = parentFeeWei * (target - gasUsed) / target / 8n;
    direction = "down";
  }
  const nextWei = direction === "up" ? parentFeeWei + deltaWei
    : direction === "down" ? parentFeeWei - deltaWei : parentFeeWei;
  return {
    gasTarget: target.toString(),
    direction,
    deltaWei: deltaWei.toString(),
    deltaGwei: formatScaled(deltaWei, 9),
    nextBaseFeeWei: nextWei.toString(),
    nextBaseFeeGwei: formatScaled(nextWei, 9)
  };
}

/* ---------- Intrinsic gas (minimum gas limit) ----------
   Every transaction must carry a gas limit at least its intrinsic
   cost before any EVM execution runs — the gas-units input the
   estimator above takes as given. The standard cost (EIP-2930's
   inherited formula, with EIP-2028 calldata pricing) is:
     21000 base
     + 4 per zero calldata byte, 16 per non-zero byte
     + 2400 per access-list address, 1900 per storage key
     + for a contract-creation transaction: 32000 plus the
       EIP-3860 initcode word cost, 2 per 32-byte word of initcode
       (rounded up); initcode over 49,152 bytes makes the
       transaction invalid, so it is refused here
     + for an EIP-7702 set-code transaction: 25000
       (PER_EMPTY_ACCOUNT_COST) per authorization. A set-code
       transaction must have a destination, so authorizations
       combined with creation are refused.
   Since Prague, EIP-7623 adds a calldata floor:
   tokens = zero bytes + 4 * non-zero bytes, and a transaction is
   invalid with a gas limit below 21000 + 10 * tokens. The minimum
   gas limit is the larger of the standard intrinsic cost and
   that floor — the floor binds on data-heavy transactions whose
   execution is cheap. This is a minimum, not a prediction:
   execution beyond the intrinsic cost needs more gas, and L2s
   add their own fees and may adjust these parameters. Counts are
   capped at 1,000,000 entries each as an input sanity bound. */
function parseCount(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (!/^\d+$/.test(s) || s.length > 7) return null;
  const n = Number(s);
  return n <= 1000000 ? n : null;
}

function intrinsicGas(dataStr, kind, addrsStr, keysStr, authsStr) {
  if (typeof dataStr !== "string" || dataStr.trim() === "") return null;
  if (kind !== "call" && kind !== "create") return null;
  const bytes = parseHexBytes(dataStr);
  if (bytes === null) return null;
  const addrs = parseCount(addrsStr);
  const keys = parseCount(keysStr);
  const auths = parseCount(authsStr);
  if (addrs === null || keys === null || auths === null) return null;
  const creation = kind === "create";
  if (creation && bytes.length > 49152) return null;
  if (creation && auths > 0) return null;
  let zero = 0;
  for (const b of bytes) if (b === 0) zero++;
  const nonzero = bytes.length - zero;
  const tokens = BigInt(zero) + 4n * BigInt(nonzero);
  const dataCost = 4n * tokens;
  const accessCost = 2400n * BigInt(addrs) + 1900n * BigInt(keys);
  const createCost = creation
    ? 32000n + 2n * BigInt(Math.ceil(bytes.length / 32)) : 0n;
  const authCost = 25000n * BigInt(auths);
  const standard = 21000n + dataCost + accessCost + createCost + authCost;
  const floor = 21000n + 10n * tokens;
  const minimum = standard > floor ? standard : floor;
  return {
    byteLength: String(bytes.length),
    zeroBytes: String(zero),
    nonzeroBytes: String(nonzero),
    tokens: tokens.toString(),
    dataCost: dataCost.toString(),
    accessCost: accessCost.toString(),
    createCost: createCost.toString(),
    authCost: authCost.toString(),
    standard: standard.toString(),
    floor: floor.toString(),
    minimum: minimum.toString(),
    floorBinds: floor > standard
  };
}

/* ---------- EIP-4844 blob gas & base fee ----------
   Blob gas is priced by its own EIP-1559-like rule: each block's header
   carries excess_blob_gas, a running total of blob gas consumed above the
   target, and the base fee per blob gas is
   fake_exponential(MIN_BASE_FEE_PER_BLOB_GAS = 1, excess, update fraction)
   — the Taylor-series approximation EIP-4844 specifies, computed here in
   exact BigInt arithmetic exactly as the EIP's pseudocode writes it.
   Cancun (EIP-4844): target 393,216 blob gas (3 blobs), max 786,432 (6),
   fraction 3,338,477. Prague (EIP-7691): target 786,432 (6), max 1,179,648
   (9), fraction 5,007,716. Inputs are capped at 9 digits: real excess
   values sit far below that, and the cap keeps the Taylor loop's output
   size bounded. A parent block cannot have used more than the schedule's
   maximum blob gas, so that is refused rather than extrapolated. */
const BLOB_GAS_PER_BLOB = 131072n;
const BLOB_SCHEDULES = {
  cancun: { targetBlobGas: 393216n, maxBlobGas: 786432n, updateFraction: 3338477n },
  prague: { targetBlobGas: 786432n, maxBlobGas: 1179648n, updateFraction: 5007716n }
};

function fakeExponential(factor, numerator, denominator) {
  let i = 1n;
  let output = 0n;
  let numeratorAccum = factor * denominator;
  while (numeratorAccum > 0n) {
    output += numeratorAccum;
    numeratorAccum = (numeratorAccum * numerator) / (denominator * i);
    i += 1n;
  }
  return output / denominator;
}

function parseBlobUint(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (!/^\d+$/.test(s) || s.length > 9) return null;
  return BigInt(s);
}

function blobFeeCalc(parentExcessStr, parentUsedStr, blobCountStr, scheduleName) {
  const sched = BLOB_SCHEDULES[scheduleName];
  if (!sched) return null;
  const parentExcess = parseBlobUint(parentExcessStr);
  const parentUsed = parseBlobUint(parentUsedStr);
  const blobCount = parseBlobUint(blobCountStr);
  if (parentExcess === null || parentUsed === null || blobCount === null) return null;
  if (parentUsed > sched.maxBlobGas) return null;
  if (blobCount < 1n || blobCount > 10000n) return null;
  const excessBlobGas = parentExcess + parentUsed < sched.targetBlobGas
    ? 0n
    : parentExcess + parentUsed - sched.targetBlobGas;
  const baseFeePerBlobGas = fakeExponential(1n, excessBlobGas, sched.updateFraction);
  const blobGas = BLOB_GAS_PER_BLOB * blobCount;
  const totalFeeWei = blobGas * baseFeePerBlobGas;
  return {
    schedule: scheduleName,
    excessBlobGas: excessBlobGas.toString(),
    baseFeeWei: baseFeePerBlobGas.toString(),
    baseFeeGwei: formatScaled(baseFeePerBlobGas, 9),
    blobGas: blobGas.toString(),
    totalFeeWei: totalFeeWei.toString(),
    totalFeeEth: formatScaled(totalFeeWei, 18)
  };
}

/* ---------- SHA-256 & EIP-4844 blob versioned hash ----------
   One place on the hub needs SHA-256 rather than Keccak-256: a blob
   transaction names each blob by its versioned hash,
   kzg_to_versioned_hash(commitment) =
   VERSIONED_HASH_VERSION_KZG (0x01) || sha256(commitment)[1:]
   where the commitment is the blob's 48-byte KZG commitment (a
   compressed BLS G1 point) from its sidecar. SHA-256 here is the
   FIPS 180-4 function, implemented directly; it is NOT Keccak-256
   (Ethereum's usual hash) and the two are never interchangeable.
   Honest scope: this derives the hash from a commitment only. It
   does not compute the commitment from blob data (that is KZG /
   BLS cryptography needing a trusted-setup library) and it does
   not verify any KZG proof — it also cannot check that the bytes
   given are a valid curve point, only that there are 48 of them. */
const SHA256_H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function rotr32(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

function sha256Bytes(inputBytes) {
  const bytes = Array.from(inputBytes);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(Math.floor(bitLen / 2 ** (8 * i)) % 256);
  const h = SHA256_H0.slice();
  const w = new Array(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = ((bytes[off + 4 * t] << 24) | (bytes[off + 4 * t + 1] << 16) |
              (bytes[off + 4 * t + 2] << 8) | bytes[off + 4 * t + 3]) >>> 0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = (rotr32(w[t - 15], 7) ^ rotr32(w[t - 15], 18) ^ (w[t - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[t - 2], 17) ^ rotr32(w[t - 2], 19) ^ (w[t - 2] >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let t = 0; t < 64; t++) {
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (hh + S1 + ch + SHA256_K[t] + w[t]) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const v = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i++) h[i] = (h[i] + v[i]) >>> 0;
  }
  const out = [];
  for (const x of h) out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255);
  return out;
}

function blobVersionedHash(commitmentStr) {
  const bytes = parseHexBytes(commitmentStr, 48);
  if (bytes === null) return null;
  const digest = sha256Bytes(bytes);
  digest[0] = 0x01; /* VERSIONED_HASH_VERSION_KZG */
  return "0x" + bytesToHex(digest);
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

/* ---------- Uniswap V2 pair / V3 pool address (CREATE2) ----------
   Uniswap's factories deploy pairs/pools with CREATE2, so the address
   is computable offline from the factory, the two tokens and a fixed
   init code hash — the derivation Uniswap's own developer docs (V2)
   and the v3-periphery PoolAddress library (V3) publish:
     V2: salt = keccak256(token0 ++ token1), the two 20-byte addresses
         packed (40 bytes); canonical init code hash 0x96e8ac42…
     V3: salt = keccak256(abi.encode(token0, token1, fee)), three
         32-byte words; canonical init code hash 0xe34f199b…
   In both, token0 is the numerically smaller token address: the
   factories sort the pair themselves and refuse identical or
   zero-address tokens, so those inputs are refused here too. A V3
   fee must be a non-zero uint24 (the factory must also have that
   tier enabled, which is chain state this tool does not read).
   Factory and init code hash are inputs, not constants, because
   deployments on other chains (Base, Unichain) use their own factory
   and a differently compiled fork has a different init code hash;
   the canonical Ethereum-mainnet values are the page's defaults.
   Computes the address only: whether a pair/pool actually exists at
   it is a chain query (the factory's getPair/getPool), which this
   tool does not make. Verified against the canonical mainnet
   pairs/pools in the tests. */
const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const UNISWAP_V2_INIT_CODE_HASH = "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";
const UNISWAP_V3_INIT_CODE_HASH = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";

function uniswapPoolAddress(protocol, factory, tokenA, tokenB, feeStr, initCodeHash) {
  if (protocol !== "v2" && protocol !== "v3") return null;
  const factoryBytes = parseHexBytes(factory, 20);
  const aBytes = parseHexBytes(tokenA, 20);
  const bBytes = parseHexBytes(tokenB, 20);
  const initHashBytes = parseHexBytes(initCodeHash, 32);
  if (factoryBytes === null || aBytes === null || bBytes === null || initHashBytes === null) return null;
  const isZero = (bs) => bs.every((b) => b === 0);
  if (isZero(aBytes) || isZero(bBytes)) return null;
  let cmp = 0;
  for (let i = 0; i < 20 && cmp === 0; i++) cmp = aBytes[i] - bBytes[i];
  if (cmp === 0) return null;
  const t0 = cmp < 0 ? aBytes : bBytes;
  const t1 = cmp < 0 ? bBytes : aBytes;
  let salt;
  if (protocol === "v2") {
    salt = keccak256Digest([...t0, ...t1]);
  } else {
    if (typeof feeStr !== "string" || !/^\d+$/.test(feeStr.trim())) return null;
    const fee = BigInt(feeStr.trim());
    if (fee === 0n || fee >= (1n << 24n)) return null;
    const word = (bs) => [...new Array(12).fill(0), ...bs];
    const feeWord = [];
    let v = fee;
    for (let i = 0; i < 32; i++) { feeWord.unshift(Number(v & 0xffn)); v >>= 8n; }
    salt = keccak256Digest([...word(t0), ...word(t1), ...feeWord]);
  }
  const digest = keccak256Digest([0xff, ...factoryBytes, ...salt, ...initHashBytes]);
  return {
    address: toChecksumAddress("0x" + bytesToHex(digest.slice(12))),
    token0: toChecksumAddress("0x" + bytesToHex(t0)),
    token1: toChecksumAddress("0x" + bytesToHex(t1)),
    salt: "0x" + bytesToHex(salt)
  };
}

/* ---------- Uniswap V2 swap quote (exact input / exact output / spot quote) ----------
   The pricing math of UniswapV2Library in v2-periphery, run locally on
   reserves the user supplies (a pair's reserves are chain state, read
   via its getReserves — this tool makes no such query, so the numbers
   below are a formula applied to supplied values, not live pool data).
   A V2 pair holds the constant product reserveIn × reserveOut and
   charges 0.3% on the input, which the library applies as a 997/1000
   factor in exact integer arithmetic:
     exact input:  amountOut = (amountIn × 997 × reserveOut)
                               ÷ (reserveIn × 1000 + amountIn × 997),
                   rounded down;
     exact output: amountIn  = (reserveIn × amountOut × 1000)
                               ÷ ((reserveOut − amountOut) × 997) + 1,
                   the +1 rounding the required input UP, so the pair's
                   invariant check passes on the computed input;
     spot quote:   amountB   = amountA × reserveB ÷ reserveA, rounded
                   down — the reserve ratio itself: no fee, no price
                   movement, and not a trade quote.
   Reserves are stored by the pair as uint112, so a reserve at or above
   2^112 cannot describe a real V2 pair and is refused. Amounts are in
   each token's base units (the raw integers the contracts use). An
   exact-input amount so small it buys less than 1 base unit of the
   output is refused: the library's formula yields 0 there, and the
   pair itself reverts on a zero-output swap. Price impact is measured
   against the pre-trade reserve ratio and includes the 0.3% fee:
   1 − (amountOut × reserveIn) ÷ (amountIn × reserveOut), rendered as
   a percent truncated to 4 decimal places (display rounding only —
   the amounts themselves are exact). Single pair only: a multi-hop
   route chains this calculation per hop. Forks whose fee differs
   from 0.3% are out of scope rather than approximated. */
function uniswapV2Quote(mode, reserveInStr, reserveOutStr, amountStr) {
  if (mode !== "out" && mode !== "in" && mode !== "quote") return null;
  const parseAmt = (str) => {
    if (typeof str !== "string") return null;
    const s = str.trim();
    if (!/^\d+$/.test(s) || s.length > 78) return null;
    return BigInt(s);
  };
  const reserveIn = parseAmt(reserveInStr);
  const reserveOut = parseAmt(reserveOutStr);
  const amount = parseAmt(amountStr);
  if (reserveIn === null || reserveOut === null || amount === null) return null;
  const MAX_RESERVE = (1n << 112n) - 1n;
  if (reserveIn === 0n || reserveOut === 0n) return null;
  if (reserveIn > MAX_RESERVE || reserveOut > MAX_RESERVE) return null;
  if (amount === 0n) return null;
  let amountIn, amountOut;
  if (mode === "out") {
    amountIn = amount;
    const amountInWithFee = amountIn * 997n;
    amountOut = (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
    if (amountOut === 0n) return null;
  } else if (mode === "in") {
    amountOut = amount;
    if (amountOut >= reserveOut) return null;
    amountIn = (reserveIn * amountOut * 1000n) / ((reserveOut - amountOut) * 997n) + 1n;
  } else {
    amountIn = amount;
    amountOut = (amountIn * reserveOut) / reserveIn;
  }
  let impactPercent = null;
  if (mode !== "quote") {
    const den = amountIn * reserveOut;
    const scaled = ((den - amountOut * reserveIn) * 1000000n) / den;
    impactPercent = `${scaled / 10000n}.${String(scaled % 10000n).padStart(4, "0")}`;
  }
  const traded = mode !== "quote";
  return {
    mode,
    amountIn: amountIn.toString(),
    amountOut: amountOut.toString(),
    impactPercent,
    newReserveIn: (traded ? reserveIn + amountIn : reserveIn).toString(),
    newReserveOut: (traded ? reserveOut - amountOut : reserveOut).toString()
  };
}

/* ---------- Uniswap V2 liquidity mint & burn (UniswapV2Pair) ----------
   The liquidity math of UniswapV2Pair in v2-core, run locally on values
   the user supplies (a pair's reserves, balances and total supply are
   chain state — this tool makes no chain query, so the numbers below
   are the contract's formulas applied to supplied values, not live
   pool data).
   Mint, existing pair: the pair measures the amounts actually
   deposited (balance − reserve) and mints
     liquidity = min(amount0 × totalSupply ÷ reserve0,
                     amount1 × totalSupply ÷ reserve1),
   both divisions floored, so the scarcer side relative to the pair's
   ratio governs and an unbalanced deposit earns no credit for its
   excess (the excess stays in the pair for all LPs). A result of 0
   reverts in the pair (INSUFFICIENT_LIQUIDITY_MINTED) and is refused.
   Mint, first deposit (totalSupply 0, reserves 0):
     liquidity = sqrt(amount0 × amount1) − MINIMUM_LIQUIDITY,
   with sqrt the Babylonian integer square root of the pair's Math
   library (floor), and MINIMUM_LIQUIDITY = 1000 LP units minted to
   the zero address and locked forever, so the first depositor
   receives sqrt(product) − 1000 and the pair's total supply becomes
   sqrt(product). A product whose root is at most 1000 mints nothing
   to the depositor and is refused.
   Burn: the pair pays pro-rata from its token BALANCES (not its
   reserves — balances can exceed reserves by donations and accrued
   fees, and the pair's comment notes balances are used so the payout
   is pro-rata):
     amount_i = liquidity × balance_i ÷ totalSupply, floored;
   a payout of 0 on either side reverts (INSUFFICIENT_LIQUIDITY_BURNED)
   and is refused, as is burning more than the total supply.
   Reserves and post-event balances are uint112 in the pair's _update,
   so any reserve/balance, and any reserve + deposit, above
   2^112 − 1 is refused. Amounts are in each token's base units; LP
   amounts are in the pair token's own base units. The pair's optional
   protocol-fee mint (_mintFee, when the factory's feeTo is set) can
   increase totalSupply immediately before a mint or burn; it is NOT
   modelled — the totalSupply supplied here is taken as the supply at
   the liquidity event itself. The depositor's pool share after a mint
   is shown as a percent truncated to 4 decimals (display only). */
const V2_MINIMUM_LIQUIDITY = 1000n;
const V2_MAX112 = (1n << 112n) - 1n;
function v2ParseUint(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (!/^\d+$/.test(s) || s.length > 78) return null;
  return BigInt(s);
}
function v2Sqrt(y) {
  if (y > 3n) {
    let z = y;
    let x = y / 2n + 1n;
    while (x < z) { z = x; x = (y / x + x) / 2n; }
    return z;
  }
  return y !== 0n ? 1n : 0n;
}
function v2SharePercent(liq, newTotalSupply) {
  const scaled = (liq * 1000000n) / newTotalSupply;
  return `${scaled / 10000n}.${String(scaled % 10000n).padStart(4, "0")}`;
}
function uniswapV2Mint(reserve0Str, reserve1Str, totalSupplyStr, amount0Str, amount1Str) {
  const reserve0 = v2ParseUint(reserve0Str);
  const reserve1 = v2ParseUint(reserve1Str);
  const totalSupply = v2ParseUint(totalSupplyStr);
  const amount0 = v2ParseUint(amount0Str);
  const amount1 = v2ParseUint(amount1Str);
  if (reserve0 === null || reserve1 === null || totalSupply === null || amount0 === null || amount1 === null) return null;
  if (amount0 === 0n || amount1 === 0n) return null;
  if (reserve0 + amount0 > V2_MAX112 || reserve1 + amount1 > V2_MAX112) return null;
  if (totalSupply === 0n) {
    if (reserve0 !== 0n || reserve1 !== 0n) return null;
    const rootK = v2Sqrt(amount0 * amount1);
    if (rootK <= V2_MINIMUM_LIQUIDITY) return null;
    const liquidity = rootK - V2_MINIMUM_LIQUIDITY;
    return {
      first: true, liquidity: liquidity.toString(), locked: V2_MINIMUM_LIQUIDITY.toString(),
      rootK: rootK.toString(), newTotalSupply: rootK.toString(),
      newReserve0: amount0.toString(), newReserve1: amount1.toString(),
      sharePercent: v2SharePercent(liquidity, rootK)
    };
  }
  if (reserve0 === 0n || reserve1 === 0n) return null;
  const liq0 = (amount0 * totalSupply) / reserve0;
  const liq1 = (amount1 * totalSupply) / reserve1;
  const liquidity = liq0 < liq1 ? liq0 : liq1;
  if (liquidity === 0n) return null;
  const newTotalSupply = totalSupply + liquidity;
  return {
    first: false, liquidity: liquidity.toString(), locked: "0", rootK: null,
    newTotalSupply: newTotalSupply.toString(),
    newReserve0: (reserve0 + amount0).toString(), newReserve1: (reserve1 + amount1).toString(),
    sharePercent: v2SharePercent(liquidity, newTotalSupply)
  };
}
function uniswapV2Burn(balance0Str, balance1Str, totalSupplyStr, liquidityStr) {
  const balance0 = v2ParseUint(balance0Str);
  const balance1 = v2ParseUint(balance1Str);
  const totalSupply = v2ParseUint(totalSupplyStr);
  const liquidity = v2ParseUint(liquidityStr);
  if (balance0 === null || balance1 === null || totalSupply === null || liquidity === null) return null;
  if (totalSupply === 0n || liquidity === 0n || liquidity > totalSupply) return null;
  if (balance0 > V2_MAX112 || balance1 > V2_MAX112) return null;
  const amount0 = (liquidity * balance0) / totalSupply;
  const amount1 = (liquidity * balance1) / totalSupply;
  if (amount0 === 0n || amount1 === 0n) return null;
  return {
    amount0: amount0.toString(), amount1: amount1.toString(),
    newTotalSupply: (totalSupply - liquidity).toString(),
    newBalance0: (balance0 - amount0).toString(), newBalance1: (balance1 - amount1).toString()
  };
}

/* ---------- Uniswap V3 tick ⇄ sqrtPriceX96 converter (TickMath) ----------
   A Uniswap V3 pool's price is carried as sqrtPriceX96, the square
   root of the token1/token0 price in Q64.96 fixed point, and its tick
   is the price on a 1.0001 grid: sqrtPriceX96 = sqrt(1.0001^tick) ×
   2^96. TickMath in v3-core computes both directions in exact integer
   arithmetic; this is that math transcribed to BigInt:
     tick → sqrt: a Q128.128 product over the tick's set bits of the
       library's precomputed sqrt(1.0001^(2^i)) factors, inverted when
       the tick is positive, then divided by 2^32 rounding UP — so the
       result is the exact value or 1 above its floor, never below it;
     sqrt → tick: a log2 of the ratio (the EVM's wrapping 256-bit
       multiply is masked here), scaled by log base 2 of sqrt(1.0001),
       bracketed by the library's two error bounds and resolved against
       the forward direction — the greatest tick whose sqrt ratio is
       at most the input.
   Ticks are bounded by ±887272 (the ticks of prices 2^-128 and
   2^128); a sqrt ratio must satisfy MIN_SQRT_RATIO ≤ s < MAX_SQRT_RATIO
   — the maximum tick's own ratio is refused in the reverse direction,
   exactly as the library requires, because a price can never reach it.
   The raw price shown is the ratio itself, (sqrtPriceX96 / 2^96)^2,
   rendered truncated to 12 significant digits (display rounding only —
   tick and sqrtPriceX96 are exact). The raw price ignores token
   decimals: a pool's human price additionally scales by
   10^(decimals0 − decimals1), which needs the tokens' decimals — chain
   state this page does not read. User-supplied values only: a real
   pool's sqrtPriceX96 and tick are its slot0 chain query. */
const V3_MIN_TICK = -887272;
const V3_MAX_TICK = 887272;
const V3_MIN_SQRT = 4295128739n;
const V3_MAX_SQRT = 1461446703485210103287273052203988822378723970342n;
const V3_TICK_FACTORS = [
  [0x1n, 0xfffcb933bd6fad37aa2d162d1a594001n],
  [0x2n, 0xfff97272373d413259a46990580e213an],
  [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
  [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
  [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
  [0x20n, 0xff973b41fa98c081472e6896dfb254c0n],
  [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
  [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n],
  [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
  [0x200n, 0xf987a7253ac413176f2b074cf7815e54n],
  [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
  [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n],
  [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
  [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n],
  [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
  [0x8000n, 0x31be135f97d08fd981231505542fcfa6n],
  [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
  [0x20000n, 0x5d6af8dedb81196699c329225ee604n],
  [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
  [0x80000n, 0x48a170391f7dc42444e8fa2n]
];
function v3SqrtRatioAtTick(tick) {
  const absTick = BigInt(tick < 0 ? -tick : tick);
  let ratio = (absTick & 0x1n) !== 0n ? V3_TICK_FACTORS[0][1] : (1n << 128n);
  for (let i = 1; i < V3_TICK_FACTORS.length; i++) {
    if ((absTick & V3_TICK_FACTORS[i][0]) !== 0n) ratio = (ratio * V3_TICK_FACTORS[i][1]) >> 128n;
  }
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}
function v3TickAtSqrtRatio(sqrt) {
  const ratio = sqrt << 32n;
  let r = ratio;
  let msb = 0n;
  const steps = [
    [7n, (1n << 128n) - 1n], [6n, (1n << 64n) - 1n], [5n, (1n << 32n) - 1n],
    [4n, (1n << 16n) - 1n], [3n, (1n << 8n) - 1n], [2n, (1n << 4n) - 1n],
    [1n, (1n << 2n) - 1n], [0n, 1n]
  ];
  for (const [shift, threshold] of steps) {
    const f = r > threshold ? (1n << shift) : 0n;
    msb |= f;
    r >>= f;
  }
  r = msb >= 128n ? ratio >> (msb - 127n) : ratio << (127n - msb);
  let log2 = (msb - 128n) << 64n;
  const MASK256 = (1n << 256n) - 1n;
  for (let i = 0; i < 14; i++) {
    r = ((r * r) & MASK256) >> 127n;
    const f = r >> 128n;
    log2 |= f << BigInt(63 - i);
    if (i < 13) r >>= f;
  }
  const logSqrt10001 = log2 * 255738958999603826347141n;
  const tickLow = Number((logSqrt10001 - 3402992956809132418596140100660247210n) >> 128n);
  const tickHi = Number((logSqrt10001 + 291339464771989622907027621153398088495n) >> 128n);
  if (tickLow === tickHi) return tickLow;
  return v3SqrtRatioAtTick(tickHi) <= sqrt ? tickHi : tickLow;
}
function v3PriceString(sqrt) {
  const num = sqrt * sqrt;
  const den = 1n << 192n;
  let e;
  if (num >= den) {
    e = (num / den).toString().length - 1;
  } else {
    let k = 1;
    while (num * (10n ** BigInt(k)) < den) k++;
    e = -k;
  }
  const scaled = e - 11 >= 0
    ? num / (den * (10n ** BigInt(e - 11)))
    : (num * (10n ** BigInt(11 - e))) / den;
  const digits = scaled.toString().padStart(12, "0");
  if (digits.length !== 12) return null;
  if (e >= -6 && e < 0) return "0." + "0".repeat(-e - 1) + digits;
  if (e >= 0 && e <= 11) return digits.slice(0, e + 1) + "." + digits.slice(e + 1);
  if (e >= 12 && e < 21) return digits + "0".repeat(e - 11);
  return digits[0] + "." + digits.slice(1) + "e" + e;
}
function uniswapV3Tick(mode, valueStr) {
  if (mode !== "tick" && mode !== "sqrt") return null;
  if (typeof valueStr !== "string") return null;
  const s = valueStr.trim();
  let tick, sqrt;
  if (mode === "tick") {
    if (!/^-?\d+$/.test(s) || s.length > 7) return null;
    tick = Number(BigInt(s));
    if (tick < V3_MIN_TICK || tick > V3_MAX_TICK) return null;
    sqrt = v3SqrtRatioAtTick(tick);
  } else {
    if (/^0[xX][0-9a-fA-F]+$/.test(s)) sqrt = BigInt(s);
    else if (/^\d+$/.test(s) && s.length <= 49) sqrt = BigInt(s);
    else return null;
    if (sqrt < V3_MIN_SQRT || sqrt >= V3_MAX_SQRT) return null;
    tick = v3TickAtSqrtRatio(sqrt);
  }
  const price = v3PriceString(sqrt);
  if (price === null) return null;
  return { tick: String(tick), sqrtPriceX96: sqrt.toString(), price };
}

/* ---------- Uniswap V3 liquidity amounts calculator ----------
   A V3 position is liquidity L held between sqrt ratios A (lower tick)
   and B (upper tick) at the pool's current sqrt ratio C. The periphery
   library LiquidityAmounts, over the core library SqrtPriceMath, fixes
   the token amounts in exact integer arithmetic (all divisions floor):
     amount0 between prices a<b = ((L<<96) × (b−a) / b) / a
     amount1 between prices a<b = L × (b−a) / 2^96
   getAmountsForLiquidity (amounts rounded DOWN, as the periphery
   library computes them): at or below the range the position is all
   token0 over [A,B]; inside it, token0 over [C,B] and token1 over
   [A,C]; at or above it, all token1 over [A,B].
   getLiquidityForAmounts inverts it:
     L from amount0 over [a,b] = amount0 × ((a×b)/2^96) / (b−a)
     L from amount1 over [a,b] = amount1 × 2^96 / (b−a)
   taking the single-sided formula outside the range and the minimum of
   the two inside it. The range and current price are entered as ticks
   and converted with the TickMath code above, so every sqrt ratio is
   one a real pool can actually hold. Liquidity is a uint128 in the
   contracts: an L at or above 2^128 is refused, as is a computed L of
   0 (the desired amounts are too small to mint any liquidity at this
   range). Amounts are in each token's base units. User-supplied values
   only: a real position's ticks, liquidity and the pool's current tick
   are chain state this page does not read. */
const V3_Q96 = 1n << 96n;
function v3ParseTick(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (!/^-?\d+$/.test(s) || s.length > 7) return null;
  const t = Number(BigInt(s));
  return t < V3_MIN_TICK || t > V3_MAX_TICK ? null : t;
}
function v3ParseUint(str, maxDigits) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (!/^\d+$/.test(s) || s.length > maxDigits) return null;
  return BigInt(s);
}
function v3Amount0Delta(a, b, liq) { return ((liq << 96n) * (b - a) / b) / a; }
function v3Amount1Delta(a, b, liq) { return liq * (b - a) / V3_Q96; }
function v3AmountsForLiquidity(cur, a, b, liq) {
  if (cur <= a) return [v3Amount0Delta(a, b, liq), 0n];
  if (cur < b) return [v3Amount0Delta(cur, b, liq), v3Amount1Delta(a, cur, liq)];
  return [0n, v3Amount1Delta(a, b, liq)];
}
function v3LiquidityForAmount0(a, b, amount0) {
  const intermediate = a * b / V3_Q96;
  return amount0 * intermediate / (b - a);
}
function v3LiquidityForAmount1(a, b, amount1) { return amount1 * V3_Q96 / (b - a); }
function uniswapV3Liquidity(mode, lowerStr, upperStr, currentStr, liquidityStr, amount0Str, amount1Str) {
  if (mode !== "amounts" && mode !== "liquidity") return null;
  const tickLower = v3ParseTick(lowerStr);
  const tickUpper = v3ParseTick(upperStr);
  const tickCurrent = v3ParseTick(currentStr);
  if (tickLower === null || tickUpper === null || tickCurrent === null) return null;
  if (tickLower >= tickUpper) return null;
  const sqrtA = v3SqrtRatioAtTick(tickLower);
  const sqrtB = v3SqrtRatioAtTick(tickUpper);
  const sqrtC = v3SqrtRatioAtTick(tickCurrent);
  const base = {
    mode,
    tickLower: String(tickLower), tickUpper: String(tickUpper), tickCurrent: String(tickCurrent),
    sqrtLower: sqrtA.toString(), sqrtUpper: sqrtB.toString(), sqrtCurrent: sqrtC.toString()
  };
  if (mode === "amounts") {
    const liq = v3ParseUint(liquidityStr, 39);
    if (liq === null || liq === 0n || liq >= (1n << 128n)) return null;
    const [amount0, amount1] = v3AmountsForLiquidity(sqrtC, sqrtA, sqrtB, liq);
    return { ...base, liquidity: liq.toString(), amount0: amount0.toString(), amount1: amount1.toString() };
  }
  const amount0 = v3ParseUint(amount0Str, 78);
  const amount1 = v3ParseUint(amount1Str, 78);
  if (amount0 === null || amount1 === null) return null;
  if (amount0 >= (1n << 256n) || amount1 >= (1n << 256n)) return null;
  let liq;
  if (sqrtC <= sqrtA) liq = v3LiquidityForAmount0(sqrtA, sqrtB, amount0);
  else if (sqrtC < sqrtB) {
    const liq0 = v3LiquidityForAmount0(sqrtC, sqrtB, amount0);
    const liq1 = v3LiquidityForAmount1(sqrtA, sqrtC, amount1);
    liq = liq0 < liq1 ? liq0 : liq1;
  } else liq = v3LiquidityForAmount1(sqrtA, sqrtB, amount1);
  if (liq === 0n || liq >= (1n << 128n)) return null;
  const [used0, used1] = v3AmountsForLiquidity(sqrtC, sqrtA, sqrtB, liq);
  return {
    ...base, liquidity: liq.toString(),
    amount0: used0.toString(), amount1: used1.toString(),
    desiredAmount0: amount0.toString(), desiredAmount1: amount1.toString()
  };
}

/* ---------- Uniswap V3 swap step calculator (SwapMath) ----------
   One pool swap is a loop of single steps inside one tick range, and this
   is exactly one step: SwapMath.computeSwapStep (v3-core) over the core
   library SqrtPriceMath, transcribed to BigInt. The target tick gives the
   price the step may not exceed; the direction is inferred from it (target
   below the current price swaps token0 for token1, target above swaps
   token1 for token0). Exact-input mode spends the specified amount (plus
   the fee it implies), exact-output mode seeks the specified amount. All
   divisions follow the library: amount deltas round UP on the input side
   (the pool never moves the price past what it takes in) and DOWN on the
   output side (it never pays out more than it owes), with the input-side
   precomputation to the target rounding up and the output-side one
   rounding down, exactly as computeSwapStep passes true/false. The fee is
   taken from the input in hundredths of a bip; when the step stops before
   the target in exact-input mode, the whole leftover input is the fee
   (the library's remainder rule), otherwise the fee is the rounded-up
   amountIn × feePips / (1e6 − feePips). BigInt has no EVM overflow, so the
   primary (non-fallback) branches of SqrtPriceMath always apply here;
   the library's require conditions (positive denominator, sqrt above the
   quotient) are enforced as refusals. A real swap crosses initialized
   ticks — this step stops at the target tick's price and reports the
   remainder the next step would continue with. User-supplied values only:
   a real pool's price, liquidity and fee tier are its slot0/position
   chain state, which this page does not read. */
function v3CeilDiv(a, b) { return (a + b - 1n) / b; }
function v3MulDivUp(a, b, d) { return v3CeilDiv(a * b, d); }
function v3Amount0DeltaR(a, b, liq, up) {
  if (a > b) { const t = a; a = b; b = t; }
  const n1 = liq << 96n, n2 = b - a;
  return up ? v3CeilDiv(v3MulDivUp(n1, n2, b), a) : (n1 * n2 / b) / a;
}
function v3Amount1DeltaR(a, b, liq, up) {
  if (a > b) { const t = a; a = b; b = t; }
  return up ? v3MulDivUp(liq, b - a, V3_Q96) : liq * (b - a) / V3_Q96;
}
function v3NextFromAmount0Up(sqrt, liq, amount, add) {
  if (amount === 0n) return sqrt;
  const n1 = liq << 96n, product = amount * sqrt;
  if (add) return v3MulDivUp(n1, sqrt, n1 + product);
  if (n1 <= product) return null;
  return v3MulDivUp(n1, sqrt, n1 - product);
}
function v3NextFromAmount1Down(sqrt, liq, amount, add) {
  if (add) return sqrt + (amount * V3_Q96) / liq;
  const q = v3CeilDiv(amount * V3_Q96, liq);
  if (sqrt <= q) return null;
  return sqrt - q;
}
function v3NextFromInput(sqrt, liq, amt, zeroForOne) {
  return zeroForOne ? v3NextFromAmount0Up(sqrt, liq, amt, true) : v3NextFromAmount1Down(sqrt, liq, amt, true);
}
function v3NextFromOutput(sqrt, liq, amt, zeroForOne) {
  return zeroForOne ? v3NextFromAmount1Down(sqrt, liq, amt, false) : v3NextFromAmount0Up(sqrt, liq, amt, false);
}
const V3_FEE_DENOMINATOR = 1000000n;
function uniswapV3SwapStep(mode, currentStr, targetStr, liquidityStr, amountStr, feeStr) {
  if (mode !== "in" && mode !== "out") return null;
  const tickCurrent = v3ParseTick(currentStr);
  const tickTarget = v3ParseTick(targetStr);
  if (tickCurrent === null || tickTarget === null || tickCurrent === tickTarget) return null;
  const liq = v3ParseUint(liquidityStr, 39);
  if (liq === null || liq === 0n || liq >= (1n << 128n)) return null;
  const amount = v3ParseUint(amountStr, 78);
  if (amount === null || amount === 0n || amount >= (1n << 256n)) return null;
  const fee = v3ParseUint(feeStr, 7);
  if (fee === null || fee >= V3_FEE_DENOMINATOR) return null;
  const cur = v3SqrtRatioAtTick(tickCurrent);
  const tgt = v3SqrtRatioAtTick(tickTarget);
  const zeroForOne = cur >= tgt;
  const exactIn = mode === "in";
  let amountIn, amountOut, next;
  if (exactIn) {
    const lessFee = amount * (V3_FEE_DENOMINATOR - fee) / V3_FEE_DENOMINATOR;
    amountIn = zeroForOne ? v3Amount0DeltaR(tgt, cur, liq, true) : v3Amount1DeltaR(cur, tgt, liq, true);
    next = lessFee >= amountIn ? tgt : v3NextFromInput(cur, liq, lessFee, zeroForOne);
  } else {
    amountOut = zeroForOne ? v3Amount1DeltaR(tgt, cur, liq, false) : v3Amount0DeltaR(cur, tgt, liq, false);
    next = amount >= amountOut ? tgt : v3NextFromOutput(cur, liq, amount, zeroForOne);
  }
  if (next === null) return null;
  const reached = next === tgt;
  if (zeroForOne) {
    amountIn = (reached && exactIn) ? amountIn : v3Amount0DeltaR(next, cur, liq, true);
    amountOut = (reached && !exactIn) ? amountOut : v3Amount1DeltaR(next, cur, liq, false);
  } else {
    amountIn = (reached && exactIn) ? amountIn : v3Amount1DeltaR(cur, next, liq, true);
    amountOut = (reached && !exactIn) ? amountOut : v3Amount0DeltaR(cur, next, liq, false);
  }
  if (!exactIn && amountOut > amount) amountOut = amount;
  const feeAmount = (exactIn && !reached)
    ? amount - amountIn
    : v3MulDivUp(amountIn, fee, V3_FEE_DENOMINATOR - fee);
  const remaining = exactIn ? amount - (amountIn + feeAmount) : amount - amountOut;
  const tickNext = next === tgt ? tickTarget : next === cur ? tickCurrent : v3TickAtSqrtRatio(next);
  return {
    mode, zeroForOne,
    tickCurrent: String(tickCurrent), tickTarget: String(tickTarget), tickNext: String(tickNext),
    sqrtCurrent: cur.toString(), sqrtTarget: tgt.toString(), sqrtNext: next.toString(),
    liquidity: liq.toString(), feePips: fee.toString(),
    amountSpecified: amount.toString(), amountIn: amountIn.toString(),
    amountOut: amountOut.toString(), feeAmount: feeAmount.toString(),
    totalInput: (amountIn + feeAmount).toString(), remaining: remaining.toString(),
    reachedTarget: reached
  };
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

/* ---------- EIP-2612 permit digest ----------
   ERC-20's permit extension (EIP-2612) lets an owner sign an
   approval off-chain instead of sending an approve transaction:
   the token's permit(owner, spender, value, deadline) function
   recovers the signer of the EIP-712 digest
   keccak256(0x1901 ‖ DOMAIN_SEPARATOR ‖ hashStruct(Permit))
   and sets the allowance when the signer is the owner, the
   nonce matches the owner's current permit nonce, and the
   deadline has not passed. hashStruct(Permit) hashes the
   PERMIT_TYPEHASH -- keccak256 of the canonical type string,
   the constant OpenZeppelin's ERC20Permit publishes -- with
   the five fields as ABI words: addresses left-padded to 32
   bytes, uint256s big-endian.
   Two traps, stated on the page. First, the value and the
   deadline are raw uint256s: the value is in the token's base
   units (1 USDC is 1000000, not 1), and 2^256 - 1 in either
   field is the conventional unlimited amount / no-expiry
   deadline a great many signed permits carry. Second, the
   digest binds the token's own name and EIP-712 version from
   ITS domain -- USDC signs under "USD Coin" / "2", DAI under
   "Dai Stablecoin" / "1" -- so a digest computed with another
   token's domain belongs to a different separator and the
   signature recovers to nobody the token accepts.
   Computes the digest only -- nothing is signed, no key is
   used or asked for, and no chain is queried (whether the
   nonce is the owner's current one is chain state). */
const EIP2612_PERMIT_TYPE = "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)";
const EIP2612_PERMIT_TYPEHASH = "0x" + keccak256(EIP2612_PERMIT_TYPE);
function permitDigest(name, version, chainIdStr, token, owner, spender, valueStr, nonceStr, deadlineStr) {
  const domainSeparator = eip712DomainSeparator(name, version, chainIdStr, token);
  if (domainSeparator === null) return null;
  const ownerBytes = parseHexBytes(owner, 20);
  const spenderBytes = parseHexBytes(spender, 20);
  if (ownerBytes === null || spenderBytes === null) return null;
  const fields = [];
  for (const s of [valueStr, nonceStr, deadlineStr]) {
    if (typeof s !== "string" || !/^\d+$/.test(s.trim())) return null;
    const v = BigInt(s.trim());
    if (v >= (1n << 256n)) return null;
    fields.push(uint256WordBytes(v));
  }
  const structEncoded = [
    ...parseHexBytes(EIP2612_PERMIT_TYPEHASH, 32),
    ...new Array(12).fill(0), ...ownerBytes,
    ...new Array(12).fill(0), ...spenderBytes,
    ...fields[0], ...fields[1], ...fields[2]
  ];
  const structHash = "0x" + keccak256Bytes(structEncoded);
  const digest = "0x" + keccak256Bytes([
    0x19, 0x01, ...parseHexBytes(domainSeparator, 32), ...parseHexBytes(structHash, 32)
  ]);
  return { domainSeparator, permitTypeHash: EIP2612_PERMIT_TYPEHASH, structHash, digest };
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

/* ---------- Raw transaction decoder (RLP, strict) ----------
   Decodes a raw transaction — legacy (incl. EIP-155), EIP-2930
   (type 1), EIP-1559 (type 2), EIP-4844 (type 3, blob) and
   EIP-7702 (type 4, set code) — from its RLP encoding, and
   recomputes the two hashes a
   wallet/explorer derives from it: the transaction hash
   (keccak256 of the raw bytes) and the signing hash (keccak256
   of the unsigned payload, with the type byte prefixed for
   typed transactions). Decoding is strict in the same spirit
   as the ABI decoder above: the RLP itself must be canonical
   (no 0x81-prefixed single byte below 0x80, no long form for a
   payload of 55 bytes or less, no leading zero in a
   length-of-length), integer fields must have no leading zero
   byte, `to` must be empty (contract creation) or 20 bytes,
   access-list keys must be 32 bytes, a legacy v must be 27/28
   or an EIP-155 value >= 35, a typed v (y-parity) must be 0/1,
   and no trailing bytes are allowed. EIP-7702 adds its own
   rules from the EIP: the destination may not be empty (a set
   code transaction cannot create a contract), the
   authorization list must be non-empty, and each authorization
   tuple [chain_id, address, nonce, y_parity, r, s] must have a
   20-byte address, a nonce below 2^64 and a y-parity below
   2^8. EIP-4844 adds its own rules from the EIP: the
   destination may not be empty (a blob transaction cannot
   create a contract), the blob versioned-hash list must be
   non-empty, and every versioned hash must be exactly 32
   bytes starting with 0x01 (VERSIONED_HASH_VERSION_KZG).
   Only the execution-payload form is decoded — the pooled
   network wrapper rlp([tx_payload_body, blobs, commitments,
   proofs]) that gossip uses is a different shape and is
   refused, and no KZG proof is checked (the blobs themselves
   are not part of the payload). The signature fields are
   decoded, NOT verified — no sender is recovered and no
   chain is queried. */
function txHexToBytes(str) {
  if (typeof str !== "string") return null;
  let s = str.trim();
  if (s.startsWith("0x") || s.startsWith("0X")) s = s.slice(2);
  if (s.length === 0 || s.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(s)) return null;
  const out = [];
  for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16));
  return out;
}
function rlpDecodeItem(bytes, pos) {
  if (pos >= bytes.length) throw new Error("truncated");
  const b = bytes[pos];
  const readLen = (ll, at) => {
    if (at + ll > bytes.length) throw new Error("truncated length");
    if (bytes[at] === 0) throw new Error("length has leading zero");
    let len = 0;
    for (let i = 0; i < ll; i++) { len = len * 256 + bytes[at + i]; if (len > bytes.length) throw new Error("length too large"); }
    if (len <= 55) throw new Error("long form used for short payload");
    return len;
  };
  const decodeListPayload = (start, end) => {
    const items = [];
    let p = start;
    while (p < end) { const r = rlpDecodeItem(bytes, p); items.push(r.value); p = r.next; }
    if (p !== end) throw new Error("list payload overrun");
    return items;
  };
  if (b < 0x80) return { value: { bytes: [b] }, next: pos + 1 };
  if (b <= 0xb7) {
    const len = b - 0x80, start = pos + 1;
    if (start + len > bytes.length) throw new Error("truncated string");
    if (len === 1 && bytes[start] < 0x80) throw new Error("non-canonical single byte");
    return { value: { bytes: bytes.slice(start, start + len) }, next: start + len };
  }
  if (b <= 0xbf) {
    const ll = b - 0xb7, len = readLen(ll, pos + 1), start = pos + 1 + ll;
    if (start + len > bytes.length) throw new Error("truncated string");
    return { value: { bytes: bytes.slice(start, start + len) }, next: start + len };
  }
  if (b <= 0xf7) {
    const len = b - 0xc0, start = pos + 1;
    if (start + len > bytes.length) throw new Error("truncated list");
    return { value: { list: decodeListPayload(start, start + len) }, next: start + len };
  }
  const ll = b - 0xf7, len = readLen(ll, pos + 1), start = pos + 1 + ll;
  if (start + len > bytes.length) throw new Error("truncated list");
  return { value: { list: decodeListPayload(start, start + len) }, next: start + len };
}
function rlpEncodeItem(item) {
  if (item.bytes !== undefined) return rlpEncodeBytes(item.bytes);
  const payload = [];
  for (const child of item.list) payload.push(...rlpEncodeItem(child));
  if (payload.length <= 55) return [0xc0 + payload.length, ...payload];
  const lenBytes = [];
  let len = payload.length;
  while (len > 0) { lenBytes.unshift(len & 0xff); len >>= 8; }
  return [0xf7 + lenBytes.length, ...lenBytes, ...payload];
}
/* ---------- Standalone RLP encoder / decoder ----------
   RLP (Recursive Length Prefix) is Ethereum's canonical serialization:
   the CREATE calculator, the EIP-7702 digest and the transaction
   decoder above all build on the codec in this file, but until now a
   visitor could not use it directly. This tool exposes it in both
   directions. Input syntax for the encoder: a value is a "quoted
   string" (its UTF-8 bytes), a bare word (also its UTF-8 bytes), a
   0x hex value (those raw bytes), a decimal integer (encoded as the
   minimal big-endian byte string, so 0 is the empty string), or a
   [list, of, values] nested to any depth, with commas or whitespace
   as separators. Decoding is the strict decoder the transaction
   tool uses — non-canonical forms (a 0x81-prefixed small byte, the
   long length form for a short payload, a length with a leading
   zero), truncated input and trailing bytes are refused rather than
   tolerated — and the decoded value must re-encode to exactly the
   input bytes. Decoded byte strings render as 0x hex, with their
   text shown alongside when every byte is printable ASCII. Verified
   in the tests against the worked examples published in the
   ethereum.org RLP specification (the string "dog", ["cat","dog"],
   the empty string and list, the integers 0 and 1024, the nested
   set-theoretic list, and the 56-byte Lorem ipsum string in its long
   length form) plus vectors from an independent pure-Python RLP
   encoder written from the same rules. Encodes and decodes data
   only — nothing is sent and no chain is queried. */
function rlpTokenizeInput(str) {
  if (typeof str !== "string") return null;
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    const c = str[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === ",") { i++; continue; }
    if (c === "[") { tokens.push({ t: "open" }); i++; continue; }
    if (c === "]") { tokens.push({ t: "close" }); i++; continue; }
    if (c === "\"") {
      let j = i + 1, out = "", closed = false;
      while (j < str.length) {
        const d = str[j];
        if (d === "\\" && j + 1 < str.length && (str[j + 1] === "\"" || str[j + 1] === "\\")) { out += str[j + 1]; j += 2; continue; }
        if (d === "\"") { closed = true; j++; break; }
        out += d; j++;
      }
      if (!closed) return null;
      tokens.push({ t: "bytes", bytes: utf8Bytes(out) });
      i = j; continue;
    }
    if (c === "0" && (str[i + 1] === "x" || str[i + 1] === "X")) {
      let j = i + 2, hex = "";
      while (j < str.length && /[0-9a-fA-F]/.test(str[j])) { hex += str[j]; j++; }
      if (hex.length % 2 !== 0) return null;
      const bytes = [];
      for (let k = 0; k < hex.length; k += 2) bytes.push(parseInt(hex.slice(k, k + 2), 16));
      tokens.push({ t: "bytes", bytes });
      i = j; continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i, num = "";
      while (j < str.length && /[0-9]/.test(str[j])) { num += str[j]; j++; }
      tokens.push({ t: "bytes", bytes: bigIntToMinBytes(BigInt(num)) });
      i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i, word = "";
      while (j < str.length && /[A-Za-z0-9_.\-]/.test(str[j])) { word += str[j]; j++; }
      tokens.push({ t: "bytes", bytes: utf8Bytes(word) });
      i = j; continue;
    }
    return null;
  }
  return tokens;
}
function rlpParseTokens(tokens, pos) {
  if (pos >= tokens.length) throw new Error("unexpected end of input");
  const tk = tokens[pos];
  if (tk.t === "bytes") return { value: { bytes: tk.bytes }, next: pos + 1 };
  if (tk.t === "open") {
    const items = [];
    let p = pos + 1;
    while (p < tokens.length && tokens[p].t !== "close") { const r = rlpParseTokens(tokens, p); items.push(r.value); p = r.next; }
    if (p >= tokens.length) throw new Error("unclosed list");
    return { value: { list: items }, next: p + 1 };
  }
  throw new Error("unexpected ]");
}
function rlpEncodeInput(str) {
  const tokens = rlpTokenizeInput(str);
  if (tokens === null || tokens.length === 0) return null;
  try {
    const r = rlpParseTokens(tokens, 0);
    if (r.next !== tokens.length) return null;
    return "0x" + bytesToHex(rlpEncodeItem(r.value));
  } catch (e) { return null; }
}
function rlpRenderValue(item) {
  if (item.bytes !== undefined) {
    let s = "0x" + bytesToHex(item.bytes);
    if (item.bytes.length > 0 && item.bytes.every(b => b >= 0x20 && b < 0x7f)) {
      s += " (\"" + item.bytes.map(b => { const ch = String.fromCharCode(b); return (ch === "\"" || ch === "\\") ? "\\" + ch : ch; }).join("") + "\")";
    }
    return s;
  }
  return "[" + item.list.map(rlpRenderValue).join(", ") + "]";
}
function rlpDecodeInput(str) {
  const bytes = txHexToBytes(str);
  if (bytes === null) return null;
  try {
    const r = rlpDecodeItem(bytes, 0);
    if (r.next !== bytes.length) return null;
    const re = rlpEncodeItem(r.value);
    if (re.length !== bytes.length || re.some((b, idx) => b !== bytes[idx])) return null;
    return rlpRenderValue(r.value);
  } catch (e) { return null; }
}
function txIntField(item, name) {
  if (item.bytes === undefined) throw new Error(name + " must be a string");
  const bs = item.bytes;
  if (bs.length > 32) throw new Error(name + " too long");
  if (bs.length > 0 && bs[0] === 0) throw new Error(name + " has leading zero");
  let v = 0n;
  for (const x of bs) v = (v << 8n) + BigInt(x);
  return v;
}
function txBytesField(item, name) {
  if (item.bytes === undefined) throw new Error(name + " must be a string");
  return item.bytes;
}
function txToField(item) {
  const bs = txBytesField(item, "to");
  if (bs.length === 0) return null;
  if (bs.length !== 20) throw new Error("to must be 0 or 20 bytes");
  return toChecksumAddress("0x" + bytesToHex(bs));
}
function txAccessList(item) {
  if (item.list === undefined) throw new Error("accessList must be a list");
  return item.list.map(entry => {
    if (entry.list === undefined || entry.list.length !== 2) throw new Error("bad access list entry");
    const addr = txBytesField(entry.list[0], "access address");
    if (addr.length !== 20) throw new Error("access address must be 20 bytes");
    if (entry.list[1].list === undefined) throw new Error("storage keys must be a list");
    const keys = entry.list[1].list.map(k => {
      const kb = txBytesField(k, "storage key");
      if (kb.length !== 32) throw new Error("storage key must be 32 bytes");
      return "0x" + bytesToHex(kb);
    });
    return { address: toChecksumAddress("0x" + bytesToHex(addr)), storageKeys: keys };
  });
}
function txAuthorizationList(item) {
  if (item.list === undefined) throw new Error("authorizationList must be a list");
  if (item.list.length === 0) throw new Error("authorizationList must not be empty");
  return item.list.map(entry => {
    if (entry.list === undefined || entry.list.length !== 6) throw new Error("bad authorization entry");
    const chainId = txIntField(entry.list[0], "authorization chainId");
    const addr = txBytesField(entry.list[1], "authorization address");
    if (addr.length !== 20) throw new Error("authorization address must be 20 bytes");
    const nonce = txIntField(entry.list[2], "authorization nonce");
    if (nonce >= (1n << 64n)) throw new Error("authorization nonce too large");
    const yParity = txIntField(entry.list[3], "authorization yParity");
    if (yParity > 255n) throw new Error("authorization yParity too large");
    const rB = txBytesField(entry.list[4], "authorization r"), sB = txBytesField(entry.list[5], "authorization s");
    if (rB.length > 32 || sB.length > 32) throw new Error("authorization r/s too long");
    return { chainId: chainId.toString(), address: toChecksumAddress("0x" + bytesToHex(addr)), nonce: nonce.toString(), yParity: Number(yParity), r: "0x" + bytesToHex(rB).padStart(64, "0"), s: "0x" + bytesToHex(sB).padStart(64, "0") };
  });
}
function txBlobVersionedHashes(item) {
  if (item.list === undefined) throw new Error("blobVersionedHashes must be a list");
  if (item.list.length === 0) throw new Error("blobVersionedHashes must not be empty");
  return item.list.map(h => {
    const hb = txBytesField(h, "blob versioned hash");
    if (hb.length !== 32) throw new Error("blob versioned hash must be 32 bytes");
    if (hb[0] !== 0x01) throw new Error("blob versioned hash must start with 0x01");
    return "0x" + bytesToHex(hb);
  });
}
function bigIntToMinBytes(v) {
  const out = [];
  let x = v;
  while (x > 0n) { out.unshift(Number(x & 0xffn)); x >>= 8n; }
  return out;
}
function decodeRawTransaction(input) {
  try {
    const raw = txHexToBytes(input);
    if (raw === null || raw.length === 0) return null;
    const b0 = raw[0];
    let type, items, typeByte = null;
    if (b0 === 0x01 || b0 === 0x02 || b0 === 0x03 || b0 === 0x04) {
      typeByte = b0;
      type = b0 === 0x01 ? "eip2930" : b0 === 0x02 ? "eip1559" : b0 === 0x03 ? "eip4844" : "eip7702";
      const r = rlpDecodeItem(raw, 1);
      if (r.value.list === undefined || r.next !== raw.length) return null;
      items = r.value.list;
    } else if (b0 >= 0xc0) {
      type = "legacy";
      const r = rlpDecodeItem(raw, 0);
      if (r.value.list === undefined || r.next !== raw.length) return null;
      items = r.value.list;
    } else return null;
    const signedCounts = { legacy: [6, 9], eip2930: [8, 11], eip1559: [9, 12], eip4844: [11, 14], eip7702: [10, 13] }[type];
    if (!signedCounts.includes(items.length)) return null;
    const signed = items.length === signedCounts[1];
    const out = { type, signed, txHash: "0x" + keccak256Bytes(raw) };
    let unsignedItems, sig = null;
    const readSig = (vItem, rItem, sItem) => {
      const v = txIntField(vItem, "v");
      const rB = txBytesField(rItem, "r"), sB = txBytesField(sItem, "s");
      if (rB.length > 32 || sB.length > 32) throw new Error("r/s too long");
      return { v, r: "0x" + bytesToHex(rB).padStart(64, "0"), s: "0x" + bytesToHex(sB).padStart(64, "0") };
    };
    if (type === "legacy") {
      out.nonce = txIntField(items[0], "nonce").toString();
      out.gasPrice = txIntField(items[1], "gasPrice").toString();
      out.gasLimit = txIntField(items[2], "gasLimit").toString();
      out.to = txToField(items[3]);
      out.value = txIntField(items[4], "value").toString();
      out.data = "0x" + bytesToHex(txBytesField(items[5], "data"));
      out.accessList = null;
      out.authorizationList = null;
      out.blobVersionedHashes = null;
      unsignedItems = items.slice(0, 6);
      if (signed) {
        sig = readSig(items[6], items[7], items[8]);
        if (sig.v === 27n || sig.v === 28n) {
          out.chainId = null; out.yParity = Number(sig.v - 27n);
        } else if (sig.v >= 35n) {
          const cid = (sig.v - 35n) / 2n;
          out.chainId = cid.toString(); out.yParity = Number((sig.v - 35n) % 2n);
          unsignedItems = [...unsignedItems,
            { bytes: bigIntToMinBytes(cid) }, { bytes: [] }, { bytes: [] }];
        } else return null;
        out.v = sig.v.toString(); out.r = sig.r; out.s = sig.s;
      } else out.chainId = null;
      out.signingHash = "0x" + keccak256Bytes(rlpEncodeItem({ list: unsignedItems }));
    } else {
      out.chainId = txIntField(items[0], "chainId").toString();
      out.nonce = txIntField(items[1], "nonce").toString();
      let i;
      if (type === "eip2930") { out.gasPrice = txIntField(items[2], "gasPrice").toString(); i = 3; }
      else {
        out.maxPriorityFeePerGas = txIntField(items[2], "maxPriorityFeePerGas").toString();
        out.maxFeePerGas = txIntField(items[3], "maxFeePerGas").toString(); i = 4;
      }
      out.gasLimit = txIntField(items[i], "gasLimit").toString();
      out.to = txToField(items[i + 1]);
      out.value = txIntField(items[i + 2], "value").toString();
      out.data = "0x" + bytesToHex(txBytesField(items[i + 3], "data"));
      out.accessList = txAccessList(items[i + 4]);
      if (type === "eip7702") {
        if (out.to === null) return null;
        out.authorizationList = txAuthorizationList(items[i + 5]);
        out.blobVersionedHashes = null;
      } else if (type === "eip4844") {
        if (out.to === null) return null;
        out.maxFeePerBlobGas = txIntField(items[i + 5], "maxFeePerBlobGas").toString();
        out.blobVersionedHashes = txBlobVersionedHashes(items[i + 6]);
        out.authorizationList = null;
      } else { out.authorizationList = null; out.blobVersionedHashes = null; }
      unsignedItems = items.slice(0, signedCounts[0]);
      if (signed) {
        sig = readSig(items[signedCounts[0]], items[signedCounts[0] + 1], items[signedCounts[0] + 2]);
        if (sig.v !== 0n && sig.v !== 1n) return null;
        out.yParity = Number(sig.v); out.v = sig.v.toString(); out.r = sig.r; out.s = sig.s;
      }
      out.signingHash = "0x" + keccak256Bytes([typeByte, ...rlpEncodeItem({ list: unsignedItems })]);
    }
    return out;
  } catch (e) { return null; }
}

/* ---------- Raw transaction encoder (RLP) ----------
   The construction half of the raw transaction decoder above:
   given the fields, it builds the exact bytes the decoder reads
   back — a legacy (incl. EIP-155), EIP-2930 (type 1), EIP-1559
   (type 2), EIP-4844 (type 3) or EIP-7702 (type 4) transaction —
   and derives the signing payload and signing hash (what a
   signer signs) and, when signature fields are supplied, the
   signed raw transaction and its transaction hash. Integers are
   encoded as the minimal big-endian byte strings RLP requires
   (0 is the empty string), so what this builds is canonical by
   construction, and the encoder refuses exactly what the decoder
   refuses: a missing or oversized integer, a destination that is
   neither empty nor 20 bytes, a malformed access list, and the
   type-specific validity rules — a type 3 transaction needs a
   destination and a non-empty list of 32-byte blob versioned
   hashes each starting with 0x01, a type 4 transaction needs a
   destination and a non-empty authorization list whose nonces
   are below 2^64 and whose y-parity is 0 or 1. The signature is
   encoded, NOT produced: this tool never sees a private key and
   signs nothing — give it a signature made elsewhere (y-parity,
   r, s) and it assembles the signed transaction; leave the
   signature blank and it returns the payload to sign. One legacy
   subtlety is pinned rather than smoothed over: an unsigned
   EIP-155 transaction has no standalone wire form distinct from
   its signing payload (the 9-field form ending chainId, 0, 0 is
   the thing that gets hashed, and only becomes a transaction
   when v / r / s replace the placeholders), so for that one case
   the encoder returns the signing payload with raw = null,
   where every other unsigned form IS its own raw encoding.
   The legacy v is derived, never typed: chainId × 2 + 35 +
   y-parity with a chain ID, 27 + y-parity without one. */
function txeParseUint(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (!/^\d+$/.test(s)) return null;
  const v = BigInt(s);
  return v < (1n << 256n) ? v : null;
}
function txeParseAddressBytes(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (!/^0[xX][0-9a-fA-F]{40}$/.test(s)) return null;
  return txHexToBytes(s);
}
function txeParseHash32Bytes(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (!/^0[xX][0-9a-fA-F]{64}$/.test(s)) return null;
  return txHexToBytes(s);
}
function txeParseSigInt(str) {
  if (typeof str !== "string") return null;
  const bytes = txHexToBytes(str);
  if (bytes === null) {
    const s = str.trim();
    return (s === "0x" || s === "0X") ? 0n : null;
  }
  if (bytes.length > 32) return null;
  return bytesToBigInt(bytes);
}
function txeParseYParity(v) {
  if (v === 0 || v === "0") return 0n;
  if (v === 1 || v === "1") return 1n;
  return null;
}
function encodeRawTransaction(spec) {
  try {
    if (spec === null || typeof spec !== "object") return null;
    const type = spec.type;
    if (!["legacy", "eip2930", "eip1559", "eip4844", "eip7702"].includes(type)) return null;
    const nonce = txeParseUint(spec.nonce);
    const gasLimit = txeParseUint(spec.gasLimit);
    const value = txeParseUint(spec.value);
    if (nonce === null || gasLimit === null || value === null) return null;
    if (typeof spec.to !== "string") return null;
    const toBytes = spec.to.trim() === "" ? [] : txeParseAddressBytes(spec.to);
    if (toBytes === null) return null;
    let dataBytes;
    if (typeof spec.data !== "string") return null;
    if (spec.data.trim() === "" || spec.data.trim() === "0x" || spec.data.trim() === "0X") dataBytes = [];
    else { dataBytes = txHexToBytes(spec.data); if (dataBytes === null) return null; }
    const sig = (spec.signature === null || spec.signature === undefined) ? null : spec.signature;
    let sigParity = null, sigR = null, sigS = null;
    if (sig !== null) {
      sigParity = txeParseYParity(sig.yParity);
      sigR = txeParseSigInt(sig.r);
      sigS = txeParseSigInt(sig.s);
      if (sigParity === null || sigR === null || sigS === null) return null;
    }
    const intItem = v => ({ bytes: bigIntToMinBytes(v) });
    const bytesItem = b => ({ bytes: b });
    let accessItems = null;
    if (type !== "legacy") {
      if (!Array.isArray(spec.accessList)) return null;
      accessItems = { list: spec.accessList.map(entry => {
        if (entry === null || typeof entry !== "object") throw new Error("bad access entry");
        const addr = txeParseAddressBytes(entry.address);
        if (addr === null) throw new Error("bad access address");
        if (!Array.isArray(entry.storageKeys)) throw new Error("bad storage keys");
        const keys = entry.storageKeys.map(k => {
          const kb = txeParseHash32Bytes(k);
          if (kb === null) throw new Error("bad storage key");
          return bytesItem(kb);
        });
        return { list: [bytesItem(addr), { list: keys }] };
      }) };
    }
    let unsignedItems, typeByte = null, chainIdOut = null;
    if (type === "legacy") {
      const gasPrice = txeParseUint(spec.gasPrice);
      if (gasPrice === null) return null;
      const chainId = (spec.chainId === null || spec.chainId === undefined ||
        (typeof spec.chainId === "string" && spec.chainId.trim() === "")) ? null : txeParseUint(spec.chainId);
      if (spec.chainId !== null && spec.chainId !== undefined &&
        !(typeof spec.chainId === "string" && spec.chainId.trim() === "") && chainId === null) return null;
      const base = [intItem(nonce), intItem(gasPrice), intItem(gasLimit),
        bytesItem(toBytes), intItem(value), bytesItem(dataBytes)];
      chainIdOut = chainId === null ? null : chainId.toString();
      if (sig !== null) {
        const v = chainId === null ? 27n + sigParity : chainId * 2n + 35n + sigParity;
        const signingItems = chainId === null ? base : [...base, intItem(chainId), intItem(0n), intItem(0n)];
        const signingPayload = rlpEncodeItem({ list: signingItems });
        const raw = rlpEncodeItem({ list: [...base, intItem(v), intItem(sigR), intItem(sigS)] });
        return { type, signed: true, chainId: chainIdOut, v: v.toString(),
          raw: "0x" + bytesToHex(raw), signingPayload: "0x" + bytesToHex(signingPayload),
          signingHash: "0x" + keccak256Bytes(signingPayload), txHash: "0x" + keccak256Bytes(raw) };
      }
      const signingItems = chainId === null ? base : [...base, intItem(chainId), intItem(0n), intItem(0n)];
      const signingPayload = rlpEncodeItem({ list: signingItems });
      return { type, signed: false, chainId: chainIdOut, v: null,
        raw: chainId === null ? "0x" + bytesToHex(signingPayload) : null,
        signingPayload: "0x" + bytesToHex(signingPayload),
        signingHash: "0x" + keccak256Bytes(signingPayload), txHash: null };
    }
    typeByte = { eip2930: 1, eip1559: 2, eip4844: 3, eip7702: 4 }[type];
    const chainId = txeParseUint(spec.chainId);
    if (chainId === null) return null;
    chainIdOut = chainId.toString();
    unsignedItems = [intItem(chainId), intItem(nonce)];
    if (type === "eip2930") {
      const gasPrice = txeParseUint(spec.gasPrice);
      if (gasPrice === null) return null;
      unsignedItems.push(intItem(gasPrice));
    } else {
      const maxPrio = txeParseUint(spec.maxPriorityFeePerGas);
      const maxFee = txeParseUint(spec.maxFeePerGas);
      if (maxPrio === null || maxFee === null) return null;
      unsignedItems.push(intItem(maxPrio), intItem(maxFee));
    }
    unsignedItems.push(intItem(gasLimit), bytesItem(toBytes), intItem(value), bytesItem(dataBytes), accessItems);
    if (type === "eip4844") {
      if (toBytes.length === 0) return null;
      const maxFeePerBlobGas = txeParseUint(spec.maxFeePerBlobGas);
      if (maxFeePerBlobGas === null) return null;
      if (!Array.isArray(spec.blobVersionedHashes) || spec.blobVersionedHashes.length === 0) return null;
      const hashes = spec.blobVersionedHashes.map(h => {
        const hb = txeParseHash32Bytes(h);
        if (hb === null || hb[0] !== 0x01) throw new Error("bad blob versioned hash");
        return bytesItem(hb);
      });
      unsignedItems.push(intItem(maxFeePerBlobGas), { list: hashes });
    }
    if (type === "eip7702") {
      if (toBytes.length === 0) return null;
      if (!Array.isArray(spec.authorizationList) || spec.authorizationList.length === 0) return null;
      const authItems = spec.authorizationList.map(entry => {
        if (entry === null || typeof entry !== "object") throw new Error("bad authorization entry");
        const aChainId = txeParseUint(entry.chainId);
        const aAddr = txeParseAddressBytes(entry.address);
        const aNonce = txeParseUint(entry.nonce);
        const aParity = txeParseYParity(entry.yParity);
        const aR = txeParseSigInt(entry.r);
        const aS = txeParseSigInt(entry.s);
        if (aChainId === null || aAddr === null || aNonce === null || aNonce >= (1n << 64n) ||
          aParity === null || aR === null || aS === null) throw new Error("bad authorization field");
        return { list: [intItem(aChainId), bytesItem(aAddr), intItem(aNonce), intItem(aParity), intItem(aR), intItem(aS)] };
      });
      unsignedItems.push({ list: authItems });
    }
    const signingPayload = [typeByte, ...rlpEncodeItem({ list: unsignedItems })];
    if (sig !== null) {
      const raw = [typeByte, ...rlpEncodeItem({ list: [...unsignedItems, intItem(sigParity), intItem(sigR), intItem(sigS)] })];
      return { type, signed: true, chainId: chainIdOut, v: sigParity.toString(),
        raw: "0x" + bytesToHex(raw), signingPayload: "0x" + bytesToHex(signingPayload),
        signingHash: "0x" + keccak256Bytes(signingPayload), txHash: "0x" + keccak256Bytes(raw) };
    }
    return { type, signed: false, chainId: chainIdOut, v: null,
      raw: "0x" + bytesToHex(signingPayload), signingPayload: "0x" + bytesToHex(signingPayload),
      signingHash: "0x" + keccak256Bytes(signingPayload), txHash: null };
  } catch (e) { return null; }
}

/* ---------- Signature recovery (ecrecover) ----------
   Given the 32-byte digest that was signed and the signature's v / r / s,
   recover the signer's address exactly as the EVM's ecrecover precompile
   does: find the curve point R with x = r and y-parity from v, then
   Q = r^-1 (s·R − e·G) on secp256k1, and the address is the last 20 bytes
   of keccak256(Qx ‖ Qy). v is accepted as 0/1, 27/28, or an EIP-155 value
   (>= 35; the chain ID is implied and the parity is (v − 35) mod 2).
   Strict about the signature itself: r and s must lie in [1, n − 1] and
   s must be in the lower half of the curve order (the EIP-2 canonical
   form every client enforces — the malleable high-s twin is rejected
   rather than recovered). Recovers an address from a signature; it does
   not create one and needs no private key. */
const SECP256K1_P = (1n << 256n) - (1n << 32n) - 977n;
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_G = [
  0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n
];
function secpMod(a) { const r = a % SECP256K1_P; return r < 0n ? r + SECP256K1_P : r; }
function secpModPow(base, exp, mod) {
  let result = 1n, b = ((base % mod) + mod) % mod, e = exp;
  while (e > 0n) { if (e & 1n) result = (result * b) % mod; b = (b * b) % mod; e >>= 1n; }
  return result;
}
function secpAdd(p1, p2) {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  const [x1, y1] = p1, [x2, y2] = p2;
  let lam;
  if (x1 === x2) {
    if (secpMod(y1 + y2) === 0n) return null;
    lam = secpMod(3n * x1 * x1 * secpModPow(2n * y1, SECP256K1_P - 2n, SECP256K1_P));
  } else {
    lam = secpMod((y2 - y1) * secpModPow(x2 - x1, SECP256K1_P - 2n, SECP256K1_P));
  }
  const x3 = secpMod(lam * lam - x1 - x2);
  return [x3, secpMod(lam * (x1 - x3) - y1)];
}
function secpMul(k, point) {
  let result = null, addend = point, scalar = k;
  while (scalar > 0n) {
    if (scalar & 1n) result = secpAdd(result, addend);
    addend = secpAdd(addend, addend);
    scalar >>= 1n;
  }
  return result;
}
function bytesToBigInt(bytes) {
  return bytes.reduce((a, b) => (a << 8n) | BigInt(b), 0n);
}
function recoverAddress(hashHex, vStr, rHex, sHex) {
  const hashBytes = parseHexBytes(hashHex, 32);
  const rBytes = parseHexBytes(rHex, 32);
  const sBytes = parseHexBytes(sHex, 32);
  if (hashBytes === null || rBytes === null || sBytes === null) return null;
  if (typeof vStr !== "string" || !/^\d+$/.test(vStr.trim())) return null;
  const v = BigInt(vStr.trim());
  let recId;
  if (v === 0n || v === 1n) recId = Number(v);
  else if (v === 27n || v === 28n) recId = Number(v - 27n);
  else if (v >= 35n) recId = Number((v - 35n) % 2n);
  else return null;
  const r = bytesToBigInt(rBytes);
  const s = bytesToBigInt(sBytes);
  if (r < 1n || r >= SECP256K1_N || s < 1n || s > SECP256K1_N / 2n) return null;
  const alpha = secpMod(r * r * r + 7n);
  const beta = secpModPow(alpha, (SECP256K1_P + 1n) / 4n, SECP256K1_P);
  if (secpMod(beta * beta) !== alpha) return null;
  const y = Number(beta & 1n) === recId ? beta : SECP256K1_P - beta;
  const e = bytesToBigInt(hashBytes);
  const rInv = secpModPow(r, SECP256K1_N - 2n, SECP256K1_N);
  const sR = secpMul(s, [r, y]);
  const eG = secpMul(e % SECP256K1_N, SECP256K1_G);
  const negEG = eG === null ? null : [eG[0], secpMod(-eG[1])];
  const q = secpMul(rInv, secpAdd(sR, negEG));
  if (q === null) return null;
  const pubHex = keccak256Bytes([...bigIntToBytes32(q[0]), ...bigIntToBytes32(q[1])]);
  return toChecksumAddress("0x" + pubHex.slice(24));
}

/* ---------- Signed message verification (EIP-191 personal_sign) ----------
   Wallets sign plain messages with personal_sign, which does NOT sign the
   message itself: it signs the EIP-191 version-0x45 digest
   keccak256("\x19Ethereum Signed Message:\n" ‖ decimal byte length ‖
   message bytes) — the 0x19 prefix guarantees the payload can never be a
   valid RLP transaction, and the length is the length in BYTES (a
   multibyte UTF-8 character counts as more than one), written as a
   decimal string. Given the message and the 65-byte signature r ‖ s ‖ v
   a wallet returns, this tool rebuilds that digest and recovers the
   signer with the ecrecover math above. Strict in the same way: the
   signature must be exactly 65 bytes and s must be in the lower half of
   the curve order (the EIP-2 canonical form wallets produce). It
   verifies a signature locally; it never asks for a key and signs
   nothing. Verified in the tests against an independent pure-Python
   Keccak-256 + secp256k1 oracle written from the specifications,
   anchored on the published Keccak vectors and the published addresses
   of private key 1 and the EIP-155 example key. */
function eip191Digest(message) {
  if (typeof message !== "string") return null;
  const msgBytes = utf8Bytes(message);
  const prefix = "\x19Ethereum Signed Message:\n" + String(msgBytes.length);
  const prefixBytes = [];
  for (let i = 0; i < prefix.length; i++) prefixBytes.push(prefix.charCodeAt(i) & 0xff);
  return "0x" + keccak256Bytes([...prefixBytes, ...msgBytes]);
}
/* ---------- EIP-191 personal_sign digest calculator ----------
   The digest function above is what the verifier below uses
   internally, but until now it had no tool of its own — the
   EIP-2612 permit digest, the EIP-712 mail digest and the EIP-7702
   authorization digest all have standalone calculators, and a
   developer constructing a message to sign needs exactly this
   digest (and the exact payload bytes that are hashed) without
   first supplying a signature to the verifier. This calculator
   returns both: the payload 0x19 ‖ "Ethereum Signed Message:\n" ‖
   <decimal byte length> ‖ <message UTF-8 bytes> and its
   Keccak-256. The length is the length in BYTES written as decimal
   text, so a multibyte character counts more than once — visible
   in the payload, where "héllo wörld" (11 characters) carries the
   length "13". Verified in the tests against an independent
   pure-Python oracle (oracle-personal-digest.py, reusing
   oracle-auth7702.py's Keccak-256 code, anchored on the three
   digest values the digest tests already carry, the hand-written
   prefill payload, and the byte-length anchors).
   Computes a digest only — nothing is signed. */
function personalDigestCalc(message) {
  if (typeof message !== "string") return null;
  const msgBytes = utf8Bytes(message);
  const prefix = "\x19Ethereum Signed Message:\n" + String(msgBytes.length);
  const prefixBytes = [];
  for (let i = 0; i < prefix.length; i++) prefixBytes.push(prefix.charCodeAt(i) & 0xff);
  const payloadBytes = [...prefixBytes, ...msgBytes];
  return { digest: "0x" + keccak256Bytes(payloadBytes), payload: "0x" + bytesToHex(payloadBytes) };
}
function verifyPersonalSignature(message, signature) {
  const digest = eip191Digest(message);
  if (digest === null || typeof signature !== "string") return null;
  const sigBytes = parseHexBytes(signature, 65);
  if (sigBytes === null) return null;
  const r = "0x" + bytesToHex(sigBytes.slice(0, 32));
  const s = "0x" + bytesToHex(sigBytes.slice(32, 64));
  const signer = recoverAddress(digest, String(sigBytes[64]), r, s);
  if (signer === null) return null;
  return { digest, signer };
}

/* ---------- EIP-712 typed-data verification (Ether Mail schema) ----------
   The digest calculator above computes the hash a wallet signs for the
   Ether Mail example; this tool takes the step that makes it a
   verification: given the same domain and Mail fields plus the 65-byte
   signature r ‖ s ‖ v a wallet returned from eth_signTypedData, it
   recomputes the digest keccak256(0x1901 ‖ domainSeparator ‖
   hashStruct(message)) and recovers the signer with the ecrecover math
   above. Strict in the same way as the personal_sign verifier: the
   signature must be exactly 65 bytes and s must be in the lower half
   of the curve order (the canonical EIP-2 form), so a malleable
   high-s twin is refused rather than half-verified. Honest scope is
   the digest tool's: the specification's one fixed Ether Mail schema,
   not a general typed-data verifier. Verified in the tests against the
   signature EIP-712 itself prints for this example (recovering its
   published signing account, Cow) and a signature over the published
   digest produced by an independent pure-Python secp256k1 oracle
   (RFC 6979; its address derivation anchored on the published
   addresses of private key 1 and of the private key EIP-155 prints).
   It verifies a signature locally; it never asks for a key and signs
   nothing. */
function verify712MailSignature(domainName, domainVersion, chainIdStr, verifyingContract,
                                fromName, fromWallet, toName, toWallet, contents, signature) {
  const mail = eip712MailDigest(domainName, domainVersion, chainIdStr, verifyingContract,
                                fromName, fromWallet, toName, toWallet, contents);
  if (mail === null || typeof signature !== "string") return null;
  const sigBytes = parseHexBytes(signature, 65);
  if (sigBytes === null) return null;
  const r = "0x" + bytesToHex(sigBytes.slice(0, 32));
  const s = "0x" + bytesToHex(sigBytes.slice(32, 64));
  const signer = recoverAddress(mail.digest, String(sigBytes[64]), r, s);
  if (signer === null) return null;
  return { digest: mail.digest, domainSeparator: mail.domainSeparator, structHash: mail.structHash, signer };
}

/* ---------- EIP-2612 permit signature verification ----------
   The permit digest calculator above computes the hash an owner
   signs for a gasless ERC-20 approval; this tool performs the
   check the token's permit() itself performs on the signature
   that comes back: recompute the EIP-712 digest
   keccak256(0x1901 ‖ DOMAIN_SEPARATOR ‖ hashStruct(Permit)) for
   the same token domain and Permit fields and recover the signer
   with the ecrecover math above. permit() sets the allowance
   only when that signer IS the owner named in the struct (the
   other two checks — the nonce being the owner's current permit
   nonce and the deadline not having passed — are chain state
   this page does not read). Strict in the same way as the
   verifiers above: the signature must be exactly 65 bytes and
   s must be the canonical low-s form, or it is refused rather
   than half-verified. Verified in the tests against signatures
   produced by an independent pure-Python Keccak-256 + secp256k1
   oracle (RFC 6979 signing; its Keccak anchored on the published
   values the permit oracle anchors on, its address derivation
   anchored on the published addresses of private key 1 and of
   the private key EIP-155 prints, and its signer anchored
   end-to-end by reproducing the hub's existing EIP-712 key-1
   test signature over the published Ether Mail digest).
   It verifies a signature locally; it never asks for a key and
   signs nothing. */
function verifyPermitSignature(name, version, chainIdStr, token, owner, spender, valueStr, nonceStr, deadlineStr, signature) {
  const permit = permitDigest(name, version, chainIdStr, token, owner, spender, valueStr, nonceStr, deadlineStr);
  if (permit === null || typeof signature !== "string") return null;
  const sigBytes = parseHexBytes(signature, 65);
  if (sigBytes === null) return null;
  const r = "0x" + bytesToHex(sigBytes.slice(0, 32));
  const s = "0x" + bytesToHex(sigBytes.slice(32, 64));
  const signer = recoverAddress(permit.digest, String(sigBytes[64]), r, s);
  if (signer === null) return null;
  return { digest: permit.digest, domainSeparator: permit.domainSeparator, structHash: permit.structHash, signer };
}

/* ---------- EIP-7702 authorization digest ----------
   Each authorization tuple in a set code transaction is signed
   on its own, over a digest that is NOT the transaction's
   signing hash: keccak256(0x05 ‖ rlp([chain_id, address,
   nonce])) — the 0x05 MAGIC byte keeps an authorization from
   ever being mistaken for a transaction (the same separation
   trick as EIP-191's 0x19 prefix). Recovering that digest's
   signer with the ecrecover math above gives the authority:
   the account whose code the tuple delegates. A chain ID of 0
   in the tuple means the authorization is valid on any chain.
   Computes a digest only — nothing is signed. */
function eip7702AuthorizationDigest(chainIdStr, address, nonceStr) {
  if (typeof chainIdStr !== "string" || typeof nonceStr !== "string") return null;
  if (!/^\d+$/.test(chainIdStr.trim()) || !/^\d+$/.test(nonceStr.trim())) return null;
  const addrBytes = parseHexBytes(address, 20);
  if (addrBytes === null) return null;
  const payload = rlpEncodeItem({ list: [
    { bytes: bigIntToMinBytes(BigInt(chainIdStr.trim())) },
    { bytes: addrBytes },
    { bytes: bigIntToMinBytes(BigInt(nonceStr.trim())) }
  ] });
  return "0x" + keccak256Bytes([0x05, ...payload]);
}

/* ---------- EIP-7702 authorization digest calculator ----------
   The digest function above is what the verifier and the sender
   recovery tool use internally, but until now it had no tool of
   its own — the EIP-2612 permit digest has one, and a developer
   constructing an authorization tuple to sign needs exactly this
   digest (and the exact payload bytes that are hashed) without
   first supplying a signature to the verifier. This calculator
   returns both: the payload 0x05 ‖ rlp([chain_id, address,
   nonce]) and its Keccak-256. A chain ID of 0 means the
   authorization is valid on any chain; zero chain IDs and nonces
   RLP-encode as the empty string (0x80), never as a zero byte.
   Verified in the tests against an independent pure-Python
   oracle (oracle-auth7702-digest.py, reusing the Keccak-256 /
   RLP code of oracle-auth7702.py, anchored on the published
   Keccak vectors, the hand-derived prefill payload, and the two
   digest values the digest tests above already carry).
   Computes a digest only — nothing is signed. */
function authorizationDigestCalc(chainIdStr, address, nonceStr) {
  if (typeof chainIdStr !== "string" || typeof nonceStr !== "string") return null;
  if (!/^\d+$/.test(chainIdStr.trim()) || !/^\d+$/.test(nonceStr.trim())) return null;
  const addrBytes = parseHexBytes(address, 20);
  if (addrBytes === null) return null;
  const rlp = rlpEncodeItem({ list: [
    { bytes: bigIntToMinBytes(BigInt(chainIdStr.trim())) },
    { bytes: addrBytes },
    { bytes: bigIntToMinBytes(BigInt(nonceStr.trim())) }
  ] });
  const payloadBytes = [0x05, ...rlp];
  return { digest: "0x" + keccak256Bytes(payloadBytes), payload: "0x" + bytesToHex(payloadBytes) };
}

/* ---------- EIP-7702 authorization signature verification ----------
   The digest above is what an account signs to delegate its code in
   an EIP-7702 set code transaction; this tool performs the check a
   client performs on each authorization tuple before applying it:
   recompute the tuple's digest keccak256(0x05 ‖ rlp([chain_id,
   address, nonce])) and recover the signer — the authority — from
   the tuple's signature. A client applies the delegation only for
   a tuple whose authority's nonce matches the tuple nonce (chain
   state this page does not read) and whose chain ID is 0 or the
   current chain's; the signature mathematics is what is verified
   here. The signature is the 65-byte r ‖ s ‖ v form, where v is
   the tuple's y-parity (0 or 1); the wallet form 27 / 28 is
   accepted and normalised, but an EIP-155-style v (35 and up) is
   refused — an authorization carries no chain ID in its v. Strict
   in the same way as the verifiers above: s must be the canonical
   low-s form, so the malleable high-s twin of a valid signature —
   which recovers the same authority mathematically — is refused
   rather than verified, exactly as a client skips that tuple.
   Verified in the tests against the two authorization tuples of
   the published type-4 oracle transaction, recovered independently
   by a pure-Python Keccak-256 + secp256k1 oracle anchored on the
   published addresses of private key 1 and of the EIP-155 example
   key, on a hand-derived RLP payload, and on the digest values the
   digest tests above already carry. It verifies a signature
   locally; it never asks for a key and signs nothing. */
function verify7702Authorization(chainIdStr, address, nonceStr, signature) {
  const digest = eip7702AuthorizationDigest(chainIdStr, address, nonceStr);
  if (digest === null || typeof signature !== "string") return null;
  const sigBytes = parseHexBytes(signature, 65);
  if (sigBytes === null) return null;
  const v = sigBytes[64];
  if (v !== 0 && v !== 1 && v !== 27 && v !== 28) return null;
  const r = "0x" + bytesToHex(sigBytes.slice(0, 32));
  const s = "0x" + bytesToHex(sigBytes.slice(32, 64));
  const authority = recoverAddress(digest, String(v), r, s);
  if (authority === null) return null;
  return { digest, authority };
}

/* ---------- Transaction sender recovery ----------
   The decoder above deliberately stops at decoding, and the ecrecover
   tool above recovers a signer from a digest handed to it — this tool
   composes the two: strictly decode a signed raw transaction, take the
   signing hash the decoder recomputes from the unsigned payload, and
   recover the sender from the transaction's own v / r / s. That is the
   sender every client derives before executing a transaction, and the
   check behind "which account really sent this". Legacy transactions
   pass their v through as-is (27/28 pre-EIP-155, or the EIP-155 value
   whose parity and chain ID the decoder already split out); typed
   transactions carry y-parity 0/1 directly. Unsigned transactions have
   no sender and are refused, and the ecrecover strictness carries over:
   r / s out of range, or the malleable high-s twin of a signature, is
   refused rather than recovered. For an EIP-7702 set code
   transaction it goes one step further, the way a client does:
   each authorization tuple's authority is recovered from the
   tuple's own digest (keccak256(0x05 ‖ rlp([chain_id, address,
   nonce]))), and a tuple whose signature does not recover —
   out-of-range values, a y-parity other than 0/1, or the
   malleable high-s twin — is reported with a null authority
   rather than a guessed account, exactly as a client skips that
   tuple and processes the rest. Recovers addresses from a signed
   transaction only — nothing is signed, no key is used or asked
   for, and no chain is queried. */
function recoverTransactionSender(input) {
  const d = decodeRawTransaction(input);
  if (d === null || !d.signed) return null;
  const sender = recoverAddress(d.signingHash, d.v, d.r, d.s);
  if (sender === null) return null;
  let authorizations = null;
  if (d.type === "eip7702") {
    authorizations = d.authorizationList.map(a => {
      const digest = eip7702AuthorizationDigest(a.chainId, a.address, a.nonce);
      const authority = digest !== null && (a.yParity === 0 || a.yParity === 1)
        ? recoverAddress(digest, String(a.yParity), a.r, a.s) : null;
      return { authority, address: a.address, chainId: a.chainId, nonce: a.nonce };
    });
  }
  return { sender, type: d.type, chainId: d.chainId, signingHash: d.signingHash, txHash: d.txHash, authorizations };
}

/* ---------- ERC-4626 vault conversion calculator ----------
   A tokenized vault (ERC-4626) prices its shares against the assets
   it holds with one exchange rate, applied with the virtual-offset
   construction OpenZeppelin's ERC4626 uses against the first-deposit
   inflation attack: conversions act as if the vault also held
   10^offset virtual shares and 1 virtual asset, so
     assets -> shares: amount × (totalSupply + 10^offset) ÷ (totalAssets + 1)
     shares -> assets: amount × (totalAssets + 1) ÷ (totalSupply + 10^offset)
   The offset is the vault's _decimalsOffset() (0 in OpenZeppelin's
   default, which already makes the attack unprofitable; larger
   offsets make it orders of magnitude more expensive). Rounding
   follows the EIP-4626 preview functions and always favours the
   vault: previewDeposit and previewRedeem round DOWN, previewMint
   and previewWithdraw round UP. Amounts are in base units; a result
   above the uint256 maximum is refused, as the contract's mulDiv
   reverts there. This is the conversion math applied to values the
   user supplies — a real vault's totalAssets and totalSupply are
   chain state this page does not read — and a vault's own deposit /
   withdrawal limits (maxDeposit and friends, balances, allowances)
   are not modelled. Nothing is deposited or queried on chain. */
const ERC4626_MAX_UINT256 = (1n << 256n) - 1n;
function erc4626Convert(mode, totalAssetsStr, totalSupplyStr, amountStr, offsetStr) {
  const totalAssets = v2ParseUint(totalAssetsStr);
  const totalSupply = v2ParseUint(totalSupplyStr);
  const amount = v2ParseUint(amountStr);
  if (totalAssets === null || totalSupply === null || amount === null) return null;
  if (typeof offsetStr !== "string") return null;
  const off = offsetStr.trim();
  if (!/^\d+$/.test(off) || off.length > 3) return null;
  const offset = BigInt(off);
  if (offset > 255n) return null; // _decimalsOffset() returns a uint8
  const virtualShares = 10n ** offset;
  let numerator, denominator, ceil, inputUnit, outputUnit, fn;
  if (mode === "deposit") {
    numerator = amount * (totalSupply + virtualShares); denominator = totalAssets + 1n;
    ceil = false; inputUnit = "assets"; outputUnit = "shares"; fn = "previewDeposit";
  } else if (mode === "mint") {
    numerator = amount * (totalAssets + 1n); denominator = totalSupply + virtualShares;
    ceil = true; inputUnit = "shares"; outputUnit = "assets"; fn = "previewMint";
  } else if (mode === "withdraw") {
    numerator = amount * (totalSupply + virtualShares); denominator = totalAssets + 1n;
    ceil = true; inputUnit = "assets"; outputUnit = "shares"; fn = "previewWithdraw";
  } else if (mode === "redeem") {
    numerator = amount * (totalAssets + 1n); denominator = totalSupply + virtualShares;
    ceil = false; inputUnit = "shares"; outputUnit = "assets"; fn = "previewRedeem";
  } else return null;
  const result = ceil ? (numerator + denominator - 1n) / denominator : numerator / denominator;
  if (result > ERC4626_MAX_UINT256) return null;
  return {
    result: result.toString(), rounding: ceil ? "up" : "down", fn,
    inputUnit, outputUnit, virtualShares: virtualShares.toString()
  };
}

/* Compound cToken exchange rate & mint/redeem — CToken's own math
   (compound-protocol, BSD-3-Clause; formulas paraphrased, not copied):
   the stored exchange rate is the market's initialExchangeRateMantissa
   while totalSupply is 0, and afterwards
   (cash + totalBorrows − totalReserves) × 1e18 ÷ totalSupply,
   truncated. Conversions divide or multiply by that rate through
   ExponentialNoError's Exp helpers, which truncate at every step —
   unlike ERC-4626 there is NO round-up anywhere: minting mints
   amount × 1e18 ÷ rate cTokens, redeeming cTokens pays
   tokens × rate ÷ 1e18 underlying, and redeeming a chosen underlying
   amount burns amount × 1e18 ÷ rate cTokens. Reserves above
   cash + borrows are refused (the contract's subtraction reverts),
   as are a zero initial rate, a zero computed rate for a conversion
   (the contract divides by it), and any rate or result above the
   uint256 maximum (the contract's scaled multiplication reverts).
   Amounts are in base units of each token. This is the stored-rate
   math applied to values the user supplies — a real market's cash,
   borrows, reserves and supply are chain state this page does not
   read, interest accrual up to the current block
   (exchangeRateCurrent) is not performed, and Comptroller liquidity
   checks, cash-availability checks and borrow/repay are not modelled.
   Nothing is supplied, redeemed or queried on chain. */
const COMPOUND_EXP_SCALE = 10n ** 18n;
function compoundCToken(mode, cashStr, borrowsStr, reservesStr, supplyStr, initialRateStr, amountStr) {
  const cash = v2ParseUint(cashStr);
  const borrows = v2ParseUint(borrowsStr);
  const reserves = v2ParseUint(reservesStr);
  const supply = v2ParseUint(supplyStr);
  const initial = v2ParseUint(initialRateStr);
  const amount = v2ParseUint(amountStr);
  if (cash === null || borrows === null || reserves === null ||
      supply === null || initial === null || amount === null) return null;
  if (reserves > cash + borrows) return null;
  let exchangeRate;
  if (supply === 0n) {
    if (initial === 0n) return null; // initialize() requires a positive initial rate
    exchangeRate = initial;
  } else {
    exchangeRate = ((cash + borrows - reserves) * COMPOUND_EXP_SCALE) / supply;
  }
  if (exchangeRate > ERC4626_MAX_UINT256) return null;
  let result, inputUnit, outputUnit, fn;
  if (mode === "rate") {
    result = exchangeRate; inputUnit = "market totals"; outputUnit = "exchange rate mantissa"; fn = "exchangeRateStored";
  } else if (mode === "mint") {
    if (exchangeRate === 0n) return null;
    result = (amount * COMPOUND_EXP_SCALE) / exchangeRate;
    inputUnit = "underlying"; outputUnit = "cTokens"; fn = "mint";
  } else if (mode === "redeemTokens") {
    result = (amount * exchangeRate) / COMPOUND_EXP_SCALE;
    inputUnit = "cTokens"; outputUnit = "underlying"; fn = "redeem";
  } else if (mode === "redeemAmount") {
    if (exchangeRate === 0n) return null;
    result = (amount * COMPOUND_EXP_SCALE) / exchangeRate;
    inputUnit = "underlying"; outputUnit = "cTokens burned"; fn = "redeemUnderlying";
  } else return null;
  if (result > ERC4626_MAX_UINT256) return null;
  return {
    result: result.toString(), exchangeRate: exchangeRate.toString(), fn,
    inputUnit, outputUnit
  };
}

/* Compound interest accrual — CToken.accrueInterest's own math
   (compound-protocol, BSD-3-Clause; formulas paraphrased, not copied):
   over a gap of blockDelta blocks at a per-block borrow rate mantissa
   (scaled by 1e18, as the market's interest rate model returns it),
     simpleInterestFactor = borrowRate × blockDelta   (an Exp mantissa)
     interestAccumulated  = factor × totalBorrows ÷ 1e18, truncated
     totalBorrowsNew      = interestAccumulated + totalBorrows
     totalReservesNew     = reserveFactor × interestAccumulated ÷ 1e18
                            + totalReserves, truncated before the add
     borrowIndexNew       = factor × borrowIndex ÷ 1e18 + borrowIndex
   Every product and step truncates through ExponentialNoError's
   mul_ScalarTruncate helpers. Note what the formula does with zero
   borrows: no interest accrues, but the borrow index still grows by
   the full factor. Refused, as the contract reverts or can never
   store the value: a borrow rate above borrowRateMaxMantissa
   (0.0005e16 = 5000000000000, "borrow rate is absurdly high"), a
   reserve factor above 1e18 (reserveFactorMaxMantissa), and any
   intermediate product or final sum above the uint256 maximum.
   This is ONE accrual step at the supplied rate held constant over
   the whole gap, exactly as a single accrueInterest() call computes
   it — a real market's rate is whatever its interest rate model
   returns at the accrual block (it moves with utilization between
   accruals), and its totals and borrow index are chain state this
   page does not read. Nothing is accrued or queried on chain. */
const COMPOUND_BORROW_RATE_MAX = 5000000000000n; // 0.0005e16
function compoundAccrue(rateStr, deltaStr, borrowsStr, reservesStr, reserveFactorStr, indexStr) {
  const rate = v2ParseUint(rateStr);
  const delta = v2ParseUint(deltaStr);
  const borrows = v2ParseUint(borrowsStr);
  const reserves = v2ParseUint(reservesStr);
  const reserveFactor = v2ParseUint(reserveFactorStr);
  const index = v2ParseUint(indexStr);
  if (rate === null || delta === null || borrows === null ||
      reserves === null || reserveFactor === null || index === null) return null;
  if (rate > COMPOUND_BORROW_RATE_MAX) return null;
  if (reserveFactor > COMPOUND_EXP_SCALE) return null;
  const factor = rate * delta;
  if (factor > ERC4626_MAX_UINT256) return null;
  const interestProduct = factor * borrows;
  if (interestProduct > ERC4626_MAX_UINT256) return null;
  const interest = interestProduct / COMPOUND_EXP_SCALE;
  const borrowsNew = interest + borrows;
  if (borrowsNew > ERC4626_MAX_UINT256) return null;
  const reserveProduct = reserveFactor * interest;
  if (reserveProduct > ERC4626_MAX_UINT256) return null;
  const reservesNew = (reserveProduct / COMPOUND_EXP_SCALE) + reserves;
  if (reservesNew > ERC4626_MAX_UINT256) return null;
  const indexProduct = factor * index;
  if (indexProduct > ERC4626_MAX_UINT256) return null;
  const indexNew = (indexProduct / COMPOUND_EXP_SCALE) + index;
  if (indexNew > ERC4626_MAX_UINT256) return null;
  return {
    factor: factor.toString(), interest: interest.toString(),
    borrows: borrowsNew.toString(), reserves: reservesNew.toString(),
    index: indexNew.toString()
  };
}

/* Compound account snapshot — CToken.getAccountSnapshot's own math
   (compound-protocol, BSD-3-Clause; formulas paraphrased, not copied):
   the snapshot an account has in one market, from STORED values:
     borrowBalance = 0                                  if principal is 0
                   = principal × marketIndex ÷ snapshotIndex   otherwise
     underlying    = cTokenBalance × exchangeRate ÷ 1e18, truncated
   The borrow formula is plain uint arithmetic in the current source —
   NOT an ExponentialNoError Exp helper — so it truncates once, at the
   division. The zero-principal case short-circuits before the snapshot
   index is ever read, so a zero snapshot index is refused only when a
   borrow exists (the contract would divide by it and revert); both
   products are refused above the uint256 maximum (checked arithmetic
   and ExponentialNoError's scaled multiplication revert there). The
   underlying side is mul_ScalarTruncate over the STORED exchange rate
   (the rate the exchange-rate tool above computes) — the contract's
   balanceOfUnderlying accrues interest first and uses the fresh rate;
   this tool does not accrue, so supply the stored rate, or the rate
   after an accrual step, yourself. Snapshot, indexes, balances and
   rate are values the user supplies — a real account's are chain
   state this page does not read. Nothing is queried on chain. */
function compoundSnapshot(principalStr, snapshotIndexStr, marketIndexStr, tokensStr, rateStr) {
  const principal = v2ParseUint(principalStr);
  const snapshotIndex = v2ParseUint(snapshotIndexStr);
  const marketIndex = v2ParseUint(marketIndexStr);
  const tokens = v2ParseUint(tokensStr);
  const rate = v2ParseUint(rateStr);
  if (principal === null || snapshotIndex === null || marketIndex === null ||
      tokens === null || rate === null) return null;
  let borrow;
  if (principal === 0n) {
    borrow = 0n; // short-circuit: the snapshot index is never read
  } else {
    if (snapshotIndex === 0n) return null; // the contract divides by it
    const borrowProduct = principal * marketIndex;
    if (borrowProduct > ERC4626_MAX_UINT256) return null;
    borrow = borrowProduct / snapshotIndex;
  }
  const underlyingProduct = tokens * rate;
  if (underlyingProduct > ERC4626_MAX_UINT256) return null;
  const underlying = underlyingProduct / COMPOUND_EXP_SCALE;
  return {
    borrow: borrow.toString(), underlying: underlying.toString(),
    tokens: tokens.toString()
  };
}

/* Compound interest rate model — JumpRateModelV2's own math
   (compound-protocol, BSD-3-Clause; formulas paraphrased, not copied),
   over the model's STORED per-block parameters (the constructor turns
   governance's per-year values into these by dividing by blocksPerYear;
   that setup step is not this math):
     utilization = 0                                   if borrows is 0
                 = borrows × 1e18 ÷ (cash + borrows − reserves)  otherwise
     borrowRate  = util × multiplierPerBlock ÷ 1e18 + baseRatePerBlock
                                                           if util ≤ kink
                 = (kink × multiplierPerBlock ÷ 1e18 + baseRatePerBlock)
                   + (util − kink) × jumpMultiplierPerBlock ÷ 1e18
                                                           if util > kink
     supplyRate  = util × (borrowRate × (1e18 − reserveFactor) ÷ 1e18)
                   ÷ 1e18
   Every division truncates, exactly as the contracts truncate. The
   zero-borrows case short-circuits before the denominator is ever
   read, so a market with cash equal to reserves still has utilization
   0; with borrows present, reserves above cash + borrows or a zero
   denominator revert in the contract and are refused here, as is a
   reserve factor above 1e18 (the supply-rate subtraction underflows)
   and any product or sum above the uint256 maximum (checked
   arithmetic). Utilization can exceed 1e18 when reserves exceed cash.
   The two borrow branches agree exactly at util = kink. Totals and
   parameters are values the user supplies — a real market's are chain
   state this page does not read. Nothing is queried on chain. */
function compoundRateModel(cashStr, borrowsStr, reservesStr, baseStr, multStr, jumpStr, kinkStr, reserveFactorStr) {
  const cash = v2ParseUint(cashStr);
  const borrows = v2ParseUint(borrowsStr);
  const reserves = v2ParseUint(reservesStr);
  const base = v2ParseUint(baseStr);
  const mult = v2ParseUint(multStr);
  const jump = v2ParseUint(jumpStr);
  const kink = v2ParseUint(kinkStr);
  const reserveFactor = v2ParseUint(reserveFactorStr);
  if (cash === null || borrows === null || reserves === null || base === null ||
      mult === null || jump === null || kink === null || reserveFactor === null) return null;
  if (reserveFactor > COMPOUND_EXP_SCALE) return null; // 1e18 − reserveFactor underflows
  let util;
  if (borrows === 0n) {
    util = 0n; // short-circuit: the denominator is never read
  } else {
    const total = cash + borrows;
    if (total > ERC4626_MAX_UINT256 || reserves > total) return null;
    const denom = total - reserves;
    if (denom === 0n) return null; // the contract divides by it
    const utilProduct = borrows * COMPOUND_EXP_SCALE;
    if (utilProduct > ERC4626_MAX_UINT256) return null;
    util = utilProduct / denom;
  }
  let borrowRate;
  if (util <= kink) {
    const prod = util * mult;
    if (prod > ERC4626_MAX_UINT256) return null;
    borrowRate = prod / COMPOUND_EXP_SCALE + base;
  } else {
    const prodK = kink * mult;
    if (prodK > ERC4626_MAX_UINT256) return null;
    const normal = prodK / COMPOUND_EXP_SCALE + base;
    if (normal > ERC4626_MAX_UINT256) return null;
    const prodJ = (util - kink) * jump;
    if (prodJ > ERC4626_MAX_UINT256) return null;
    borrowRate = prodJ / COMPOUND_EXP_SCALE + normal;
  }
  if (borrowRate > ERC4626_MAX_UINT256) return null;
  const poolProduct = borrowRate * (COMPOUND_EXP_SCALE - reserveFactor);
  if (poolProduct > ERC4626_MAX_UINT256) return null;
  const rateToPool = poolProduct / COMPOUND_EXP_SCALE;
  const supplyProduct = util * rateToPool;
  if (supplyProduct > ERC4626_MAX_UINT256) return null;
  const supplyRate = supplyProduct / COMPOUND_EXP_SCALE;
  return {
    utilization: util.toString(), borrowRate: borrowRate.toString(),
    supplyRate: supplyRate.toString(),
    regime: util <= kink ? "at or below the kink" : "above the kink"
  };
}

/* Compound liquidation seize tokens — Comptroller's
   liquidateCalculateSeizeTokens math (compound-protocol, BSD-3-Clause;
   formulas paraphrased, not copied), over ExponentialNoError's Exp
   helpers, every mantissa scaled by 1e18 and every step truncating
   before the next one reads it:
     numerator   = liquidationIncentive × priceBorrowed ÷ 1e18
     denominator = priceCollateral × exchangeRate ÷ 1e18
     ratio       = numerator × 1e18 ÷ denominator
     seizeTokens = ratio × actualRepayAmount ÷ 1e18
   Because each step truncates, the result can differ from the one-line
   formula repay × incentive × priceBorrowed ÷ (priceCollateral ×
   exchangeRate) whenever an intermediate product is not a multiple of
   1e18. A zero oracle price for either market makes the contract
   return its price error instead of a count and is refused here, as
   is a truncated denominator of 0 (a zero exchange rate is the usual
   way there; a tiny price × rate product truncates to 0 too), which
   the contract's division reverts on, and any product above the
   uint256 maximum. The redeem-equivalent underlying value reported
   alongside (seizeTokens × exchangeRate ÷ 1e18, the exchange-rate
   tool's conversion) is not part of the Comptroller function itself.
   This calculation does not decide whether an account may be
   liquidated at all — the shortfall and close-factor checks are
   separate Comptroller steps — and a later governance-added protocol
   seize share is not part of this function and is not modelled.
   Prices, incentive, exchange rate and repay amount are values the
   user supplies — a real liquidation's are oracle and chain state
   this page does not read. Nothing is queried on chain. */
function compoundSeizeTokens(repayStr, incentiveStr, priceBorrowedStr, priceCollateralStr, rateStr) {
  const repay = v2ParseUint(repayStr);
  const incentive = v2ParseUint(incentiveStr);
  const priceBorrowed = v2ParseUint(priceBorrowedStr);
  const priceCollateral = v2ParseUint(priceCollateralStr);
  const rate = v2ParseUint(rateStr);
  if (repay === null || incentive === null || priceBorrowed === null ||
      priceCollateral === null || rate === null) return null;
  if (priceBorrowed === 0n || priceCollateral === 0n) return null; // price error
  const numProduct = incentive * priceBorrowed;
  if (numProduct > ERC4626_MAX_UINT256) return null;
  const numerator = numProduct / COMPOUND_EXP_SCALE;
  const denProduct = priceCollateral * rate;
  if (denProduct > ERC4626_MAX_UINT256) return null;
  const denominator = denProduct / COMPOUND_EXP_SCALE;
  if (denominator === 0n) return null; // the contract divides by it
  const ratioProduct = numerator * COMPOUND_EXP_SCALE;
  if (ratioProduct > ERC4626_MAX_UINT256) return null;
  const ratio = ratioProduct / denominator;
  const seizeProduct = ratio * repay;
  if (seizeProduct > ERC4626_MAX_UINT256) return null;
  const tokens = seizeProduct / COMPOUND_EXP_SCALE;
  const underlyingProduct = tokens * rate;
  if (underlyingProduct > ERC4626_MAX_UINT256) return null;
  const underlying = underlyingProduct / COMPOUND_EXP_SCALE;
  return {
    seizeTokens: tokens.toString(), seizeUnderlying: underlying.toString(),
    ratio: ratio.toString()
  };
}

/* Compound hypothetical account liquidity — Comptroller's
   getHypotheticalAccountLiquidityInternal math (compound-protocol,
   BSD-3-Clause; formulas paraphrased, not copied) restricted to one
   entered market, over ExponentialNoError's Exp helpers, every
   mantissa scaled by 1e18:
     tokensToDenom = (collateralFactor × exchangeRate ÷ 1e18)
                     × oraclePrice ÷ 1e18   — two Exp multiplications,
                     each truncating before the next reads it, so the
                     factor can differ from the one-line product
                     ÷ 1e36 whenever an intermediate product is not a
                     multiple of 1e18 and the price is large enough
                     to amplify the discarded remainder
     sumCollateral        = tokensToDenom × cTokenBalance ÷ 1e18
     sumBorrowPlusEffects = oraclePrice × borrowBalance ÷ 1e18
                          + tokensToDenom × redeemTokens ÷ 1e18
                          + oraclePrice × borrowAmount ÷ 1e18
   Each scalar term is a mul_ScalarTruncate (product ÷ 1e18,
   truncating once) added with checked addition. If sumCollateral >
   sumBorrowPlusEffects the account's liquidity is the difference
   and its shortfall is 0; otherwise (equality included) liquidity
   is 0 and shortfall is sumBorrowPlusEffects − sumCollateral. A zero
   oracle price makes the contract return its price error instead of
   a result and is refused here, as is any product or running sum
   above the uint256 maximum, where the checked arithmetic reverts.
   The contract sums over every market the account has entered; this
   one-market form is exact for an account in a single market and
   otherwise gives that market's contribution plus the hypothetical
   redeem/borrow effects on it (the modify-market effects the
   redeem/borrow guards check). Balances are the stored snapshot
   values (the snapshot tool's outputs) — the stored exchange rate
   is used without accruing interest, exactly as the contract's own
   note states. Balances, factor, rate and price are values the user
   supplies — a real account's are chain state this page does not
   read. Nothing is queried on chain. */
function compoundLiquidity(balanceStr, borrowBalanceStr, factorStr, rateStr, priceStr, redeemStr, borrowAmtStr) {
  const balance = v2ParseUint(balanceStr);
  const borrowBalance = v2ParseUint(borrowBalanceStr);
  const factor = v2ParseUint(factorStr);
  const rate = v2ParseUint(rateStr);
  const price = v2ParseUint(priceStr);
  const redeem = v2ParseUint(redeemStr);
  const borrowAmt = v2ParseUint(borrowAmtStr);
  if (balance === null || borrowBalance === null || factor === null ||
      rate === null || price === null || redeem === null ||
      borrowAmt === null) return null;
  if (price === 0n) return null; // the contract returns its price error
  const stepProduct = factor * rate;
  if (stepProduct > ERC4626_MAX_UINT256) return null;
  const step = stepProduct / COMPOUND_EXP_SCALE;
  const denomProduct = step * price;
  if (denomProduct > ERC4626_MAX_UINT256) return null;
  const tokensToDenom = denomProduct / COMPOUND_EXP_SCALE;
  const collateralProduct = tokensToDenom * balance;
  if (collateralProduct > ERC4626_MAX_UINT256) return null;
  const collateral = collateralProduct / COMPOUND_EXP_SCALE;
  const borrowProduct = price * borrowBalance;
  if (borrowProduct > ERC4626_MAX_UINT256) return null;
  let total = borrowProduct / COMPOUND_EXP_SCALE;
  const redeemProduct = tokensToDenom * redeem;
  if (redeemProduct > ERC4626_MAX_UINT256) return null;
  total += redeemProduct / COMPOUND_EXP_SCALE;
  if (total > ERC4626_MAX_UINT256) return null;
  const borrowAmtProduct = price * borrowAmt;
  if (borrowAmtProduct > ERC4626_MAX_UINT256) return null;
  total += borrowAmtProduct / COMPOUND_EXP_SCALE;
  if (total > ERC4626_MAX_UINT256) return null;
  const liquid = collateral > total;
  return {
    tokensToDenom: tokensToDenom.toString(),
    collateral: collateral.toString(),
    borrowPlusEffects: total.toString(),
    liquidity: (liquid ? collateral - total : 0n).toString(),
    shortfall: (liquid ? 0n : total - collateral).toString()
  };
}

/* Compound liquidation allowed check — Comptroller's
   liquidateBorrowAllowed (compound-protocol, BSD-3-Clause;
   formulas paraphrased, not copied), restricted to the parts
   determined by the supplied numbers, all mantissas scaled by
   1e18. Standard path (borrowed market not deprecated): the
   borrower must have shortfall > 0 — the shortfall the liquidity
   tool computes — else the contract returns its
   insufficient-shortfall error, and it returns BEFORE the
   close-factor product is ever computed, so an overflowing
   product is not a refusal in that case. Then
     maxClose = closeFactor × borrowBalance ÷ 1e18
   one mul_ScalarTruncate (the product truncates once), and a
   repay above maxClose returns the too-much-repay error; a repay
   of exactly maxClose is allowed. A product above the uint256
   maximum is refused, as the checked arithmetic reverts there.
   Deprecated path: the contract lets a deprecated market's
   accounts be liquidated without reading shortfall or the close
   factor at all; the only bound is repay ≤ borrowBalance (it
   requires that). Whether the two markets are listed is a listing
   check on chain state, not a number, and is out of scope here,
   as are the cToken-side liquidation checks. Governance sets the
   stored close factor inside 0.05–0.9 in the current source; the
   check itself just multiplies by whatever factor it is given.
   Borrow balance, close factor and shortfall are values the user
   supplies — a real account's are chain state this page does not
   read. Nothing is queried on chain. */
function compoundLiquidateAllowed(borrowBalanceStr, closeFactorStr, shortfallStr, repayStr, deprecated) {
  const borrowBalance = v2ParseUint(borrowBalanceStr);
  const closeFactor = v2ParseUint(closeFactorStr);
  const shortfall = v2ParseUint(shortfallStr);
  const repay = v2ParseUint(repayStr);
  if (borrowBalance === null || closeFactor === null ||
      shortfall === null || repay === null) return null;
  if (typeof deprecated !== "boolean") return null;
  if (deprecated) {
    return repay > borrowBalance
      ? { allowed: false, verdict: "exceeds-borrow", maxClose: null }
      : { allowed: true, verdict: "allowed", maxClose: null };
  }
  if (shortfall === 0n) {
    return { allowed: false, verdict: "insufficient-shortfall", maxClose: null };
  }
  const product = closeFactor * borrowBalance;
  if (product > ERC4626_MAX_UINT256) return null;
  const maxClose = product / COMPOUND_EXP_SCALE;
  return repay > maxClose
    ? { allowed: false, verdict: "too-much-repay", maxClose: maxClose.toString() }
    : { allowed: true, verdict: "allowed", maxClose: maxClose.toString() };
}

/* Compound borrow allowed check — Comptroller's borrowAllowed
   (compound-protocol, BSD-3-Clause; formulas paraphrased, not
   copied), restricted to the parts determined by the supplied
   numbers, in the contract's own branch order:
     1. a zero oracle price for the borrowed market returns the
        price error BEFORE anything else is computed — the
        borrow-cap addition and the liquidity products are never
        reached, so an overflow in either is not a refusal there;
     2. the market borrow cap (a cap of 0 means unlimited, and
        the addition is never computed then either):
        nextTotalBorrows = totalBorrows + borrowAmount with
        checked addition (an overflow is refused, as it reverts),
        and the contract requires nextTotalBorrows < borrowCap,
        so reaching the cap exactly is refused as cap-reached —
        a verdict returned before the liquidity check runs, so
        it shields any overflow in that check's products too;
     3. the hypothetical liquidity check of the liquidity tool
        above (one market, redeem 0, borrow = borrowAmount): a
        shortfall above 0 is insufficient liquidity; a shortfall
        of exactly 0 — the borrow exhausting the account's
        liquidity exactly — is allowed. A product or sum above
        the uint256 maximum inside that check is refused, as the
        checked arithmetic reverts there, but only when the
        check is actually reached.
   The market-listing check, the borrow pause guardian and the
   membership / add-to-market step are chain state, not numbers:
   membership does not bypass this check (a non-member borrower
   is added to the market and the check continues), so none of
   them changes the numeric verdict and they are out of scope
   here, as are the COMP reward updates the contract performs
   afterwards. Balances, factor, rate, price, market totals and
   cap are values the user supplies — a real borrow's are chain
   state this page does not read. Nothing is queried on chain. */
function compoundBorrowAllowed(balanceStr, borrowBalanceStr, factorStr, rateStr, priceStr, borrowAmtStr, totalBorrowsStr, borrowCapStr) {
  const balance = v2ParseUint(balanceStr);
  const borrowBalance = v2ParseUint(borrowBalanceStr);
  const factor = v2ParseUint(factorStr);
  const rate = v2ParseUint(rateStr);
  const price = v2ParseUint(priceStr);
  const borrowAmt = v2ParseUint(borrowAmtStr);
  const totalBorrows = v2ParseUint(totalBorrowsStr);
  const borrowCap = v2ParseUint(borrowCapStr);
  if (balance === null || borrowBalance === null || factor === null ||
      rate === null || price === null || borrowAmt === null ||
      totalBorrows === null || borrowCap === null) return null;
  if (price === 0n) {
    return { allowed: false, verdict: "price-error", nextTotalBorrows: null, liquidity: null, shortfall: null };
  }
  let nextTotal = null;
  if (borrowCap !== 0n) {
    const next = totalBorrows + borrowAmt;
    if (next > ERC4626_MAX_UINT256) return null; // checked addition reverts
    nextTotal = next;
    if (next >= borrowCap) { // the contract requires next < cap
      return { allowed: false, verdict: "borrow-cap-reached", nextTotalBorrows: nextTotal.toString(), liquidity: null, shortfall: null };
    }
  }
  const liq = compoundLiquidity(balanceStr, borrowBalanceStr, factorStr, rateStr, priceStr, "0", borrowAmtStr);
  if (liq === null) return null;
  const nt = nextTotal === null ? null : nextTotal.toString();
  return BigInt(liq.shortfall) > 0n
    ? { allowed: false, verdict: "insufficient-liquidity", nextTotalBorrows: nt, liquidity: liq.liquidity, shortfall: liq.shortfall }
    : { allowed: true, verdict: "allowed", nextTotalBorrows: nt, liquidity: liq.liquidity, shortfall: liq.shortfall };
}

/* Compound redeem allowed check — Comptroller's redeemAllowed /
   redeemAllowedInternal (compound-protocol, BSD-3-Clause;
   formulas paraphrased, not copied), restricted to the parts
   determined by the supplied numbers, in the contract's own
   branch order:
     1. membership: if the redeemer is not 'in' (has not entered)
        the market, the internal check returns no error at once —
        the liquidity check is never run, so a zero oracle price
        or an overflowing liquidity product is not a refusal on
        that path, and the redeem amount is never weighed at all
        by this gate;
     2. member path: the hypothetical liquidity check of the
        liquidity tool above (one market, redeem = redeemTokens,
        borrow 0): a shortfall above 0 is insufficient liquidity;
        a shortfall of exactly 0 — the redeem exhausting the
        account's liquidity exactly — is allowed. A zero oracle
        price and any product or sum above the uint256 maximum
        inside that check are refused, as the contract errors or
        reverts there, but only when the check is actually
        reached.
   The market-listing check precedes the membership step on
   chain state, not a number, so the verdicts here are for a
   listed market and listing is out of scope, as are the COMP
   reward updates afterwards and the cToken-side steps (a
   redeem above the account's cToken balance fails there, not
   in this gate, which is why the bypass path never weighs the
   amount). The same internal check also underlies cToken
   transfers and exiting a market in the contract. Balances,
   factor, rate, price and membership are values the user
   supplies — a real account's are chain state this page does
   not read. Nothing is queried on chain. */
function compoundRedeemAllowed(balanceStr, borrowBalanceStr, factorStr, rateStr, priceStr, redeemStr, isMember) {
  const balance = v2ParseUint(balanceStr);
  const borrowBalance = v2ParseUint(borrowBalanceStr);
  const factor = v2ParseUint(factorStr);
  const rate = v2ParseUint(rateStr);
  const price = v2ParseUint(priceStr);
  const redeem = v2ParseUint(redeemStr);
  if (balance === null || borrowBalance === null || factor === null ||
      rate === null || price === null || redeem === null) return null;
  if (typeof isMember !== "boolean") return null;
  if (!isMember) {
    return { allowed: true, verdict: "not-in-market-bypass", liquidity: null, shortfall: null };
  }
  const liq = compoundLiquidity(balanceStr, borrowBalanceStr, factorStr, rateStr, priceStr, redeemStr, "0");
  if (liq === null) return null;
  return BigInt(liq.shortfall) > 0n
    ? { allowed: false, verdict: "insufficient-liquidity", liquidity: liq.liquidity, shortfall: liq.shortfall }
    : { allowed: true, verdict: "allowed", liquidity: liq.liquidity, shortfall: liq.shortfall };
}

/* Compound transfer allowed check — Comptroller's transferAllowed
   (compound-protocol, BSD-3-Clause; formulas paraphrased, not
   copied). Apart from the transfer pause guardian — a boolean on
   chain state that reverts when set, out of scope here — the
   gate's only numeric consideration is whether the SOURCE account
   could redeem the same number of cTokens: it runs the internal
   redeem check of the tool above on the source with
   transferTokens as the redeem amount and returns its verdict
   unchanged, in that check's branch order:
     1. membership of the SOURCE: if the source has not entered
        the market, the internal check returns no error at once —
        the liquidity check is never run, so a zero oracle price
        or an overflowing liquidity product is not a refusal on
        that path, and the transfer amount is never weighed at
        all by this gate;
     2. member source: the hypothetical liquidity check of the
        liquidity tool (one market, redeem = transferTokens,
        borrow 0): a shortfall above 0 is insufficient liquidity;
        a shortfall of exactly 0 — the transfer exhausting the
        source's liquidity exactly — is allowed. A zero oracle
        price and any product or sum above the uint256 maximum
        inside that check are refused, as the contract errors or
        reverts there, but only when the check is actually
        reached.
   The DESTINATION account is never read by the gate — it
   appears only in the COMP reward updates afterwards — and
   there is no self-transfer shortcut: source == destination
   runs the same check, which is why this tool takes no
   destination input at all. The market-listing check precedes
   the membership step inside the internal check, on chain
   state, not a number, so the verdicts here are for a listed
   market and listing is out of scope, as are the COMP reward
   updates and the cToken-side steps (a transfer above the
   source's cToken balance fails there, not in this gate, which
   is why the bypass path never weighs the amount). Balances,
   factor, rate, price and the source's membership are values
   the user supplies — a real account's are chain state this
   page does not read. Nothing is queried on chain. */
function compoundTransferAllowed(balanceStr, borrowBalanceStr, factorStr, rateStr, priceStr, transferStr, srcIsMember) {
  const balance = v2ParseUint(balanceStr);
  const borrowBalance = v2ParseUint(borrowBalanceStr);
  const factor = v2ParseUint(factorStr);
  const rate = v2ParseUint(rateStr);
  const price = v2ParseUint(priceStr);
  const transfer = v2ParseUint(transferStr);
  if (balance === null || borrowBalance === null || factor === null ||
      rate === null || price === null || transfer === null) return null;
  if (typeof srcIsMember !== "boolean") return null;
  if (!srcIsMember) {
    return { allowed: true, verdict: "not-in-market-bypass", liquidity: null, shortfall: null };
  }
  const liq = compoundLiquidity(balanceStr, borrowBalanceStr, factorStr, rateStr, priceStr, transferStr, "0");
  if (liq === null) return null;
  return BigInt(liq.shortfall) > 0n
    ? { allowed: false, verdict: "insufficient-liquidity", liquidity: liq.liquidity, shortfall: liq.shortfall }
    : { allowed: true, verdict: "allowed", liquidity: liq.liquidity, shortfall: liq.shortfall };
}

/* Compound exit market check — Comptroller's exitMarket
   (compound-protocol, BSD-3-Clause; formulas paraphrased, not
   copied), restricted to the parts determined by the supplied
   numbers. The contract first reads the account's snapshot in
   the market — the cTokens held and the underlying owed — then
   proceeds in this branch order:
     1. amount owed: owing anything at all in this market
        refuses the exit as a nonzero borrow balance, and
        nothing else is read — price, factor and membership are
        never reached, so a zero price or an overflowing
        product is not a refusal on that path, and a non-member
        owing a balance is refused here too, before every
        membership step;
     2. the internal redeem check of the redeem tool, with the
        redeem amount set to the account's FULL cToken balance:
        a non-member bypasses the liquidity check entirely and
        the exit succeeds (there is no membership to remove);
        a member runs the hypothetical liquidity check of the
        liquidity tool (one market, redeem = full balance,
        borrow 0). On this path the borrow balance inside that
        check is the amount owed — already established as 0 —
        and the redeem term is computed from exactly the same
        inputs as the collateral term, so the two cancel
        identically: liquidity and shortfall both come out 0
        whenever the check is reached and completes, and the
        only refusals it can still produce here are its own
        errors — a zero oracle price, and any product or sum
        above the uint256 maximum, as the contract errors or
        reverts there.
   The market-listing check precedes the membership step inside
   the internal check, on chain state, not a number, so the
   verdicts here are for a listed market and listing is out of
   scope, as is the snapshot read itself (assumed to succeed;
   its inputs are the snapshot tool's). In the full contract
   the liquidity check sums over every market the account has
   entered, so a real exit can be refused for a shortfall
   arising from OTHER markets' borrows once this market's
   collateral is removed; this one-market form is exact for an
   account entered in a single market. Balances, factor, rate,
   price and membership are values the user supplies — a real
   account's are chain state this page does not read. Nothing
   is queried on chain. */
function compoundExitMarket(balanceStr, owedStr, factorStr, rateStr, priceStr, isMember) {
  const balance = v2ParseUint(balanceStr);
  const owed = v2ParseUint(owedStr);
  const factor = v2ParseUint(factorStr);
  const rate = v2ParseUint(rateStr);
  const price = v2ParseUint(priceStr);
  if (balance === null || owed === null || factor === null ||
      rate === null || price === null) return null;
  if (typeof isMember !== "boolean") return null;
  if (owed !== 0n) {
    return { allowed: false, verdict: "nonzero-borrow-balance", liquidity: null, shortfall: null };
  }
  if (!isMember) {
    return { allowed: true, verdict: "not-in-market-bypass", liquidity: null, shortfall: null };
  }
  const liq = compoundLiquidity(balanceStr, owedStr, factorStr, rateStr, priceStr, balanceStr, "0");
  if (liq === null) return null;
  return BigInt(liq.shortfall) > 0n
    ? { allowed: false, verdict: "insufficient-liquidity", liquidity: liq.liquidity, shortfall: liq.shortfall }
    : { allowed: true, verdict: "allowed", liquidity: liq.liquidity, shortfall: liq.shortfall };
}

/* Aave V3 account data — Pool.getUserAccountData's aggregate
   math (aave-v3-core, BUSL-1.1; formulas paraphrased, not
   copied), over the account totals the Pool itself works
   with. getUserAccountData returns six values; four are the
   aggregates GenericLogic.calculateUserAccountData produces
   from the reserves (total collateral and total debt in the
   oracle's base currency — USD at 8 decimals on the mainnet
   market — and the collateral-weighted average LTV and
   liquidation threshold, each in basis points with two
   decimals of precision, 10000 = 100.00%), and the other two
   are derived from them by exactly the functions below:
     availableBorrowsBase = percentMul(collateral, ltv) − debt,
       clamped to 0 when the debt exceeds it
       (GenericLogic.calculateAvailableBorrows);
     healthFactor = uint256 max                        if debt is 0
                  = wadDiv(percentMul(collateral, avgLiquidationThreshold),
                           debt)                      otherwise
       (GenericLogic.calculateUserAccountData), returned
       scaled by 1e18 — a health factor of exactly 1e18 is
       the liquidation boundary: below it the account can be
       liquidated, at or above it it cannot.
   The two traps are the roundings, because neither helper
   truncates: PercentageMath.percentMul adds half the factor
   before dividing — (value × pct + 5000) ÷ 10000, rounded
   half up — so one base unit of collateral at exactly 50.00%
   contributes a full unit, where a truncating formula (the
   Compound tools' style) would contribute none; and
   WadRayMath.wadDiv adds half the divisor —
   (a × 1e18 + b ÷ 2) ÷ b, also half up. Together they are
   why the prefilled account's health factor is exactly
   1333333333333333333 and not a ...332 or ...334 neighbour.
   Overflow mirrors the libraries' own revert conditions:
   percentMul reverts when pct is non-zero and the value
   exceeds (2^256 − 1 − 5000) ÷ pct; wadDiv reverts when its
   numerator exceeds (2^256 − 1 − debt ÷ 2) ÷ 1e18 — both are
   refused here, as are an LTV or a liquidation threshold
   above 10000, which the weighted averages the Pool computes
   can never exceed (each reserve's own value is at most
   10000). The per-reserve walk that produces the four totals
   from balances, prices and configurations (including eMode
   categories) is chain state this page does not read; the
   totals and averages are values the user supplies. Nothing
   is queried on chain. */
const AAVE_PERCENTAGE_FACTOR = 10000n;
const AAVE_HALF_PERCENTAGE = 5000n;
const AAVE_WAD = 10n ** 18n;
function aavePercentMul(value, pct) {
  if (pct !== 0n && value > (ERC4626_MAX_UINT256 - AAVE_HALF_PERCENTAGE) / pct) return null;
  return (value * pct + AAVE_HALF_PERCENTAGE) / AAVE_PERCENTAGE_FACTOR;
}
function aaveWadDiv(a, b) {
  if (b === 0n) return null;
  if (a > (ERC4626_MAX_UINT256 - b / 2n) / AAVE_WAD) return null;
  return (a * AAVE_WAD + b / 2n) / b;
}
function aaveAccountCalc(collateralStr, debtStr, ltvStr, thresholdStr) {
  const collateral = v2ParseUint(collateralStr);
  const debt = v2ParseUint(debtStr);
  const ltv = v2ParseUint(ltvStr);
  const threshold = v2ParseUint(thresholdStr);
  if (collateral === null || debt === null || ltv === null || threshold === null) return null;
  if (ltv > AAVE_PERCENTAGE_FACTOR || threshold > AAVE_PERCENTAGE_FACTOR) return null;
  const borrowPower = aavePercentMul(collateral, ltv);
  const liquidationPower = aavePercentMul(collateral, threshold);
  if (borrowPower === null || liquidationPower === null) return null;
  let healthFactor;
  if (debt === 0n) {
    healthFactor = ERC4626_MAX_UINT256;
  } else {
    healthFactor = aaveWadDiv(liquidationPower, debt);
    if (healthFactor === null) return null;
  }
  const available = borrowPower < debt ? 0n : borrowPower - debt;
  return {
    totalCollateralBase: collateral.toString(),
    totalDebtBase: debt.toString(),
    availableBorrowsBase: available.toString(),
    currentLiquidationThreshold: threshold.toString(),
    ltv: ltv.toString(),
    healthFactor: healthFactor.toString(),
    liquidatable: debt > 0n && healthFactor < AAVE_WAD ? "true" : "false"
  };
}

/* Aave V3 interest accrual — MathUtils' two interest
   factors and the reserve-index updates built on them
   (aave-v3-core, BUSL-1.1; formulas paraphrased, not
   copied). A reserve's indexes only move when the reserve
   is touched, and ReserveLogic moves them by multiplying
   the stored index by an interest factor for the elapsed
   time:
     liquidity index      = rayMul(linearFactor, index)
       (ReserveLogic.getNormalizedIncome / _updateIndexes,
        from calculateLinearInterest(currentLiquidityRate));
     variable borrow index = rayMul(compoundedFactor, index)
       (getNormalizedDebt, from calculateCompoundedInterest
        (currentVariableBorrowRate)).
   The linear factor is plain truncating arithmetic:
   RAY + rate × exp ÷ SECONDS_PER_YEAR (31,536,000 — 365
   days, leap years ignored), with the rate × exp product
   CHECKED, so it reverts past the uint256 maximum. The
   compounded factor is NOT an exponentiation: it is the
   three-term binomial approximation (1+x)^n ≈ 1 + nx +
   n(n−1)/2·x² + n(n−1)(n−2)/6·x³ with x the per-second
   rate, which the source notes slightly underpays
   suppliers and undercharges borrowers in exchange for
   the gas saving. Its two traps live in the unchecked
   block: basePowerTwo is rayMul(rate, rate) — half-up,
   with rayMul's own revert bound — computed BEFORE the
   terms it feeds, so a rate past about 2^128 refuses even
   at exp = 1, where the second and third terms carry an
   expMinusOne factor of 0 and would vanish; and the
   second/third terms' leading multiplications
   (exp × expMinusOne × basePower) are CHECKED, so a huge
   elapsed time refuses there even when rate × exp fits.
   expMinusTwo is clamped to 0 at exp ≤ 2, which is what
   keeps the third term at 0 for a two-second accrual.
   Zero elapsed time returns RAY from both functions
   before the rate is ever read, so any rate at all —
   even the uint256 maximum — accrues nothing over no
   time. rayMul itself rounds half up ((a × b + RAY/2) ÷
   RAY) and reverts when the first operand exceeds
   (2^256 − 1 − RAY/2) ÷ the second (a zero second operand
   never reverts and yields 0 — a zero index stays zero).
   Rates are rays (1e27 = 100% per year, so 5% is
   50000000000000000000000000) and indexes are rays that
   start at 1e27. The rates and the stored index are chain
   state this page does not read; all three are values the
   user supplies. Nothing is queried on chain. */
const AAVE_RAY = 10n ** 27n;
const AAVE_HALF_RAY = 5n * 10n ** 26n;
const AAVE_SECONDS_PER_YEAR = 31536000n;
function aaveRayMul(a, b) {
  if (b !== 0n && a > (ERC4626_MAX_UINT256 - AAVE_HALF_RAY) / b) return null;
  return (a * b + AAVE_HALF_RAY) / AAVE_RAY;
}
function aaveInterestCalc(rateStr, elapsedStr, indexStr) {
  const rate = v2ParseUint(rateStr);
  const exp = v2ParseUint(elapsedStr);
  const index = v2ParseUint(indexStr);
  if (rate === null || exp === null || index === null) return null;
  let linearFactor;
  let compoundedFactor;
  if (exp === 0n) {
    linearFactor = AAVE_RAY;
    compoundedFactor = AAVE_RAY;
  } else {
    const product = rate * exp;
    if (product > ERC4626_MAX_UINT256) return null;
    linearFactor = AAVE_RAY + product / AAVE_SECONDS_PER_YEAR;
    if (linearFactor > ERC4626_MAX_UINT256) return null;
    const expMinusOne = exp - 1n;
    const expMinusTwo = exp > 2n ? exp - 2n : 0n;
    const bp2raw = aaveRayMul(rate, rate);
    if (bp2raw === null) return null;
    const basePowerTwo = bp2raw / (AAVE_SECONDS_PER_YEAR * AAVE_SECONDS_PER_YEAR);
    const bp3raw = aaveRayMul(basePowerTwo, rate);
    if (bp3raw === null) return null;
    const basePowerThree = bp3raw / AAVE_SECONDS_PER_YEAR;
    const stProduct = exp * expMinusOne * basePowerTwo;
    if (stProduct > ERC4626_MAX_UINT256) return null;
    const secondTerm = stProduct / 2n;
    const ttProduct = exp * expMinusOne * expMinusTwo * basePowerThree;
    if (ttProduct > ERC4626_MAX_UINT256) return null;
    const thirdTerm = ttProduct / 6n;
    compoundedFactor = linearFactor + secondTerm + thirdTerm;
    if (compoundedFactor > ERC4626_MAX_UINT256) return null;
  }
  const newLiquidityIndex = aaveRayMul(linearFactor, index);
  const newVariableBorrowIndex = aaveRayMul(compoundedFactor, index);
  if (newLiquidityIndex === null || newVariableBorrowIndex === null) return null;
  return {
    linearFactor: linearFactor.toString(),
    compoundedFactor: compoundedFactor.toString(),
    newLiquidityIndex: newLiquidityIndex.toString(),
    newVariableBorrowIndex: newVariableBorrowIndex.toString()
  };
}

/* Aave V3 liquidation — LiquidationLogic's debt and
   collateral math (aave-v3-core, BUSL-1.1; formulas
   paraphrased, not copied), over the position values the
   caller supplies. A liquidation call (Pool.liquidationCall)
   first derives the account's health factor exactly as the
   account tool above does; ValidationLogic reverts unless
   it is below 1e18, and that gate is applied here FIRST —
   at or above it the position is not liquidatable and every
   amount is zero, whatever the other inputs are (a debt-free
   account's health factor is the uint256 maximum). Below
   the gate, _calculateDebt picks the close factor by a
   STRICT comparison against CLOSE_FACTOR_HF_THRESHOLD
   (0.95e18): above it the liquidator may cover at most
   DEFAULT_LIQUIDATION_CLOSE_FACTOR (5000 = 50.00%) of the
   debt in this reserve, at or below it
   MAX_LIQUIDATION_CLOSE_FACTOR (10000 = 100.00%); the
   requested cover is clamped to percentMul(totalDebt,
   closeFactor). _calculateAvailableCollateralToLiquidate
   then prices the seized collateral in the oracle's base
   currency (8 decimals on the mainnet market):
     baseCollateral = debtPrice × debtToCover × 10^collDec
                      ÷ (collateralPrice × 10^debtDec)
     maxCollateral  = percentMul(baseCollateral, bonus)
   with truncating division. If that exceeds the user's
   collateral balance, the whole balance is seized instead
   and the debt actually covered is recomputed BACKWARD —
   percentDiv((collateralPrice × balance × 10^debtDec) ÷
   (debtPrice × 10^collDec), bonus) — so a capped
   liquidation covers less debt than the close factor
   allowed. Finally, when the reserve's liquidation protocol
   fee percentage is non-zero, the protocol takes
   percentMul(bonusCollateral, feePct) of the BONUS part
   only — bonusCollateral = seized − percentDiv(seized,
   bonus) — and the liquidator receives the rest.
   PercentageMath rounds half up in both directions:
   percentMul is (value × pct + 5000) ÷ 10000 and percentDiv
   is (value × 10000 + pct ÷ 2) ÷ pct, each with its own
   revert bound (percentDiv also reverts at a zero
   percentage). The products debtPrice × cover × 10^collDec
   and collateralPrice × balance × 10^debtDec are checked
   Solidity multiplications, refused here past the uint256
   maximum, as are the percent helpers' own bounds. A
   liquidation bonus below 10000 (100.00%) is refused: the
   reserve configuration always stores at least that (10000
   itself means no bonus at all, only repayment value), and
   below it the fee branch's bonus subtraction would
   underflow. A protocol fee percentage above 10000, a zero
   price on either asset (the source divides by both), and
   decimals above 77 (whose 10^decimals unit exceeds the
   uint256 range the protocol's sane configurations stay
   inside) are likewise refused. The health factor, debt,
   balances, prices, bonus and fee percentage are chain
   state this page does not read — including which reserves
   the account actually uses, eMode categories, and whether
   this collateral backs this debt at all; all are values
   the user supplies. Nothing is queried on chain. */
const AAVE_LIQUIDATION_HF_THRESHOLD = 95n * 10n ** 16n;
const AAVE_DEFAULT_CLOSE_FACTOR = 5000n;
const AAVE_MAX_CLOSE_FACTOR = 10000n;
function aavePercentDiv(value, pct) {
  if (pct === 0n || value > (ERC4626_MAX_UINT256 - pct / 2n) / AAVE_PERCENTAGE_FACTOR) return null;
  return (value * AAVE_PERCENTAGE_FACTOR + pct / 2n) / pct;
}
function aaveLiquidationCalc(healthFactorStr, totalDebtStr, debtToCoverStr, collateralBalanceStr, collateralPriceStr, debtPriceStr, collateralDecimalsStr, debtDecimalsStr, liquidationBonusStr, protocolFeePctStr) {
  const healthFactor = v2ParseUint(healthFactorStr);
  const totalDebt = v2ParseUint(totalDebtStr);
  const debtToCover = v2ParseUint(debtToCoverStr);
  const collateralBalance = v2ParseUint(collateralBalanceStr);
  const collateralPrice = v2ParseUint(collateralPriceStr);
  const debtPrice = v2ParseUint(debtPriceStr);
  const collateralDecimals = v2ParseUint(collateralDecimalsStr);
  const debtDecimals = v2ParseUint(debtDecimalsStr);
  const liquidationBonus = v2ParseUint(liquidationBonusStr);
  const protocolFeePct = v2ParseUint(protocolFeePctStr);
  if (healthFactor === null || totalDebt === null || debtToCover === null || collateralBalance === null || collateralPrice === null || debtPrice === null || collateralDecimals === null || debtDecimals === null || liquidationBonus === null || protocolFeePct === null) return null;
  if (healthFactor >= AAVE_WAD) {
    return {
      liquidatable: "false",
      closeFactor: "0",
      maxLiquidatableDebt: "0",
      debtCovered: "0",
      collateralSeized: "0",
      protocolFee: "0",
      collateralToLiquidator: "0",
      cappedByCollateral: "false"
    };
  }
  if (liquidationBonus < AAVE_PERCENTAGE_FACTOR || protocolFeePct > AAVE_PERCENTAGE_FACTOR) return null;
  if (collateralDecimals > 77n || debtDecimals > 77n) return null;
  if (collateralPrice === 0n || debtPrice === 0n) return null;
  const closeFactor = healthFactor > AAVE_LIQUIDATION_HF_THRESHOLD ? AAVE_DEFAULT_CLOSE_FACTOR : AAVE_MAX_CLOSE_FACTOR;
  const maxLiquidatableDebt = aavePercentMul(totalDebt, closeFactor);
  if (maxLiquidatableDebt === null) return null;
  const actualDebt = debtToCover < maxLiquidatableDebt ? debtToCover : maxLiquidatableDebt;
  const collateralUnit = 10n ** collateralDecimals;
  const debtUnit = 10n ** debtDecimals;
  let numerator = debtPrice * actualDebt;
  if (numerator > ERC4626_MAX_UINT256) return null;
  numerator *= collateralUnit;
  if (numerator > ERC4626_MAX_UINT256) return null;
  const denominator = collateralPrice * debtUnit;
  if (denominator > ERC4626_MAX_UINT256) return null;
  const baseCollateral = numerator / denominator;
  const maxCollateral = aavePercentMul(baseCollateral, liquidationBonus);
  if (maxCollateral === null) return null;
  let collateralAmount;
  let debtCovered;
  let cappedByCollateral;
  if (maxCollateral > collateralBalance) {
    collateralAmount = collateralBalance;
    cappedByCollateral = "true";
    let capNumerator = collateralPrice * collateralAmount;
    if (capNumerator > ERC4626_MAX_UINT256) return null;
    capNumerator *= debtUnit;
    if (capNumerator > ERC4626_MAX_UINT256) return null;
    const capDenominator = debtPrice * collateralUnit;
    if (capDenominator > ERC4626_MAX_UINT256) return null;
    debtCovered = aavePercentDiv(capNumerator / capDenominator, liquidationBonus);
    if (debtCovered === null) return null;
  } else {
    collateralAmount = maxCollateral;
    cappedByCollateral = "false";
    debtCovered = actualDebt;
  }
  let protocolFee = 0n;
  if (protocolFeePct !== 0n) {
    const baseCollateralAmount = aavePercentDiv(collateralAmount, liquidationBonus);
    if (baseCollateralAmount === null) return null;
    const bonusCollateral = collateralAmount - baseCollateralAmount;
    protocolFee = aavePercentMul(bonusCollateral, protocolFeePct);
    if (protocolFee === null) return null;
  }
  return {
    liquidatable: "true",
    closeFactor: closeFactor.toString(),
    maxLiquidatableDebt: maxLiquidatableDebt.toString(),
    debtCovered: debtCovered.toString(),
    collateralSeized: collateralAmount.toString(),
    protocolFee: protocolFee.toString(),
    collateralToLiquidator: (collateralAmount - protocolFee).toString(),
    cappedByCollateral: cappedByCollateral
  };
}

/* ModExp precompile gas — the pricing of the EVM's modular
   exponentiation precompile at address 0x05, under both
   schedules that have priced it (EIP-2565, in force from
   Berlin, and EIP-7883, the Fusaka repricing; both EIPs are
   CC0, formulas transcribed from their published pseudocode).
   The precompile's input names three lengths — base, exponent
   and modulus, in bytes — and the gas depends only on those
   lengths and on the exponent's head, its first
   min(exponentLength, 32) bytes read as an integer, which is
   how the EIPs' iteration function receives it and how clients
   read it:
     multiplication complexity: words = ceil(max(baseLength,
       modulusLength) / 8); EIP-2565 charges words^2, while
       EIP-7883 charges a flat 16 while the maximum is at most
       32 bytes and 2 * words^2 above that;
     iteration count: a zero exponent of at most 32 bytes gives
       0; a short exponent gives its bit length minus 1; a
       longer exponent gives perByte * (exponentLength - 32)
       plus the head's bit length minus 1 (perByte is 8 under
       EIP-2565 and 16 under EIP-7883 — with a non-zero head
       the sum is exactly the exponent's own bit length minus
       1; a zero head contributes -1 there, as the pseudocode's
       arithmetic gives it); either way the count is floored
       at 1;
     gas: EIP-2565 charges max(200, floor(complexity *
       iteration / 3)); EIP-7883 charges max(500, complexity *
       iteration) — the divisor is gone and the minimum rises.
   Lengths are decimal byte counts and the head is hex of
   exactly min(exponentLength, 32) bytes (the whole exponent
   when it is short, empty when its length is 0); anything
   else is refused. This prices a call under each schedule's
   formula — which schedule a given chain applies is that
   chain's fork state (Ethereum mainnet applies EIP-7883
   since Fusaka), and no chain is queried.
   The Fusaka schedule also carries a validity cap the old
   schedule never had (EIP-7823, Final, a core EIP of the
   Fusaka fork): each of the three lengths must be at most
   1,024 bytes (8,192 bits), and if any one exceeds that the
   precompile stops, returns an error and consumes all gas
   forwarded to it — so under Fusaka there is no finite
   EIP-7883 price for such a call, and this function reports
   it instead: capped7823 is true and gas7883 is null (the
   EIP-7883 complexity and iteration values are still the
   formula's, for a call that cannot run). The cap is per
   length, not on the total input, and exactly 1,024 is
   allowed. The EIP-2565 schedule had no cap, so its price
   is still quoted at any length. */
function modexpGas(baseLenStr, expLenStr, modLenStr, expHeadHex) {
  const baseLen = v2ParseUint(baseLenStr);
  const expLen = v2ParseUint(expLenStr);
  const modLen = v2ParseUint(modLenStr);
  if (baseLen === null || expLen === null || modLen === null) return null;
  const headLen = expLen < 32n ? Number(expLen) : 32;
  const headBytes = parseHexBytes(expHeadHex, headLen);
  if (headBytes === null) return null;
  let head = 0n;
  for (const b of headBytes) head = (head << 8n) | BigInt(b);
  const headBits = head === 0n ? 0n : BigInt(head.toString(2).length);
  const iter = (perByte) => {
    let it;
    if (expLen <= 32n && head === 0n) it = 0n;
    else if (expLen <= 32n) it = headBits - 1n;
    else it = perByte * (expLen - 32n) + (headBits - 1n);
    return it < 1n ? 1n : it;
  };
  const maxLen = baseLen > modLen ? baseLen : modLen;
  const words = (maxLen + 7n) / 8n;
  const complexity2565 = words * words;
  const iteration2565 = iter(8n);
  const raw2565 = complexity2565 * iteration2565 / 3n;
  const gas2565 = raw2565 < 200n ? 200n : raw2565;
  const complexity7883 = maxLen <= 32n ? 16n : 2n * words * words;
  const iteration7883 = iter(16n);
  const raw7883 = complexity7883 * iteration7883;
  const gas7883 = raw7883 < 500n ? 500n : raw7883;
  const capped7823 = baseLen > 1024n || expLen > 1024n || modLen > 1024n;
  return {
    complexity2565: complexity2565.toString(), iteration2565: iteration2565.toString(), gas2565: gas2565.toString(),
    complexity7883: complexity7883.toString(), iteration7883: iteration7883.toString(),
    gas7883: capped7823 ? null : gas7883.toString(), capped7823
  };
}

/* ---------- MODEXP precompile calculator (EIP-198) ----------
   The applied counterpart of the gas calculator above: that tool
   prices a MODEXP call from the operand lengths alone and states
   plainly that it does not compute the modular exponentiation
   itself — this one does. The operands are the precompile's own
   byte strings (EIP-198, CC0; semantics paraphrased): the result
   is base^exponent mod modulus, returned as exactly as many bytes
   as the modulus operand — left-padded with zeros — because that
   padding is what a caller reads. Consequences pinned in tests:
   leading zero bytes in an operand change nothing about the value
   but DO count toward its length (and so toward the gas and the
   output width); a modulus of 1 or 0 yields zero (the precompile
   returns zero bytes of modulus width for a zero modulus rather
   than failing); an empty modulus yields empty output; a zero
   exponent yields 1 whenever the modulus exceeds 1, including
   0^0. The price is the hub's own ModExp gas function fed the
   operand lengths and the exponent's head, cross-checked against
   it exactly in tests. Operands over 1,024 bytes are refused
   outright as this tool's stated display cap — the same bound
   EIP-7823 sets, past which a Fusaka chain's precompile errors
   and returns nothing whatever the mathematics says — so every
   call this tool computes is within the cap and both schedules'
   prices always exist. Verified in the tests against
   an independent pure-Python oracle (oracle-modexp-calc.py,
   anchored on hand-computed 3^5 mod 7 = 5 and 2^10 mod 1000 = 24
   and the RSA textbook pair 65^17 mod 3233 = 2790 /
   2790^2753 mod 3233 = 65) before the vectors were emitted.
   Computes locally; no call is made and no chain is queried. */
function modexpCalc(baseHex, expHex, modHex) {
  const baseBytes = parseHexBytes(baseHex);
  const expBytes = parseHexBytes(expHex);
  const modBytes = parseHexBytes(modHex);
  if (baseBytes === null || expBytes === null || modBytes === null) return null;
  if (baseBytes.length > 1024 || expBytes.length > 1024 || modBytes.length > 1024) return null;
  const base = bytesToBigInt(baseBytes);
  const exp = bytesToBigInt(expBytes);
  const mod = bytesToBigInt(modBytes);
  let result = 0n;
  if (modBytes.length > 0 && mod > 1n) {
    result = 1n % mod;
    let b = base % mod;
    let e = exp;
    while (e > 0n) {
      if (e & 1n) result = (result * b) % mod;
      b = (b * b) % mod;
      e >>= 1n;
    }
  }
  const outBytes = [];
  let v = result;
  for (let i = modBytes.length - 1; i >= 0; i--) { outBytes[i] = Number(v & 0xffn); v >>= 8n; }
  const headLen = Math.min(expBytes.length, 32);
  const gas = modexpGas(String(baseBytes.length), String(expBytes.length), String(modBytes.length),
    "0x" + bytesToHex(expBytes.slice(0, headLen)));
  if (gas === null) return null;
  return {
    result: "0x" + bytesToHex(outBytes), resultDecimal: result.toString(),
    baseLen: String(baseBytes.length), expLen: String(expBytes.length), modLen: String(modBytes.length),
    gas2565: gas.gas2565, gas7883: gas.gas7883, capped7823: gas.capped7823
  };
}

/* SSTORE gas — the cost and refund-counter change of one
   SSTORE under net gas metering (EIP-2200, CC0; formulas
   paraphrased) with the parameter values current mainnet
   applies: the warm storage read cost is 100 and a slot's
   first touch in a transaction adds a 2,100 cold surcharge
   (EIP-2929, CC0), the reset cost is 2,900 (5,000 minus the
   cold cost, which is now charged separately), and the
   clearing schedule is 4,800 with the transaction refund
   capped at a fifth of gas used (EIP-3529, CC0 — the cap is
   transaction-level and is not applied to this one write).
   Only whether each of the slot's three values — original
   (at the transaction's start), current (before this write)
   and new (being written) — is zero, and how they compare,
   decides the branch:
     no-op (new = current): 100;
     clean (current = original): 20,000 for a set from zero,
       otherwise 2,900, plus a 4,800 refund-counter credit
       when a clean write clears the slot to zero;
     dirty (current differs from original): 100, and the
       refund counter moves — minus 4,800 when a slot that
       was cleared earlier in the transaction is written
       away from zero again, plus 4,800 when this write
       clears it, and, when the write restores the original
       value, plus 19,900 (set cost minus 100) for a zero
       original or 2,800 (reset cost minus 100) for a
       non-zero one — so a dirty refund change can be
       negative.
   Values are uint256 words in decimal or 0x hex; anything
   else is refused. The EIP-2200 stipend guard (a write
   fails when the remaining gas is at most 2,300) is a
   validity rule about the call frame, not part of this
   price, and is not modelled. */
function sstoreParseWord(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  let v;
  if (/^0[xX][0-9a-fA-F]+$/.test(s)) {
    if (s.length > 66) return null;
    v = BigInt(s);
  } else if (/^\d+$/.test(s)) {
    if (s.length > 78) return null;
    v = BigInt(s);
  } else return null;
  return v <= (1n << 256n) - 1n ? v : null;
}
function sstoreGas(originalStr, currentStr, newStr, isCold) {
  const original = sstoreParseWord(originalStr);
  const current = sstoreParseWord(currentStr);
  const fresh = sstoreParseWord(newStr);
  if (original === null || current === null || fresh === null) return null;
  if (typeof isCold !== "boolean") return null;
  let gas, refund = 0n, branch;
  if (fresh === current) {
    gas = 100n; branch = "no-op";
  } else if (current === original) {
    if (original === 0n) { gas = 20000n; branch = "clean-set"; }
    else if (fresh === 0n) { gas = 2900n; refund = 4800n; branch = "clean-clear"; }
    else { gas = 2900n; branch = "clean-reset"; }
  } else {
    gas = 100n; branch = "dirty";
    if (original !== 0n) {
      if (current === 0n) refund -= 4800n;
      if (fresh === 0n) refund += 4800n;
    }
    if (fresh === original) refund += original === 0n ? 19900n : 2800n;
  }
  if (isCold) gas += 2100n;
  return { gas: gas.toString(), refundDelta: refund.toString(), branch };
}

/* Memory expansion gas — the EVM prices memory in 32-byte
   words with the Yellow Paper's memory-cost function (as
   implemented by go-ethereum's memoryGasCost with its
   MemoryGas = 3 and QuadCoeffDiv = 512 parameters; formulas
   paraphrased): holding w words costs, in total,
   C(w) = 3w + floor(w^2 / 512) — a linear term plus a
   quadratic term that first becomes non-zero at 23 words
   (23^2 = 529 >= 512) and reaches the linear term's scale
   at 512 words. An operation that grows memory is charged
   only the difference, C(new words) - C(current words),
   and nothing when it does not grow memory; the client
   tracks the running total (its lastGasCost), so stepwise
   expansions telescope to the one-shot difference. Byte
   sizes round up to whole words on both sides. A new size
   above 0x1FFFFFFFE0 bytes (137,438,953,440) overflows the
   client's gas calculation and is refused, as the client
   refuses it; a current size above that bound could never
   have been allocated and is refused too. This is the
   expansion charge only — an operation's own static and
   per-word costs (an MSTORE's base cost, a copier's per-word
   charge, KECCAK256's per-word charge) are separate and are
   not modelled. */
const MEM_MAX_BYTES = 137438953440n;
function memParseBytes(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (!/^\d+$/.test(s) || s.length > 12) return null;
  const v = BigInt(s);
  return v <= MEM_MAX_BYTES ? v : null;
}
function memTotalCost(words) { return 3n * words + (words * words) / 512n; }
function memoryGas(currentStr, newStr) {
  const cur = memParseBytes(currentStr);
  const fresh = memParseBytes(newStr);
  if (cur === null || fresh === null) return null;
  const curWords = (cur + 31n) / 32n;
  const newWords = (fresh + 31n) / 32n;
  const totalBefore = memTotalCost(curWords);
  const totalAfter = memTotalCost(newWords);
  return {
    currentBytes: cur.toString(), newBytes: fresh.toString(),
    currentWords: curWords.toString(), newWords: newWords.toString(),
    totalBefore: totalBefore.toString(), totalAfter: totalAfter.toString(),
    expansionGas: (newWords > curWords ? totalAfter - totalBefore : 0n).toString()
  };
}

/* CALL gas — what one CALL opcode costs the caller and what
   the callee actually receives, under the rules current
   mainnet applies (EIP-2929, EIP-150, EIP-161; all CC0,
   formulas paraphrased, cross-checked against go-ethereum's
   gasCall / callGas). The call's own cost (its base) is
   charged first, before any forwarding is calculated:
   - account access: 2,600 if the target address is cold
     (not yet accessed in this transaction), 100 if warm
     (EIP-2929);
   - 9,000 if the call carries value (value > 0);
   - 25,000 more if it carries value and the target account
     is empty — nonce 0, balance 0, no code (EIP-161's notion
     of empty; funding such an account creates it);
   - memory expansion (the function above) for the input and
     output regions: the frame must reach the larger of the
     two region ends, and a region of size 0 touches nothing
     whatever its offset.
   If the frame's available gas is below the base, the CALL
   itself runs out of gas and forwards nothing. Otherwise,
   of the remainder R, at most R - floor(R / 64) can be
   forwarded (EIP-150's all-but-one-64th rule, as the client
   computes it: R - R/64 with integer division), and the
   callee receives min(requested, that cap) plus — when the
   call carries value — a 2,300 stipend that is added for
   the callee and is NOT deducted from the caller. Gas the
   callee does not use returns to the caller afterwards;
   what is modelled here is the split at the moment of the
   call. Only CALL is modelled — CALLCODE, DELEGATECALL and
   STATICCALL share the access and forwarding rules but
   differ on the value terms — and a call the caller cannot
   fund (balance below the value) fails for a non-gas reason
   that is not modelled. Gas amounts are whole numbers; the
   value is a uint256 word in wei (decimal or 0x hex), of
   which only zero-vs-non-zero matters to the price. Memory
   sizes and offsets follow the memory function's bound: a
   region end above 0x1FFFFFFFE0 bytes is refused, as the
   client's gas calculation overflows there. */
function callParseGas(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (!/^\d+$/.test(s) || s.length > 78) return null;
  const v = BigInt(s);
  return v < (1n << 256n) ? v : null;
}
function callGasCalc(availableStr, requestedStr, valueStr, isCold, targetEmpty,
    curMemStr, inOffStr, inSizeStr, outOffStr, outSizeStr) {
  const available = callParseGas(availableStr);
  const requested = callParseGas(requestedStr);
  const value = sstoreParseWord(valueStr);
  const curMem = memParseBytes(curMemStr);
  if (available === null || requested === null || value === null || curMem === null ||
      typeof isCold !== "boolean" || typeof targetEmpty !== "boolean") return null;
  const inOff = memParseBytes(inOffStr), inSize = memParseBytes(inSizeStr);
  const outOff = memParseBytes(outOffStr), outSize = memParseBytes(outSizeStr);
  if (inOff === null || inSize === null || outOff === null || outSize === null) return null;
  const inEnd = inSize === 0n ? 0n : inOff + inSize;
  const outEnd = outSize === 0n ? 0n : outOff + outSize;
  if (inEnd > MEM_MAX_BYTES || outEnd > MEM_MAX_BYTES) return null;
  const newMem = inEnd > outEnd ? inEnd : outEnd;
  const accessGas = isCold ? 2600n : 100n;
  const transferGas = value > 0n ? 9000n : 0n;
  const newAccountGas = value > 0n && targetEmpty ? 25000n : 0n;
  const curWords = (curMem + 31n) / 32n;
  const newWords = (newMem + 31n) / 32n;
  const memoryGas = newWords > curWords ? memTotalCost(newWords) - memTotalCost(curWords) : 0n;
  const baseGas = accessGas + transferGas + newAccountGas + memoryGas;
  const zero = {
    accessGas: accessGas.toString(), transferGas: transferGas.toString(),
    newAccountGas: newAccountGas.toString(), memoryGas: memoryGas.toString(),
    baseGas: baseGas.toString(), newMemBytes: newMem.toString()
  };
  if (available < baseGas) {
    return { ...zero, outOfGas: true, remaining: "0", capGas: "0",
      forwardedGas: "0", stipend: "0", calleeGas: "0", callerRetained: "0" };
  }
  const remaining = available - baseGas;
  const capGas = remaining - remaining / 64n;
  const forwardedGas = requested < capGas ? requested : capGas;
  const stipend = value > 0n ? 2300n : 0n;
  return { ...zero, outOfGas: false, remaining: remaining.toString(),
    capGas: capGas.toString(), forwardedGas: forwardedGas.toString(),
    stipend: stipend.toString(), calleeGas: (forwardedGas + stipend).toString(),
    callerRetained: (remaining - forwardedGas).toString() };
}

/* CREATE / CREATE2 gas — what deploying a contract with one
   CREATE or CREATE2 opcode costs, under the rules current
   mainnet applies (EIP-3860, EIP-170, EIP-150; all CC0,
   formulas paraphrased, cross-checked against go-ethereum's
   gasCreateEip3860 / gasCreate2Eip3860 and its CreateGas,
   CreateDataGas and InitCodeWordGas parameters). The charges
   land in order:
   - an upfront cost, deducted before the initcode runs:
     32,000 for the operation itself; a per-word charge on the
     initcode of 2 per 32-byte word (EIP-3860's metering,
     charged for both opcodes), plus 6 more per word under
     CREATE2 for hashing the initcode into the new address;
     and memory expansion for the region of the creator's
     memory the initcode is read from — the frame must reach
     the region end, and a zero-size region touches nothing
     whatever its offset;
   - of the remainder R, the initcode receives
     R - floor(R / 64) under EIP-150's all-but-one-64th rule
     and the creator keeps the rest at the moment of creation
     (gas the initcode leaves unused returns afterwards);
     if the available gas is below the upfront cost the
     creation runs out of gas and nothing is forwarded;
   - after the initcode runs and returns the runtime code, a
     code deposit of 200 per deployed byte, charged on success
     from the gas then remaining (kept plus returned) — if
     that cannot pay it, the creation fails.
   Two size limits are validity rules that fail the creation
   outright: initcode above 49,152 bytes (EIP-3860's
   maximum, twice the code maximum) is refused by the
   client's gas calculation itself, and runtime code above
   24,576 bytes (EIP-170) can never be deposited. This is a
   creation by opcode inside a frame — a contract-creation
   transaction additionally folds the initcode into its
   intrinsic gas. The value a creation carries moves no gas
   term (unlike CALL there is no transfer or new-account
   charge here), the initcode's own execution — the opcodes
   it runs — is not modelled, and neither is a creation that
   fails because the target address is already occupied. Gas
   amounts are whole numbers below 2^256; sizes follow the
   memory function's bound: a region end above 0x1FFFFFFFE0
   bytes is refused, as the client's gas calculation
   overflows there. */
const CREATE_MAX_INITCODE = 49152n;
const CREATE_MAX_CODE = 24576n;
function createGasCalc(availableStr, opcode, initSizeStr, initOffStr, curMemStr, deployedStr) {
  const available = callParseGas(availableStr);
  const initSize = memParseBytes(initSizeStr);
  const initOff = memParseBytes(initOffStr);
  const curMem = memParseBytes(curMemStr);
  const deployed = memParseBytes(deployedStr);
  if (available === null || initSize === null || initOff === null || curMem === null ||
      deployed === null || (opcode !== "create" && opcode !== "create2")) return null;
  const regionEnd = initSize === 0n ? 0n : initOff + initSize;
  if (regionEnd > MEM_MAX_BYTES) return null;
  const initWords = (initSize + 31n) / 32n;
  const wordGas = initWords * (opcode === "create2" ? 8n : 2n);
  const curWords = (curMem + 31n) / 32n;
  const newWords = (regionEnd + 31n) / 32n;
  const memoryGas = newWords > curWords ? memTotalCost(newWords) - memTotalCost(curWords) : 0n;
  const upfrontGas = 32000n + wordGas + memoryGas;
  const base = {
    initcodeWords: initWords.toString(), wordGas: wordGas.toString(),
    memoryGas: memoryGas.toString(), upfrontGas: upfrontGas.toString(),
    newMemBytes: regionEnd.toString()
  };
  if (initSize > CREATE_MAX_INITCODE) {
    return { ...base, initcodeTooLarge: true, outOfGas: false, remaining: "0",
      forwardedGas: "0", creatorRetained: "0", codeTooLarge: false,
      depositGas: "0", fixedGas: "0" };
  }
  const codeTooLarge = deployed > CREATE_MAX_CODE;
  const depositGas = codeTooLarge ? 0n : 200n * deployed;
  const fixedGas = upfrontGas + depositGas;
  if (available < upfrontGas) {
    return { ...base, initcodeTooLarge: false, outOfGas: true, remaining: "0",
      forwardedGas: "0", creatorRetained: "0", codeTooLarge,
      depositGas: depositGas.toString(), fixedGas: fixedGas.toString() };
  }
  const remaining = available - upfrontGas;
  const forwardedGas = remaining - remaining / 64n;
  return { ...base, initcodeTooLarge: false, outOfGas: false,
    remaining: remaining.toString(), forwardedGas: forwardedGas.toString(),
    creatorRetained: (remaining - forwardedGas).toString(), codeTooLarge,
    depositGas: depositGas.toString(), fixedGas: fixedGas.toString() };
}

/* LOG0-LOG4 gas — what emitting one event log costs, under the
   Yellow Paper's log-cost terms as go-ethereum's gasLog and its
   LogGas / LogTopicGas / LogGasBytes parameters implement them
   (formulas paraphrased): a flat 375 for the operation itself,
   375 per topic (the opcode's number, 0 to 4, is its topic
   count — LOG3 is what an ERC-20 Transfer emits: the signature
   topic plus the two indexed addresses), 8 per byte of log data,
   and memory expansion for the region of the frame's memory the
   data is read from — the frame must reach the region end, and
   a zero-size region touches nothing whatever its offset. The
   topic values and the data's contents move no term; only the
   counts and sizes are priced. Gas amounts follow the memory
   function's bound: a region end above 0x1FFFFFFFE0 bytes is
   refused, as the client's gas calculation overflows there. */
function logGasCalc(topicsStr, dataOffStr, dataSizeStr, curMemStr) {
  if (typeof topicsStr !== "string" || !/^[0-4]$/.test(topicsStr.trim())) return null;
  const topics = BigInt(topicsStr.trim());
  const dataOff = memParseBytes(dataOffStr);
  const dataSize = memParseBytes(dataSizeStr);
  const curMem = memParseBytes(curMemStr);
  if (dataOff === null || dataSize === null || curMem === null) return null;
  const regionEnd = dataSize === 0n ? 0n : dataOff + dataSize;
  if (regionEnd > MEM_MAX_BYTES) return null;
  const curWords = (curMem + 31n) / 32n;
  const newWords = (regionEnd + 31n) / 32n;
  const memoryGas = newWords > curWords ? memTotalCost(newWords) - memTotalCost(curWords) : 0n;
  const baseGas = 375n;
  const topicGas = 375n * topics;
  const dataGas = 8n * dataSize;
  return {
    topics: topics.toString(), baseGas: baseGas.toString(),
    topicGas: topicGas.toString(), dataGas: dataGas.toString(),
    memoryGas: memoryGas.toString(),
    totalGas: (baseGas + topicGas + dataGas + memoryGas).toString(),
    newMemBytes: regionEnd.toString()
  };
}

/* SHA3 (KECCAK256) gas — what hashing a region of memory with
   the SHA3 opcode costs, under the Yellow Paper's hash-cost
   terms as go-ethereum's gasSha3 and its Sha3Gas / Sha3WordGas
   parameters implement them (formulas paraphrased): a flat 30
   for the operation itself, 6 per 32-byte word of the hashed
   region (the size rounds up to whole words — 1 byte pays for
   a word, as does 32), and memory expansion for the region of
   the frame's memory the data is read from — the frame must
   reach the region end, and a zero-size region touches nothing
   whatever its offset. The data's contents move no term; only
   its size and position are priced. This prices the gas only —
   the hash itself is computed by the hub's Keccak tools, not
   here. Gas amounts follow the memory function's bound: a
   region end above 0x1FFFFFFFE0 bytes is refused, as the
   client's gas calculation overflows there. */
function sha3GasCalc(dataOffStr, dataSizeStr, curMemStr) {
  const dataOff = memParseBytes(dataOffStr);
  const dataSize = memParseBytes(dataSizeStr);
  const curMem = memParseBytes(curMemStr);
  if (dataOff === null || dataSize === null || curMem === null) return null;
  const regionEnd = dataSize === 0n ? 0n : dataOff + dataSize;
  if (regionEnd > MEM_MAX_BYTES) return null;
  const curWords = (curMem + 31n) / 32n;
  const newWords = (regionEnd + 31n) / 32n;
  const memoryGas = newWords > curWords ? memTotalCost(newWords) - memTotalCost(curWords) : 0n;
  const words = (dataSize + 31n) / 32n;
  const baseGas = 30n;
  const wordGas = 6n * words;
  return {
    baseGas: baseGas.toString(), words: words.toString(),
    wordGas: wordGas.toString(), memoryGas: memoryGas.toString(),
    totalGas: (baseGas + wordGas + memoryGas).toString(),
    newMemBytes: regionEnd.toString()
  };
}

/* COPY gas (CALLDATACOPY / CODECOPY / RETURNDATACOPY) — what
   copying a region into memory with one of the three plain copy
   opcodes costs, under the Yellow Paper's copy-cost group as
   go-ethereum's copy-gas functions implement it (formulas
   paraphrased): a flat 3 for the operation itself, 3 per 32-byte
   word copied (the size rounds up to whole words — 1 byte pays
   for a word, as does 32), and memory expansion for the region
   of the frame's memory the data is written TO — the frame must
   reach the destination end, and a zero-size copy touches
   nothing whatever its destination offset. The three opcodes
   price identically; they differ only in the source (the call's
   input data, the running contract's code, or the last call's
   return data), and the source is not memory, so the source
   offset moves no term — only the destination, the size and the
   frame's current memory are priced, and the data's contents
   move no term. EXTCODECOPY is NOT one of these: copying another
   account's code additionally pays that account's access cost
   under EIP-2929, so it is out of scope rather than priced here.
   Gas amounts follow the memory function's bound: a destination
   end above 0x1FFFFFFFE0 bytes is refused, as the client's gas
   calculation overflows there. */
function copyGasCalc(opcodeStr, destOffStr, sizeStr, curMemStr) {
  if (typeof opcodeStr !== "string") return null;
  const opcode = opcodeStr.trim();
  if (!["CALLDATACOPY", "CODECOPY", "RETURNDATACOPY"].includes(opcode)) return null;
  const destOff = memParseBytes(destOffStr);
  const size = memParseBytes(sizeStr);
  const curMem = memParseBytes(curMemStr);
  if (destOff === null || size === null || curMem === null) return null;
  const regionEnd = size === 0n ? 0n : destOff + size;
  if (regionEnd > MEM_MAX_BYTES) return null;
  const curWords = (curMem + 31n) / 32n;
  const newWords = (regionEnd + 31n) / 32n;
  const memoryGas = newWords > curWords ? memTotalCost(newWords) - memTotalCost(curWords) : 0n;
  const words = (size + 31n) / 32n;
  const baseGas = 3n;
  const wordGas = 3n * words;
  return {
    opcode, baseGas: baseGas.toString(), words: words.toString(),
    wordGas: wordGas.toString(), memoryGas: memoryGas.toString(),
    totalGas: (baseGas + wordGas + memoryGas).toString(),
    newMemBytes: regionEnd.toString()
  };
}

/* MCOPY gas (EIP-5656) — what copying a region of memory to
   another region of the SAME memory with the MCOPY opcode
   (0x5e, live since Cancun) costs, under EIP-5656 (CC0;
   formula paraphrased, cross-checked against a client
   implementation's structure this run): a flat 3 for the
   operation itself, 3 per 32-byte word copied (the size rounds
   up to whole words), and memory expansion — but, unlike the
   three plain copies above, BOTH regions are memory, so the
   frame must reach the LARGER of the source end and the
   destination end: expansion is priced on max(dst, src) +
   size, not on the destination alone. That is the one pricing
   difference from CALLDATACOPY / CODECOPY / RETURNDATACOPY,
   whose sources are not memory; when src <= dst the two
   formulas agree exactly. The copy behaves as if through an
   intermediate buffer (memmove semantics), so overlapping
   regions copy correctly — overlap moves no term, nor do the
   data's contents. A zero-size copy touches no memory
   whatever its offsets, and still pays the flat 3. Gas
   amounts follow the memory function's bound: a region end
   above 0x1FFFFFFFE0 bytes is refused, as the client's gas
   calculation overflows there. */
function mcopyGasCalc(dstStr, srcStr, sizeStr, curMemStr) {
  const dst = memParseBytes(dstStr);
  const src = memParseBytes(srcStr);
  const size = memParseBytes(sizeStr);
  const curMem = memParseBytes(curMemStr);
  if (dst === null || src === null || size === null || curMem === null) return null;
  const regionEnd = size === 0n ? 0n : (dst > src ? dst : src) + size;
  if (regionEnd > MEM_MAX_BYTES) return null;
  const curWords = (curMem + 31n) / 32n;
  const newWords = (regionEnd + 31n) / 32n;
  const memoryGas = newWords > curWords ? memTotalCost(newWords) - memTotalCost(curWords) : 0n;
  const words = (size + 31n) / 32n;
  const baseGas = 3n;
  const wordGas = 3n * words;
  return {
    baseGas: baseGas.toString(), words: words.toString(),
    wordGas: wordGas.toString(), memoryGas: memoryGas.toString(),
    totalGas: (baseGas + wordGas + memoryGas).toString(),
    newMemBytes: regionEnd.toString()
  };
}

/* EXTCODECOPY gas — what copying another account's code into
   memory costs, under EIP-2929 (CC0) combined with the Yellow
   Paper's copy-cost group, as go-ethereum's EXTCODECOPY gas
   function implements it and evm.codes publishes it (formulas
   paraphrased; constants cross-verified this run across two
   independent secondary sources: the evm.codes opcode page's
   dynamic-cost formula and EIP-2929's own account-access
   listing, which names EXTCODECOPY among the opcodes charged
   2,600 cold / 100 warm). Unlike the three plain copies above
   there is NO flat base for this opcode (its static cost is
   0): the total is the target account's access cost — 2,600
   if the address is cold (first touched in this transaction),
   100 if warm — plus 3 per 32-byte word copied (the size
   rounds up to whole words), plus memory expansion for the
   region of the frame's memory the code is written TO (the
   frame must reach the destination end; a zero-size copy
   touches no memory whatever its destination offset, but the
   access cost is still charged — the account is touched even
   when nothing is copied). The source offset inside the
   target's code moves no term, nor do the code's contents;
   copying past the end of the target's code zero-pads and
   prices by the size requested, not the code's length.
   Warmth, sizes and memory are user-supplied values, not
   execution state read here. Gas amounts follow the memory
   function's bound: a destination end above 0x1FFFFFFFE0
   bytes is refused, as the client's gas calculation
   overflows there. */
function extCodeCopyGasCalc(isCold, destOffStr, sizeStr, curMemStr) {
  if (typeof isCold !== "boolean") return null;
  const destOff = memParseBytes(destOffStr);
  const size = memParseBytes(sizeStr);
  const curMem = memParseBytes(curMemStr);
  if (destOff === null || size === null || curMem === null) return null;
  const regionEnd = size === 0n ? 0n : destOff + size;
  if (regionEnd > MEM_MAX_BYTES) return null;
  const curWords = (curMem + 31n) / 32n;
  const newWords = (regionEnd + 31n) / 32n;
  const memoryGas = newWords > curWords ? memTotalCost(newWords) - memTotalCost(curWords) : 0n;
  const words = (size + 31n) / 32n;
  const accessGas = isCold ? 2600n : 100n;
  const wordGas = 3n * words;
  return {
    accessGas: accessGas.toString(), words: words.toString(),
    wordGas: wordGas.toString(), memoryGas: memoryGas.toString(),
    totalGas: (accessGas + wordGas + memoryGas).toString(),
    newMemBytes: regionEnd.toString()
  };
}

/* Account-access gas — BALANCE / EXTCODESIZE / EXTCODEHASH.
   These three opcodes each read one fact about another account
   (its balance, its code length, its code hash), and under
   EIP-2929 (CC0; formula paraphrased, constants cross-verified
   this run against a second independent gas-costs table listing
   all three at the same prices) the access charge is the WHOLE
   cost: 2,600 (COLD_ACCOUNT_ACCESS_COST) if the address is not
   yet in the transaction's accessed_addresses set, 100
   (WARM_STORAGE_READ_COST) if it is — and a cold access adds
   the address to the set, so later touches in the same
   transaction are warm. There is no other term: the result is
   a single stack word, never written to memory, so no memory
   expansion applies, and the balance, code size or code hash
   returned move no term (EXTCODEHASH of an empty or
   non-existent account returns 0 at the same price). Some
   addresses start warm — the sender, the transaction's
   destination (or the address being created), the precompiles,
   any address named in an EIP-2930 access list, and, since
   Shanghai (EIP-3651), the coinbase — but warmth is a
   user-supplied value here, not execution state read here.
   Deliberate contrast: a cold storage SLOT (SLOAD) costs
   2,100, not 2,600 — an account is not a slot. */
function accountAccessGasCalc(opcode, isCold) {
  if (!["BALANCE", "EXTCODESIZE", "EXTCODEHASH"].includes(opcode)) return null;
  if (typeof isCold !== "boolean") return null;
  const accessGas = isCold ? 2600n : 100n;
  return {
    opcode, accessGas: accessGas.toString(),
    totalGas: accessGas.toString()
  };
}

/* SLOAD gas. SLOAD reads one 32-byte slot of the executing
   contract's OWN storage, and under EIP-2929 (CC0; formula
   paraphrased, constants cross-verified this run against a
   second independent gas-cost reference listing SLOAD at the
   same prices) the access charge is again the WHOLE cost:
   2,100 (COLD_SLOAD_COST) if the (address, storage_key) pair
   -- where address is the contract whose storage is read --
   is not yet in the transaction's accessed_storage_keys set,
   100 (WARM_STORAGE_READ_COST) if it is; a cold read adds the
   pair, so later reads of the same slot in the same
   transaction are warm, and an SSTORE to the slot warms it
   too (SSTORE's cold surcharge is this same constant). Warmth
   is keyed by the PAIR, not the slot number alone: the same
   slot number in a different contract is a separate cold
   access. A pair named in an EIP-2930 access list starts
   warm. There is no other term: the value read is a single
   stack word, never written to memory, so no memory expansion
   applies, and the value stored moves no term (an untouched
   slot reads as 0 at the same price). Deliberate contrasts: a
   cold ACCOUNT access costs 2,600, not 2,100 -- an account is
   not a slot -- and transient storage (TLOAD, EIP-1153) is a
   flat 100 with no cold price at all. Before Berlin, SLOAD
   was a flat 800. Warmth is a user-supplied value here, not
   execution state read here. */
function sloadGasCalc(isCold) {
  if (typeof isCold !== "boolean") return null;
  const accessGas = isCold ? 2100n : 100n;
  return {
    accessGas: accessGas.toString(),
    totalGas: accessGas.toString()
  };
}

/* Transient storage gas -- TLOAD / TSTORE (EIP-1153).
   Cancun's transient storage is a per-contract word store
   that lives only for one transaction: TLOAD (0x5c) reads
   one 32-byte word of the executing contract's own transient
   storage and TSTORE (0x5d) writes one, with the same stack
   arguments and addressing as SLOAD / SSTORE. Under EIP-1153
   (Final, CC0; rules paraphrased, constants cross-verified
   this run against independent gas-cost references listing
   both opcodes at exactly 100) each costs a flat 100 --
   TLOAD priced as a warm SLOAD, TSTORE as a warm SSTORE of
   an already-changed slot -- with NO cold price at all:
   transient storage never touches disk or EIP-2929's
   accessed sets, so a slot's first touch in the transaction
   costs the same 100 as every later touch, an EIP-2930
   access list cannot pre-warm it, and no refund is ever
   earned (the store is discarded at the transaction's end
   anyway; a frame's revert does undo that frame's transient
   writes, as with persistent storage). There is no other
   term: the value moved is a single stack word, never
   written to memory, so no memory expansion applies, and
   the value stored or read moves no term (an untouched
   transient slot reads as 0 at the same price). TSTORE is
   also exempt from SSTORE's EIP-2200 stipend guard, and a
   TSTORE inside a static call fails for a non-gas reason
   not modelled here (TLOAD is allowed there). Deliberate
   contrasts: a cold SLOAD costs 2,100 (exactly 2,000 more),
   a warm SLOAD agrees at 100, and an SSTORE can cost up to
   20,000 plus the 2,100 cold surcharge with refund-counter
   adjustments -- none of which exists here. Caution applied
   while verifying: stale pre-Final drafts priced these
   opcodes at 8 under different opcode numbers; the Final
   text governs. */
function transientGasCalc(opcode) {
  if (!["TLOAD", "TSTORE"].includes(opcode)) return null;
  return {
    opcode, gas: "100",
    totalGas: "100"
  };
}

/* Other CALL opcodes gas -- CALLCODE / DELEGATECALL /
   STATICCALL (EIP-2929, EIP-150). The CALL calculator above
   deliberately excluded these three: they share CALL's
   access, memory-expansion and all-but-one-64th forwarding
   rules but differ on the value terms, and the differences
   are the whole content here (rules paraphrased from
   go-ethereum's gas functions for these opcodes, cross-
   verified this run against an independent CALL-family
   analysis: CALLCODE is "same as CALL but without new
   account creation", DELEGATECALL has "no value transfer
   costs", STATICCALL is "same as DELEGATECALL", and the
   2,300 stipend is added for CALL or CALLCODE when the
   transferred value is non-zero).
   - Access: the code address costs 2,600 cold / 100 warm
     (EIP-2929), exactly as for CALL.
   - Memory expansion for the input and output regions
     together, exactly as for CALL (the frame must reach the
     larger region end; a zero-size region touches nothing).
   - CALLCODE (0xf2) HAS a value argument, but the value is
     taken from the executing contract's own balance and
     credited to the executing contract's own account -- the
     child frame runs the target's code in the caller's
     context -- so a non-zero value pays the 9,000 transfer
     charge and earns the child the 2,300 stipend exactly as
     CALL does, while the 25,000 new-account charge can
     NEVER apply: the recipient is the caller's own account,
     which necessarily already exists. There is deliberately
     no target-state input for this opcode.
   - DELEGATECALL (0xf4) has NO value argument at all: the
     child runs the target's code in the caller's context
     and inherits the caller's sender and apparent value, no
     balance moves, so no transfer charge, no new-account
     charge and no stipend. The value string is not parsed.
   - STATICCALL (0xfa) likewise has NO value argument: the
     child runs with its value forced to zero in a static
     context, so it prices exactly as DELEGATECALL does.
   Forwarding then follows EIP-150 exactly as for CALL: of
   the remainder R after the opcode's own costs at most
   R - floor(R / 64) can be forwarded, the callee receives
   min(requested, cap) plus any stipend (the stipend is
   added for the callee and not deducted from the caller),
   and if the frame's gas does not cover the own costs the
   opcode runs out of gas and forwards nothing. Honest
   scope: a call the caller cannot fund, a value-bearing
   CALLCODE attempted inside a static context, and a
   STATICCALL child attempting a state change all fail for
   non-gas reasons not modelled here; warmth and memory are
   user-supplied values, not execution state read here. */
function otherCallGasCalc(opcode, availableStr, requestedStr, valueStr, isCold,
    curMemStr, inOffStr, inSizeStr, outOffStr, outSizeStr) {
  if (!["CALLCODE", "DELEGATECALL", "STATICCALL"].includes(opcode)) return null;
  if (typeof isCold !== "boolean") return null;
  const available = callParseGas(availableStr);
  const requested = callParseGas(requestedStr);
  const curMem = memParseBytes(curMemStr);
  if (available === null || requested === null || curMem === null) return null;
  let value = 0n;
  if (opcode === "CALLCODE") {
    value = sstoreParseWord(valueStr);
    if (value === null) return null;
  }
  const inOff = memParseBytes(inOffStr), inSize = memParseBytes(inSizeStr);
  const outOff = memParseBytes(outOffStr), outSize = memParseBytes(outSizeStr);
  if (inOff === null || inSize === null || outOff === null || outSize === null) return null;
  const inEnd = inSize === 0n ? 0n : inOff + inSize;
  const outEnd = outSize === 0n ? 0n : outOff + outSize;
  if (inEnd > MEM_MAX_BYTES || outEnd > MEM_MAX_BYTES) return null;
  const newMem = inEnd > outEnd ? inEnd : outEnd;
  const accessGas = isCold ? 2600n : 100n;
  const transferGas = value > 0n ? 9000n : 0n;
  const newAccountGas = 0n;
  const curWords = (curMem + 31n) / 32n;
  const newWords = (newMem + 31n) / 32n;
  const memoryGas = newWords > curWords ? memTotalCost(newWords) - memTotalCost(curWords) : 0n;
  const baseGas = accessGas + transferGas + newAccountGas + memoryGas;
  const zero = {
    opcode, accessGas: accessGas.toString(), transferGas: transferGas.toString(),
    newAccountGas: newAccountGas.toString(), memoryGas: memoryGas.toString(),
    baseGas: baseGas.toString(), newMemBytes: newMem.toString()
  };
  if (available < baseGas) {
    return { ...zero, outOfGas: true, remaining: "0", capGas: "0",
      forwardedGas: "0", stipend: "0", calleeGas: "0", callerRetained: "0" };
  }
  const remaining = available - baseGas;
  const capGas = remaining - remaining / 64n;
  const forwardedGas = requested < capGas ? requested : capGas;
  const stipend = value > 0n ? 2300n : 0n;
  return { ...zero, outOfGas: false, remaining: remaining.toString(),
    capGas: capGas.toString(), forwardedGas: forwardedGas.toString(),
    stipend: stipend.toString(), calleeGas: (forwardedGas + stipend).toString(),
    callerRetained: (remaining - forwardedGas).toString() };
}

/* SELFDESTRUCT gas (EIP-2929 / EIP-3529 / EIP-6780). The
   one termination opcode, priced under the rules current
   mainnet applies (formulas paraphrased; constants
   cross-verified this run across two independent sources:
   a gas reference's SELFDESTRUCT entry -- static 5,000,
   +25,000 for a positive balance sent to an empty account,
   +2,600 if the address is cold -- and an independent chain
   specification stating a zero-balance SELFDESTRUCT creates
   no account and incurs no account-creation charge while a
   non-zero transfer to a non-existent target does).
   - Base: 5,000 for the opcode itself.
   - Access (EIP-2929): the beneficiary is an account access
     like the account-access tool's, but here it is an
     ADDITIONAL term on top of the 5,000, not the whole
     cost: +2,600 if the beneficiary is cold (not yet
     touched in this transaction), +0 if warm -- there is
     no 100 warm price, because the 5,000 is not a warm
     read cost. A cold access warms the beneficiary.
   - New-account charge: +25,000 only when BOTH hold --
     the beneficiary account is empty (balance 0, nonce 0,
     no code, so it does not meaningfully exist) AND the
     balance transferred is positive. SELFDESTRUCT sends
     the contract's WHOLE balance, so that balance is the
     amount; only its zero-vs-non-zero matters, never its
     size. A zero balance creates no account and pays no
     charge; an existing beneficiary never pays it.
   - Refund: 0, always. The old 24,000 refund for
     destroying a contract was removed by EIP-3529
     (London); nothing here earns one.
   There is no memory term: the beneficiary is a single
   stack word, memory is never touched, and nothing is
   forwarded (the opcode ends the frame). Deliberate
   contrasts: destructing to the contract ITSELF is the
   warm, existing case (5,000 -- its own address is the
   frame's, already accessed, and it exists), and a CALL
   carrying value to an empty target pays the same 25,000
   but on top of a 9,000 transfer charge this opcode does
   not have. EIP-6780 (Cancun) changed what the opcode
   DOES -- code and storage are deleted only when the
   contract was created in the same transaction, otherwise
   only the balance moves (and a self-beneficiary burns it
   when created in the same transaction, no-ops otherwise)
   -- but it changed no gas term here. Honest scope: this
   prices the one opcode only; warmth, emptiness and
   balance are user-supplied values, not execution state
   read here, and a SELFDESTRUCT inside a static call fails
   for a non-gas reason not modelled. */
function selfdestructGasCalc(isCold, beneficiaryEmpty, balanceStr) {
  if (typeof isCold !== "boolean" || typeof beneficiaryEmpty !== "boolean") return null;
  const balance = sstoreParseWord(balanceStr);
  if (balance === null) return null;
  const baseGas = 5000n;
  const accessGas = isCold ? 2600n : 0n;
  const newAccountGas = beneficiaryEmpty && balance > 0n ? 25000n : 0n;
  return {
    baseGas: baseGas.toString(), accessGas: accessGas.toString(),
    newAccountGas: newAccountGas.toString(), refund: "0",
    totalGas: (baseGas + accessGas + newAccountGas).toString()
  };
}

/* Original precompile gas — ecrecover / SHA-256 / RIPEMD-160 /
   identity, the four precompiled contracts at addresses 0x01 to
   0x04 that have existed since Frontier. Their pricing, from the
   Yellow Paper's precompile definitions as go-ethereum's
   precompile gas functions implement it (formulas paraphrased;
   constants cross-verified across two independent sources: the
   Yellow Paper's own values and independent gas tables listing
   all four at exactly these prices):
     - a flat base, plus — for three of the four — a per-word
       charge on the input length rounded UP to whole 32-byte
       words: words = ceil(len / 32), so a 0-length input is
       0 words and pays the base alone, 1 byte pays for a full
       word just as 32 does, and 33 bytes pays for two;
     - ecrecover (0x01): 3,000 flat, NO per-word term — the
       input length moves nothing. Its defined input is four
       32-byte fields (hash, v, r, s); a short input is read as
       zero-padded and extra bytes are ignored, and the charge
       is 3,000 at any length, including 0. (A failed recovery
       returns empty output; the charge is the same.)
     - SHA-256 (0x02): 60 + 12 per word.
     - RIPEMD-160 (0x03): 600 + 120 per word — base and per-word
       are each exactly 10x SHA-256's.
     - identity (0x04): 15 + 3 per word; it copies its input to
       its output unchanged.
   There is no EIP-2929 access term: the precompiles start warm
   (they are in every transaction's accessed-addresses set from
   the start), so no cold surcharge is ever added. This prices
   the precompile's OWN charge only: the CALL or STATICCALL
   that invokes it charges its own terms separately (the CALL
   calculator above — access, memory expansion for the input
   and output regions, forwarding), and those are not included
   here. The input's CONTENTS move no term — only its length.
   Deliberate contrasts: the ModExp precompile (0x05) has its
   own calculator above (its price depends on the operand
   lengths and the exponent's head, not the input length
   alone), and the SHA3 OPCODE (30 + 6 per word, plus memory
   expansion) is a different thing from the SHA-256 PRECOMPILE
   priced here (60 + 12 per word, no memory term) — Ethereum
   has no Keccak precompile; contracts hash with the opcode.
   The input length is a byte count in decimal, bounded like
   the memory tools' sizes (an input lives in the caller's
   memory, whose size the client's gas calculation bounds);
   anything else is refused. */
const PRECOMPILE_GAS_TABLE = {
  ecrecover: { address: "0x0000000000000000000000000000000000000001", base: 3000n, perWord: 0n },
  sha256: { address: "0x0000000000000000000000000000000000000002", base: 60n, perWord: 12n },
  ripemd160: { address: "0x0000000000000000000000000000000000000003", base: 600n, perWord: 120n },
  identity: { address: "0x0000000000000000000000000000000000000004", base: 15n, perWord: 3n }
};
function precompileGasCalc(nameStr, inputLenStr) {
  if (typeof nameStr !== "string") return null;
  const entry = PRECOMPILE_GAS_TABLE[nameStr.trim()];
  if (!entry) return null;
  const len = memParseBytes(inputLenStr);
  if (len === null) return null;
  const words = (len + 31n) / 32n;
  const wordGas = entry.perWord * words;
  return {
    precompile: nameStr.trim(), address: entry.address,
    baseGas: entry.base.toString(), perWordGas: entry.perWord.toString(),
    words: words.toString(), wordGas: wordGas.toString(),
    totalGas: (entry.base + wordGas).toString()
  };
}

/* ---------- Original precompiles applied (SHA-256 / RIPEMD-160 / identity) ----------
   The applied counterpart of the gas calculator above for the
   three of the original four whose work is a plain hash or a
   copy: that tool prices SHA-256 (0x02), RIPEMD-160 (0x03) and
   identity (0x04) from the input LENGTH alone and never reads
   the contents — this one takes the input bytes and runs them.
   (The fourth, ecrecover at 0x01, is applied by the signature
   recovery tools further down; ModExp at 0x05 likewise has its
   own applied calculator above.) The outputs are the
   precompiles' own return data, framed exactly as a client
   returns them:
     - SHA-256: the 32-byte FIPS 180-4 digest, computed by the
       hub's existing sha256Bytes (the same code the blob
       versioned-hash tool uses).
     - RIPEMD-160: the 20-byte digest placed in the LOW 20 bytes
       of a 32-byte word — 12 leading zero bytes, then the hash.
       Returning the bare 20 bytes instead is the trap of this
       family: go-ethereum's ripemd160 precompile left-pads to
       32, and callers read a full word. The hash itself is
       computed here from the specification (Dobbertin,
       Bosselaers, Preneel): two parallel lines of 80 steps over
       64-byte blocks, little-endian words throughout — unlike
       SHA-256's big-endian words, so the two digests of the
       same input share nothing but the block size.
     - identity: the input bytes unchanged, so the output is
       exactly as long as the input (empty in, empty out).
   None of the three can fail on contents: every byte string is
   a valid input, and an empty input hashes to the well-known
   empty digest under both hashes. The price is the hub's own
   precompileGasCalc fed the input's true length, cross-checked
   against it exactly in tests on every row — base plus per-word
   on the length rounded up to whole 32-byte words, so the
   applied tool and the gas tool can never disagree about a
   call's price. Input to THIS page is hex bytes (0x prefix
   optional, empty allowed) capped at 4,096 bytes as a stated
   page computation cap — the precompiles themselves accept any
   length a caller's gas can pay for, and the gas tool above
   still prices lengths beyond the cap; malformed hex is
   refused, as the other calculators refuse unparseable input.
   Verified against an independent pure-Python oracle
   (oracle-orig-precompile.py): its from-specification
   RIPEMD-160 was anchored in-script BEFORE emitting on the
   published RIPEMD-160 test suite (all nine vectors, including
   1,000,000 x 'a') and on OpenSSL's digest, agreeing with both
   on 143 inputs, and its SHA-256 on the FIPS 180-4 examples —
   11 input rows x 3 precompiles emitted, every output and
   price reproduced here in tests. Computes locally; no chain
   is queried. */
const ORIG_APPLIED_MAX_BYTES = 4096;
const RMD_RL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
  4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13];
const RMD_RR = [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
  6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
  8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
  12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11];
const RMD_SL = [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
  9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6];
const RMD_SR = [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
  9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
  15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
  8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11];
const RMD_KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
const RMD_KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];
function rmdRol(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }
function rmdF(j, x, y, z) {
  if (j < 16) return (x ^ y ^ z) >>> 0;
  if (j < 32) return ((x & y) | (~x & z)) >>> 0;
  if (j < 48) return ((x | ~y) ^ z) >>> 0;
  if (j < 64) return ((x & z) | (y & ~z)) >>> 0;
  return (x ^ (y | ~z)) >>> 0;
}
function ripemd160Bytes(inputBytes) {
  const bytes = Array.from(inputBytes);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 8; i++) bytes.push(Math.floor(bitLen / 2 ** (8 * i)) % 256);
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  for (let off = 0; off < bytes.length; off += 64) {
    const X = [];
    for (let t = 0; t < 16; t++) {
      X.push((bytes[off + 4 * t] | (bytes[off + 4 * t + 1] << 8) |
              (bytes[off + 4 * t + 2] << 16) | (bytes[off + 4 * t + 3] << 24)) >>> 0);
    }
    let al = h[0], bl = h[1], cl = h[2], dl = h[3], el = h[4];
    let ar = h[0], br = h[1], cr = h[2], dr = h[3], er = h[4];
    for (let j = 0; j < 80; j++) {
      const tl = (rmdRol((al + rmdF(j, bl, cl, dl) + X[RMD_RL[j]] + RMD_KL[j >> 4]) >>> 0, RMD_SL[j]) + el) >>> 0;
      al = el; el = dl; dl = rmdRol(cl, 10); cl = bl; bl = tl;
      const tr = (rmdRol((ar + rmdF(79 - j, br, cr, dr) + X[RMD_RR[j]] + RMD_KR[j >> 4]) >>> 0, RMD_SR[j]) + er) >>> 0;
      ar = er; er = dr; dr = rmdRol(cr, 10); cr = br; br = tr;
    }
    const t = (h[1] + cl + dr) >>> 0;
    h[1] = (h[2] + dl + er) >>> 0;
    h[2] = (h[3] + el + ar) >>> 0;
    h[3] = (h[4] + al + br) >>> 0;
    h[4] = (h[0] + bl + cr) >>> 0;
    h[0] = t;
  }
  const out = [];
  for (const x of h) out.push(x & 255, (x >>> 8) & 255, (x >>> 16) & 255, (x >>> 24) & 255);
  return out;
}
function origPrecompileCalc(nameStr, inputHex) {
  if (typeof nameStr !== "string") return null;
  const name = nameStr.trim();
  if (name !== "sha256" && name !== "ripemd160" && name !== "identity") return null;
  const bytes = parseHexBytes(inputHex);
  if (bytes === null || bytes.length > ORIG_APPLIED_MAX_BYTES) return null;
  const priced = precompileGasCalc(name, String(bytes.length));
  if (priced === null) return null;
  let outBytes;
  if (name === "sha256") outBytes = sha256Bytes(bytes);
  else if (name === "ripemd160") outBytes = [...new Array(12).fill(0), ...ripemd160Bytes(bytes)];
  else outBytes = bytes;
  return {
    precompile: name, address: priced.address,
    inputBytes: String(bytes.length), input: "0x" + bytesToHex(bytes),
    output: "0x" + bytesToHex(outBytes), outputBytes: String(outBytes.length),
    words: priced.words, baseGas: priced.baseGas, perWordGas: priced.perWordGas,
    wordGas: priced.wordGas, totalGas: priced.totalGas
  };
}

/* alt_bn128 (BN254) precompile gas — what the three elliptic-
   curve precompiles added for the Byzantium fork charge, at the
   prices current mainnet applies. EIP-196 defined ecAdd (0x06)
   and ecMul (0x07), EIP-197 the pairing check (0x08); EIP-1108
   repriced all three at Istanbul (both EIP-196/197 and EIP-1108
   are CC0; the schedule is restated here in my own words, and
   the constants were cross-verified across two independent
   sources this run):
     - ecAdd: a flat 150, whatever the points. Its defined input
       is two G1 points, 128 bytes; a short input is read as
       zero-padded and extra bytes are ignored, so no input term
       exists to price.
     - ecMul: a flat 6,000 — exactly 40x ecAdd. Its defined
       input is a G1 point and a scalar, 96 bytes, read the
       same way.
     - pairing: 45,000 plus 34,000 per pair, a pair being one
       192-byte element of the input (a G1 point's 64 bytes and
       a G2 point's 128 bytes). An empty input is 0 pairs and
       pays the 45,000 base alone — the empty product is the
       pairing identity, so that call succeeds and returns
       true. An input whose length is not a multiple of 192
       fails for a non-gas reason and is not modelled; the
       calculator takes the pair count directly.
   Before Istanbul the prices were far higher — ecAdd 500,
   ecMul 40,000, pairing 100,000 plus 80,000 per pair — and
   those superseded prices are not offered here.
   There is no EIP-2929 access term: like the original four,
   these precompiles start warm. This prices the precompile's
   OWN charge only: the CALL or STATICCALL that invokes it
   charges its own terms separately (the CALL calculator
   above). The points' and pairs' CONTENTS move no term — only
   the pair count, for the pairing check. The pair count is a
   decimal count bounded so the implied input (192 bytes per
   pair) fits the same size bound the memory tools use; for
   ecAdd and ecMul the pair-count argument is not even parsed,
   exactly as their pricing never reads it. A point that is
   not on the curve, or a pairing element outside its subgroup,
   fails for a non-gas reason and is not modelled. */
const BN128_GAS_TABLE = {
  ecadd: { address: "0x0000000000000000000000000000000000000006", base: 150n, perPair: 0n, inputBytes: 128n },
  ecmul: { address: "0x0000000000000000000000000000000000000007", base: 6000n, perPair: 0n, inputBytes: 96n },
  pairing: { address: "0x0000000000000000000000000000000000000008", base: 45000n, perPair: 34000n, inputBytes: null }
};
function bn128GasCalc(nameStr, pairsStr) {
  if (typeof nameStr !== "string") return null;
  const entry = BN128_GAS_TABLE[nameStr.trim()];
  if (!entry) return null;
  if (entry.perPair === 0n) {
    return {
      precompile: nameStr.trim(), address: entry.address,
      baseGas: entry.base.toString(), perPairGas: "0",
      pairs: "0", pairGas: "0", inputBytes: entry.inputBytes.toString(),
      totalGas: entry.base.toString()
    };
  }
  const pairs = memParseBytes(pairsStr);
  if (pairs === null || pairs * 192n > MEM_MAX_BYTES) return null;
  const pairGas = entry.perPair * pairs;
  return {
    precompile: "pairing", address: entry.address,
    baseGas: entry.base.toString(), perPairGas: entry.perPair.toString(),
    pairs: pairs.toString(), pairGas: pairGas.toString(),
    inputBytes: (pairs * 192n).toString(),
    totalGas: (entry.base + pairGas).toString()
  };
}

/* ---------- alt_bn128 point arithmetic (ecAdd / ecMul applied) ----------
   The applied counterpart of the gas calculator above: that tool
   quotes ecAdd's flat 150 and ecMul's flat 6,000 from the
   operation alone and does not read the points — this one takes
   the points (and, for ecMul, the scalar) and runs the G1
   arithmetic itself, exactly as the precompiles at 0x06 and
   0x07 do. The pairing check (0x08) is NOT applied here: its
   arithmetic lives in the twelve-degree extension field and
   the Miller loop, and it is run by the pairing tool further
   below. The curve is y^2 = x^3 + 3
   over the field of prime order
   p = 21888242871839275222246405745257275088696311157297823662689037894645226208583:
   the coefficient a is 0, so the doubling slope is 3x^2 / 2y —
   the shortcut that does NOT carry to secp256r1 below (there
   a = p - 3 and the slope is (3x^2 + a) / 2y). The point at
   infinity is written (0, 0) on input and output alike. The
   group order is the prime
   r = 21888242871839275222246405745257275088548364400416034343698204186575808495617
   and the cofactor is 1, so every on-curve point is in the
   prime-order group and NO subgroup check exists for G1 —
   unlike the pairing check's G2 elements, which need one.
   Validity, per EIP-196: a coordinate at or above p, or a
   non-infinity point off the curve, makes the precompile call
   FAIL — the caller sees a failed call with no output, a
   deliberate contrast with P256VERIFY below, which returns
   empty and never reverts. A failed precompile call consumes
   all the gas supplied to it (as the BLS section notes for its
   family), so the totalGas reported here is the scheduled flat
   charge from bn128GasCalc — what a successful call pays —
   cross-checked against it in tests on every row. The ecMul
   scalar is any 256-bit word and acts modulo r by the group
   law alone (r * P is infinity, (r + 1) * P is P — both pinned
   in tests); the multiplication is a full double-and-add over
   the scalar as given, with no explicit reduction. Malformed
   input to THIS page is refused with null, as the other
   calculators refuse unparseable input: the operation must be
   ecadd or ecmul and each field it reads must be exactly 32
   bytes of hex. For ecMul the second point's fields are never
   read at all, exactly as the gas tool never reads the pair
   count for the flat operations. Verified in the tests against
   an independent pure-Python oracle (oracle-bn128-calc.py)
   carrying TWO implementations (affine and Jacobian coordinates)
   asserted to agree on every vector, anchored in-script BEFORE
   emitting vectors on go-ethereum's official precompile testdata
   — all 16 bn256Add and 19 bn256ScalarMul rows of the
   ethereum/tests vectors reproduce under both implementations —
   and on the group order itself (r * G is infinity and
   (r - 1) * G is -G, computed with NO scalar reduction, so the
   check is not vacuous). The anchors earned their keep: a
   from-memory transcription of the published 2 * G coordinates
   failed the on-curve check and a wrong group-order constant
   failed the testdata rows; both were discarded before any
   vector was trusted. Computes locally; no chain is queried. */
const BN128_P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
function bn128Mod(a) { const r = a % BN128_P; return r < 0n ? r + BN128_P : r; }
function bn128OnCurve(x, y) {
  return bn128Mod(y * y) === bn128Mod(x * x * x + 3n);
}
function bn128ValidPoint(x, y) {
  if (x >= BN128_P || y >= BN128_P) return false;
  if (x === 0n && y === 0n) return true; /* infinity encoding */
  return bn128OnCurve(x, y);
}
function bn128Add(p1, p2) {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  const [x1, y1] = p1, [x2, y2] = p2;
  let lam;
  if (x1 === x2) {
    if (bn128Mod(y1 + y2) === 0n) return null;
    lam = bn128Mod(3n * x1 * x1 * secpModPow(2n * y1, BN128_P - 2n, BN128_P));
  } else {
    lam = bn128Mod((y2 - y1) * secpModPow(x2 - x1, BN128_P - 2n, BN128_P));
  }
  const x3 = bn128Mod(lam * lam - x1 - x2);
  return [x3, bn128Mod(lam * (x1 - x3) - y1)];
}
function bn128Mul(k, point) {
  let result = null, addend = point, scalar = k;
  while (scalar > 0n) {
    if (scalar & 1n) result = bn128Add(result, addend);
    addend = bn128Add(addend, addend);
    scalar >>= 1n;
  }
  return result;
}
function bn128Calc(opStr, x1Hex, y1Hex, aHex, bHex) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim();
  if (op !== "ecadd" && op !== "ecmul") return null;
  const gas = bn128GasCalc(op, null);
  if (gas === null) return null;
  const x1Bytes = parseHexBytes(x1Hex, 32);
  const y1Bytes = parseHexBytes(y1Hex, 32);
  const aBytes = parseHexBytes(aHex, 32);
  if (x1Bytes === null || y1Bytes === null || aBytes === null) return null;
  let bBytes = null;
  if (op === "ecadd") {
    bBytes = parseHexBytes(bHex, 32);
    if (bBytes === null) return null;
  }
  const failed = {
    precompile: op, address: gas.address, succeeded: "false",
    output: "0x", outputBytes: "0", totalGas: gas.totalGas
  };
  const x1 = bytesToBigInt(x1Bytes), y1 = bytesToBigInt(y1Bytes);
  if (!bn128ValidPoint(x1, y1)) return failed;
  const p1 = (x1 === 0n && y1 === 0n) ? null : [x1, y1];
  let result;
  if (op === "ecadd") {
    const x2 = bytesToBigInt(aBytes), y2 = bytesToBigInt(bBytes);
    if (!bn128ValidPoint(x2, y2)) return failed;
    const p2 = (x2 === 0n && y2 === 0n) ? null : [x2, y2];
    result = bn128Add(p1, p2);
  } else {
    result = bn128Mul(bytesToBigInt(aBytes), p1);
  }
  return {
    precompile: op, address: gas.address, succeeded: "true",
    output: result === null
      ? "0x" + "00".repeat(64)
      : "0x" + result[0].toString(16).padStart(64, "0") + result[1].toString(16).padStart(64, "0"),
    outputBytes: "64", totalGas: gas.totalGas
  };
}

/* ---------- alt_bn128 pairing check (EIP-197, applied) ----------
   The applied half of the last alt_bn128 precompile: bn128GasCalc
   quotes the pairing check's 45,000 + 34,000 per pair from the
   pair count alone and never reads a point; bn128Calc runs
   ecAdd / ecMul and leaves the pairing check out, because its
   arithmetic is of a different order — Fp12 extension-field
   work and a Miller loop. This tool runs it. It takes the
   precompile's own input — k repetitions of (G1 point, G2
   point), 192 bytes per pair — and decides the EIP-197
   statement: the product of e(ai, bi) over the pairs is the
   identity, equivalently the sum of the discrete-log products
   is 0 in Fq — returning the 32-byte word holding 1 when it
   holds and 0 when it does not. Empty input is the empty
   product and returns 1.
   Validation, per EIP-197 (not merely the curve equations):
   a G1 coordinate at or above p, or a non-infinity G1 point
   off y^2 = x^3 + 3, fails the call; for G2, in the EIP's own
   words, "the order of the element has to be checked to be
   equal to the group order q" — so a G2 element must have
   every component below p, lie on the twist y^2 = x^3 +
   3/(9 + i) over Fp2 = Fp[i] / (i^2 + 1), AND satisfy
   q * P = infinity (checked here by the full multiplication,
   no scalar reduction); an on-twist point outside the
   subgroup fails the call, it does not merely score 0. That
   subgroup trap is pinned in tests with a mined example: the
   twist point at x = 1 + 0i is on the twist and fails. G1
   needs no such check — its cofactor is 1. Any bad pair fails
   the WHOLE call at the scheduled charge cross-checked
   against bn128GasCalc exactly on every row (a failing
   precompile call burns all gas supplied to it, so the
   scheduled charge is what a successful call pays). A pair
   with an infinity in either position contributes the
   identity and is skipped. The encoding trap is the Fp2 word
   order: an element a*i + b is written (a, b), imaginary
   coefficient FIRST, so a G2 point arrives as x_imag, x_real,
   y_imag, y_real — reading the pairs as (real, imag) puts a
   different point on the twist (the generator's own
   coordinates only satisfy the twist equation in the EIP's
   order, which the oracle's anchors assert).
   The arithmetic: Fp12 is the degree-12 polynomial extension
   with w^12 = 18 w^6 - 82; the twist point is carried into
   Fp12 by the field isomorphism (c0 + c1 i maps to
   (c0 - 9 c1) + c1 w^6, then x scales by w^2 and y by w^3),
   under which the twist's equation becomes y^2 = x^3 + 3
   itself — asserted on the generator in the oracle before any
   vector was trusted. The Miller loop runs the optimal ate
   loop count 6x + 2 = 29793968203157093288 (x the BN
   parameter 4965661367192848881) in its pseudo-binary
   (signed-digit) encoding, tracking the line functions'
   numerators and denominators separately so exactly one Fp12
   inversion — by the polynomial extended Euclidean algorithm
   — is needed, then the two Frobenius correction steps
   (lines at Q1 = Q^p and -Q2 = -(Q1^p conjugated)) close the
   loop. Frobenius powers are computed as coefficient
   combinations of the precomputed powers of w^p, since the
   coefficients live in Fp and are fixed by Frobenius. The
   final exponentiation splits into the easy part
   f^((p^6 - 1)(p^2 + 1)), evaluated with Frobenius powers and
   one inversion, and the hard part f^((p^4 - p^2 + 1) / q) by
   square-and-multiply; the oracle asserts the split form
   equals the naive f^((p^12 - 1) / q) on a Miller value
   before any vector was emitted. Pairs are capped at 16 as a
   stated page computation cap — the precompile accepts any
   count a caller's gas can pay for and the gas calculator
   above still prices beyond it; a client fails the call
   itself on a length that is not a multiple of 192, where
   this page refuses it as malformed, as on every tool.
   Verified against an independent oracle (oracle-bn128-
   pairing.py) in two parts asserted to agree on every row:
   py_ecc, the Ethereum Foundation's bn128 library, with the
   EIP-197 subgroup check added explicitly, and a pure-Python
   prototype of this exact algorithm — both reproduce all 14
   rows of go-ethereum's official bn256Pairing testdata,
   results and Istanbul prices, with the anchors above
   asserted in-script before emitting. Computes locally; no
   chain is queried, nothing is called. */
const BN128_Q = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const BN128_PAIRING_MAX_PAIRS = 16;
const BN128_ATE_PSEUDO = [
  0, 0, 0, 1, 0, 1, 0, -1, 0, 0, 1, -1, 0, 0, 1, 0,
  0, 1, 1, 0, -1, 0, 0, 1, 0, -1, 0, 0, 0, 0, 1, 1,
  1, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, -1, 0, 0, 1,
  1, 0, 0, -1, 0, 0, 0, 1, 1, 0, -1, 0, 0, 1, 0, 1, 1
];
/* Fp2 helpers: an element is [c0, c1] = c0 + c1 * i, i^2 = -1 */
function bn128F2Add(a, b) { return [bn128Mod(a[0] + b[0]), bn128Mod(a[1] + b[1])]; }
function bn128F2Sub(a, b) { return [bn128Mod(a[0] - b[0]), bn128Mod(a[1] - b[1])]; }
function bn128F2Neg(a) { return [bn128Mod(-a[0]), bn128Mod(-a[1])]; }
function bn128F2Mul(a, b) {
  return [bn128Mod(a[0] * b[0] - a[1] * b[1]), bn128Mod(a[0] * b[1] + a[1] * b[0])];
}
function bn128F2Inv(a) {
  const d = secpModPow(bn128Mod(a[0] * a[0] + a[1] * a[1]), BN128_P - 2n, BN128_P);
  return [bn128Mod(a[0] * d), bn128Mod(-a[1] * d)];
}
const BN128_B2 = bn128F2Mul([3n, 0n], bn128F2Inv([9n, 1n])); /* twist constant 3 / (9 + i) */
function bn128TwistOnCurve(x, y) {
  const lhs = bn128F2Mul(y, y);
  const rhs = bn128F2Add(bn128F2Mul(bn128F2Mul(x, x), x), BN128_B2);
  return lhs[0] === rhs[0] && lhs[1] === rhs[1];
}
/* Affine twist point arithmetic; a point is [x, y] of Fp2
   elements, and null is the point at infinity. */
function bn128TAdd(p1, p2) {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  const [x1, y1] = p1, [x2, y2] = p2;
  let lam;
  if (x1[0] === x2[0] && x1[1] === x2[1]) {
    if (bn128Mod(y1[0] + y2[0]) === 0n && bn128Mod(y1[1] + y2[1]) === 0n) return null;
    lam = bn128F2Mul(bn128F2Mul([3n, 0n], bn128F2Mul(x1, x1)), bn128F2Inv(bn128F2Mul([2n, 0n], y1)));
  } else {
    lam = bn128F2Mul(bn128F2Sub(y2, y1), bn128F2Inv(bn128F2Sub(x2, x1)));
  }
  const lamSq = bn128F2Mul(lam, lam);
  const x3 = bn128F2Sub(bn128F2Sub(lamSq, x1), x2);
  const y3 = bn128F2Sub(bn128F2Mul(lam, bn128F2Sub(x1, x3)), y1);
  return [x3, y3];
}
function bn128TMul(k, point) {
  let result = null, addend = point, scalar = k;
  while (scalar > 0n) {
    if (scalar & 1n) result = bn128TAdd(result, addend);
    addend = bn128TAdd(addend, addend);
    scalar >>= 1n;
  }
  return result;
}
/* Fp12 helpers: an element is 12 coefficients [c0..c11] of
   1, w, ..., w^11 with w^12 = 18 w^6 - 82 */
function bn128F12Zero() { return [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; }
function bn128F12One() { const o = bn128F12Zero(); o[0] = 1n; return o; }
function bn128F12Add(a, b) { return a.map((v, i) => bn128Mod(v + b[i])); }
function bn128F12Sub(a, b) { return a.map((v, i) => bn128Mod(v - b[i])); }
function bn128F12Neg(a) { return a.map((v) => bn128Mod(-v)); }
function bn128F12Smul(a, s) { return a.map((v) => bn128Mod(v * s)); }
function bn128F12Eq(a, b) { return a.every((v, i) => bn128Mod(v - b[i]) === 0n); }
function bn128F12IsZero(a) { return a.every((v) => bn128Mod(v) === 0n); }
function bn128F12Mul(a, b) {
  const t = new Array(23).fill(0n);
  for (let i = 0; i < 12; i++) {
    if (a[i] === 0n) continue;
    for (let j = 0; j < 12; j++) {
      if (b[j] === 0n) continue;
      t[i + j] = bn128Mod(t[i + j] + a[i] * b[j]);
    }
  }
  for (let k = 22; k >= 12; k--) {
    const c = bn128Mod(t[k]);
    if (c === 0n) continue;
    t[k - 6] = bn128Mod(t[k - 6] + 18n * c);
    t[k - 12] = bn128Mod(t[k - 12] - 82n * c);
  }
  return t.slice(0, 12);
}
function bn128F12Pow(a, e) {
  let result = bn128F12One(), base = a, exp = e;
  while (exp > 0n) {
    if (exp & 1n) result = bn128F12Mul(result, base);
    base = bn128F12Mul(base, base);
    exp >>= 1n;
  }
  return result;
}
/* Polynomial helpers over Fp (coefficient lists, low to high)
   for the Fp12 inverse: the modulus is w^12 - 18 w^6 + 82 */
const BN128_MOD12 = [82n, 0n, 0n, 0n, 0n, 0n, BN128_P - 18n, 0n, 0n, 0n, 0n, 0n, 1n];
function bn128PolyTrim(a) {
  const out = a.map((v) => bn128Mod(v));
  while (out.length > 1 && out[out.length - 1] === 0n) out.pop();
  return out;
}
function bn128PolyDivmod(aIn, bIn) {
  let a = bn128PolyTrim(aIn.slice());
  const b = bn128PolyTrim(bIn.slice());
  if (a.length < b.length) return [[0n], a];
  const q = new Array(a.length - b.length + 1).fill(0n);
  const invLead = secpModPow(b[b.length - 1], BN128_P - 2n, BN128_P);
  while (a.length >= b.length && !(a.length === 1 && a[0] === 0n)) {
    const d = a.length - b.length;
    const c = bn128Mod(a[a.length - 1] * invLead);
    q[d] = c;
    for (let j = 0; j < b.length; j++) a[d + j] = bn128Mod(a[d + j] - c * b[j]);
    a = bn128PolyTrim(a);
  }
  return [bn128PolyTrim(q), a];
}
function bn128PolyMod(a) {
  const t = bn128PolyTrim(a.slice());
  if (t.length < 13) {
    const out = t.slice();
    while (out.length < 12) out.push(0n);
    return out;
  }
  const r = bn128PolyDivmod(t, BN128_MOD12)[1];
  const out = r.slice();
  while (out.length < 12) out.push(0n);
  return out;
}
function bn128PolyMulMod(a, b) {
  const t = new Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) {
    if (bn128Mod(a[i]) === 0n) continue;
    for (let j = 0; j < b.length; j++) {
      t[i + j] = bn128Mod(t[i + j] + a[i] * b[j]);
    }
  }
  return bn128PolyMod(t);
}
function bn128F12Inv(a) {
  /* extended Euclid: the coefficient s with s * a = gcd(a,
     MOD12); MOD12 is irreducible and a != 0, so the gcd is a
     nonzero constant and a^-1 = s / gcd */
  let oldR = BN128_MOD12.slice(), r = bn128PolyTrim(a.slice());
  let oldS = [0n], s = [1n];
  while (r.length > 1) {
    const dm = bn128PolyDivmod(oldR, r);
    oldR = r; r = dm[1];
    const qs = bn128PolyMulMod(dm[0], s);
    const newS = [];
    for (let i = 0; i < 12; i++) {
      newS.push(bn128Mod((i < oldS.length ? oldS[i] : 0n) - (i < qs.length ? qs[i] : 0n)));
    }
    oldS = s; s = bn128PolyMod(newS);
  }
  const invC = secpModPow(r[0], BN128_P - 2n, BN128_P);
  return bn128PolyMod(s).map((v) => bn128Mod(v * invC));
}
/* Frobenius: (sum ci w^i)^p = sum ci (w^p)^i, the ci being in
   Fp and so fixed. Powers of w^p are computed once, lazily. */
let BN128_WPOW = null;
function bn128F12FrobInit() {
  if (BN128_WPOW !== null) return;
  const W = bn128F12Zero(); W[1] = 1n;
  const WP = bn128F12Pow(W, BN128_P);
  BN128_WPOW = [bn128F12One()];
  for (let i = 0; i < 11; i++) BN128_WPOW.push(bn128F12Mul(BN128_WPOW[i], WP));
}
function bn128F12Frob(a) {
  bn128F12FrobInit();
  let out = bn128F12Zero();
  for (let i = 0; i < 12; i++) {
    if (a[i] !== 0n) out = bn128F12Add(out, bn128F12Smul(BN128_WPOW[i], a[i]));
  }
  return out;
}
function bn128F12FrobPow(a, k) {
  let wk = bn128F12Zero(); wk[1] = 1n;
  for (let j = 0; j < k; j++) wk = bn128F12Frob(wk);
  const powers = [bn128F12One()];
  for (let i = 0; i < 11; i++) powers.push(bn128F12Mul(powers[i], wk));
  let out = bn128F12Zero();
  for (let i = 0; i < 12; i++) {
    if (a[i] !== 0n) out = bn128F12Add(out, bn128F12Smul(powers[i], a[i]));
  }
  return out;
}
/* Projective point arithmetic over Fp12 (py_ecc's add-2007 / 
   dbl formulas for a = 0, in homogeneous (x/z, y/z) form);
   a point is [x, y, z] of Fp12 elements, z = 0 is infinity. */
function bn128P12Double(pt) {
  const [x, y, z] = pt;
  const W = bn128F12Smul(bn128F12Mul(x, x), 3n);
  const S = bn128F12Mul(y, z);
  const B = bn128F12Mul(bn128F12Mul(x, y), S);
  const H = bn128F12Sub(bn128F12Mul(W, W), bn128F12Smul(B, 8n));
  const S2 = bn128F12Mul(S, S);
  const nx = bn128F12Smul(bn128F12Mul(H, S), 2n);
  const ny = bn128F12Sub(
    bn128F12Mul(W, bn128F12Sub(bn128F12Smul(B, 4n), H)),
    bn128F12Smul(bn128F12Mul(bn128F12Mul(y, y), S2), 8n));
  const nz = bn128F12Smul(bn128F12Mul(S, S2), 8n);
  return [nx, ny, nz];
}
function bn128P12Add(p1, p2) {
  if (bn128F12IsZero(p1[2])) return p2;
  if (bn128F12IsZero(p2[2])) return p1;
  const [x1, y1, z1] = p1, [x2, y2, z2] = p2;
  const U1 = bn128F12Mul(y2, z1), U2 = bn128F12Mul(y1, z2);
  const V1 = bn128F12Mul(x2, z1), V2 = bn128F12Mul(x1, z2);
  if (bn128F12Eq(V1, V2)) {
    if (bn128F12Eq(U1, U2)) return bn128P12Double(p1);
    return [bn128F12One(), bn128F12One(), bn128F12Zero()];
  }
  const U = bn128F12Sub(U1, U2), V = bn128F12Sub(V1, V2);
  const Vsq = bn128F12Mul(V, V);
  const VsqV2 = bn128F12Mul(Vsq, V2);
  const Vcube = bn128F12Mul(V, Vsq);
  const W = bn128F12Mul(z1, z2);
  const A = bn128F12Sub(bn128F12Sub(bn128F12Mul(bn128F12Mul(U, U), W), Vcube), bn128F12Smul(VsqV2, 2n));
  const nx = bn128F12Mul(V, A);
  const ny = bn128F12Sub(bn128F12Mul(U, bn128F12Sub(VsqV2, A)), bn128F12Mul(Vcube, U2));
  const nz = bn128F12Mul(Vcube, W);
  return [nx, ny, nz];
}
function bn128P12Neg(pt) { return [pt[0], bn128F12Neg(pt[1]), pt[2]]; }
/* The twist isomorphism into Fp12: c0 + c1 i is carried to
   (c0 - 9 c1) + c1 w^6, then x scales by w^2, y by w^3, under
   which y^2 = x^3 + 3/(9 + i) becomes y^2 = x^3 + 3 */
function bn128TwistToF12(x, y) {
  const embed = (c) => {
    const e = bn128F12Zero();
    e[0] = bn128Mod(c[0] - 9n * c[1]);
    e[6] = bn128Mod(c[1]);
    return e;
  };
  const w2 = bn128F12Zero(); w2[2] = 1n;
  const w3 = bn128F12Zero(); w3[3] = 1n;
  return [bn128F12Mul(embed(x), w2), bn128F12Mul(embed(y), w3), embed([1n, 0n])];
}
/* The line through P1 and P2 evaluated at T, returned as a
   (numerator, denominator) pair so the loop needs no
   inversions until the very end */
function bn128Linefunc(P1, P2, T) {
  const [x1, y1, z1] = P1, [x2, y2, z2] = P2, [xt, yt, zt] = T;
  const mn = bn128F12Sub(bn128F12Mul(y2, z1), bn128F12Mul(y1, z2));
  const md = bn128F12Sub(bn128F12Mul(x2, z1), bn128F12Mul(x1, z2));
  if (!bn128F12IsZero(md)) {
    const num = bn128F12Sub(
      bn128F12Mul(mn, bn128F12Sub(bn128F12Mul(xt, z1), bn128F12Mul(x1, zt))),
      bn128F12Mul(md, bn128F12Sub(bn128F12Mul(yt, z1), bn128F12Mul(y1, zt))));
    return [num, bn128F12Mul(bn128F12Mul(md, zt), z1)];
  }
  if (bn128F12IsZero(mn)) {
    const mn2 = bn128F12Smul(bn128F12Mul(x1, x1), 3n);
    const md2 = bn128F12Smul(bn128F12Mul(y1, z1), 2n);
    const num = bn128F12Sub(
      bn128F12Mul(mn2, bn128F12Sub(bn128F12Mul(xt, z1), bn128F12Mul(x1, zt))),
      bn128F12Mul(md2, bn128F12Sub(bn128F12Mul(yt, z1), bn128F12Mul(y1, zt))));
    return [num, bn128F12Mul(bn128F12Mul(md2, zt), z1)];
  }
  return [bn128F12Sub(bn128F12Mul(xt, z1), bn128F12Mul(x1, zt)), bn128F12Mul(z1, zt)];
}
function bn128MillerRaw(Q12, P12) {
  let R = Q12;
  let fNum = bn128F12One(), fDen = bn128F12One();
  for (let idx = 63; idx >= 0; idx--) {
    const v = BN128_ATE_PSEUDO[idx];
    const ld = bn128Linefunc(R, R, P12);
    fNum = bn128F12Mul(bn128F12Mul(fNum, fNum), ld[0]);
    fDen = bn128F12Mul(bn128F12Mul(fDen, fDen), ld[1]);
    R = bn128P12Double(R);
    if (v === 1) {
      const la = bn128Linefunc(R, Q12, P12);
      fNum = bn128F12Mul(fNum, la[0]);
      fDen = bn128F12Mul(fDen, la[1]);
      R = bn128P12Add(R, Q12);
    } else if (v === -1) {
      const nQ = bn128P12Neg(Q12);
      const la = bn128Linefunc(R, nQ, P12);
      fNum = bn128F12Mul(fNum, la[0]);
      fDen = bn128F12Mul(fDen, la[1]);
      R = bn128P12Add(R, nQ);
    }
  }
  const Q1 = [bn128F12Frob(Q12[0]), bn128F12Frob(Q12[1]), bn128F12Frob(Q12[2])];
  const nQ2 = [bn128F12Frob(Q1[0]), bn128F12Neg(bn128F12Frob(Q1[1])), bn128F12Frob(Q1[2])];
  const l1 = bn128Linefunc(R, Q1, P12);
  R = bn128P12Add(R, Q1);
  const l2 = bn128Linefunc(R, nQ2, P12);
  const num = bn128F12Mul(bn128F12Mul(fNum, l1[0]), l2[0]);
  const den = bn128F12Mul(bn128F12Mul(fDen, l1[1]), l2[1]);
  return bn128F12Mul(num, bn128F12Inv(den));
}
function bn128FinalExp(f) {
  const f1 = bn128F12Mul(bn128F12FrobPow(f, 6), bn128F12Inv(f)); /* f^(p^6 - 1) */
  const f2 = bn128F12Mul(bn128F12FrobPow(f1, 2), f1); /* ^(p^2 + 1) */
  return bn128F12Pow(f2, (BN128_P ** 4n - BN128_P ** 2n + 1n) / BN128_Q);
}
function bn128PairingCalc(inputHex) {
  const bytes = parseHexBytes(inputHex);
  if (bytes === null) return null;
  if (bytes.length % 192 !== 0) return null;
  const pairs = bytes.length / 192;
  if (pairs > BN128_PAIRING_MAX_PAIRS) return null;
  const gas = bn128GasCalc("pairing", String(pairs));
  if (gas === null) return null;
  const failed = {
    precompile: "pairing", address: gas.address, pairs: String(pairs),
    succeeded: "false", output: "0x", outputBytes: "0", totalGas: gas.totalGas
  };
  const parsed = [];
  for (let i = 0; i < pairs; i++) {
    const off = i * 192;
    const w = [];
    for (let j = 0; j < 6; j++) w.push(bytesToBigInt(bytes.slice(off + 32 * j, off + 32 * j + 32)));
    const gx = w[0], gy = w[1];
    if (!bn128ValidPoint(gx, gy)) return failed;
    const xc1 = w[2], xc0 = w[3], yc1 = w[4], yc0 = w[5];
    if (xc1 >= BN128_P || xc0 >= BN128_P || yc1 >= BN128_P || yc0 >= BN128_P) return failed;
    let q12 = null;
    if (!(xc1 === 0n && xc0 === 0n && yc1 === 0n && yc0 === 0n)) {
      const x = [xc0, xc1], y = [yc0, yc1];
      if (!bn128TwistOnCurve(x, y)) return failed;
      if (bn128TMul(BN128_Q, [x, y]) !== null) return failed; /* EIP-197 order check */
      q12 = bn128TwistToF12(x, y);
    }
    let p12 = null;
    if (!(gx === 0n && gy === 0n)) {
      const ex = bn128F12Zero(); ex[0] = gx;
      const ey = bn128F12Zero(); ey[0] = gy;
      p12 = [ex, ey, bn128F12One()];
    }
    parsed.push([p12, q12]);
  }
  let acc = bn128F12One();
  for (const [p12, q12] of parsed) {
    if (p12 === null || q12 === null) continue;
    acc = bn128F12Mul(acc, bn128MillerRaw(q12, p12));
  }
  const ok = bn128F12Eq(bn128FinalExp(acc), bn128F12One());
  return {
    precompile: "pairing", address: gas.address, pairs: String(pairs),
    succeeded: "true",
    output: "0x" + (ok ? "0".repeat(63) + "1" : "0".repeat(64)),
    outputBytes: "32", totalGas: gas.totalGas
  };
}

/* BLAKE2f precompile gas — the BLAKE2b compression function F
   at address 0x09, added by EIP-152 at Istanbul (the EIP is
   CC0; the schedule is restated here in my own words, and the
   pricing was cross-verified across two independent sources
   this run: EIP-152's own gas formula and independent tables
   listing BLAKE2F at 1 gas per round, GFROUND x rounds):
     - the input is fixed-width, exactly 213 bytes: a 4-byte
       big-endian uint32 rounds count, then the 64-byte state
       h, the 128-byte message block m, the 16-byte offset
       counters t, and a 1-byte final-block flag f;
     - the charge is the rounds value itself — 1 gas per
       round, with no base, no per-word term and no other term:
       total = rounds. So 0 rounds charges 0 for the
       precompile's own cost (a caller would never forward 0
       rounds for real work, but the pricing is exact), and
       12 rounds — the round count BLAKE2b itself performs
       for one compression — charges exactly 12;
     - rounds is a uint32 read from those 4 bytes, so its
       range is 0 to 4,294,967,295; anything wider cannot
       occur in a real input and is refused here.
   There is no EIP-2929 access term: like the other
   precompiles, this one starts warm. This prices the
   precompile's OWN charge only: the CALL or STATICCALL that
   invokes it charges its own terms separately (the CALL
   calculator above). Deliberate contrasts: unlike the
   original four (base + per-word) and the pairing check
   (base + per-pair), this price reads a field INSIDE the
   input, not its length, and the state, message, counters
   and flag move no term. An input that is not exactly
   213 bytes, or whose final flag is not 0 or 1, fails for
   a non-gas reason and is not modelled — the calculator
   takes the rounds count directly, as the other precompile
   tools take their priced quantity. */
const BLAKE2F_MAX_ROUNDS = 4294967295n; /* 2^32 - 1 */
function blake2fGasCalc(roundsStr) {
  if (typeof roundsStr !== "string") return null;
  const s = roundsStr.trim();
  if (!/^\d+$/.test(s)) return null;
  const rounds = BigInt(s);
  if (rounds > BLAKE2F_MAX_ROUNDS) return null;
  return {
    precompile: "blake2f", address: "0x0000000000000000000000000000000000000009",
    rounds: rounds.toString(), perRoundGas: "1", inputBytes: "213",
    totalGas: rounds.toString()
  };
}

/* ---------- BLAKE2f precompile calculator (EIP-152) ----------
   The applied counterpart of the gas calculator above: that tool
   prices a BLAKE2f call from its rounds count alone and does not
   run the compression — this one does. The inputs are the
   precompile's own fields (EIP-152, Final; the compression is
   RFC 7693 section 3.2, semantics paraphrased): the rounds count,
   the 64-byte state h, the 128-byte message block m, the 16-byte
   offset counters t and the final-block flag f. The trap is the
   byte order: almost everything else on this page reads words
   big-endian, but h, m and both counters are LITTLE-endian words
   — the state the page prefilled is stored in the block's own
   order, and reading it big-endian would silently compress a
   different state. The working vector is h followed by the IV,
   with t0 folded into word 12, t1 into word 13 and, when f is
   set, every bit of word 14 flipped; each round mixes the
   message words in one sigma row's order (round r uses row
   r mod 10) through the G function, down the columns then along
   the diagonals; the result is h ^ v_low ^ v_high, returned as
   64 little-endian bytes, exactly what the precompile returns.
   Consequences pinned in tests: zero rounds runs no mixing at
   all, so h cancels itself and the output is the IV words as
   modified by the counters and flag alone (EIP-152's vector 4);
   the flag matters — the same inputs with f unset land on a
   different state (vector 6 against vector 5). The price is the
   hub's own BLAKE2f gas function fed the rounds count,
   cross-checked against it exactly in tests. A flag other than
   0 or 1 is refused, as the precompile errors on it. Rounds
   above 100,000 are refused outright as this tool's stated
   computation cap: the precompile itself accepts any uint32
   (EIP-152's vector 8 runs 4,294,967,295 rounds and a caller
   pays 1 gas for each), but this page computes locally in the
   browser, and 100,000 rounds is more than eighty times the
   1,200-round case the EIP's own benchmark appendix uses —
   the gas tool above still prices any uint32 count. Verified
   in the tests against an independent pure-Python oracle
   (oracle-blake2f-calc.py) whose anchors, asserted before it
   emitted vectors, are EIP-152's published vectors 4-7 and
   Python hashlib's BLAKE2b-512 digest of "abc", which the
   prefilled compression (the parameter-mixed IV state, the
   "abc" block, t = 3, final flag set) must reproduce word for
   word. Computes locally; no call is made and no chain is
   queried. */
const BLAKE2F_CALC_MAX_ROUNDS = 100000n;
const BLAKE2B_IV = [
  0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n
];
const BLAKE2B_SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0]
];
const BLAKE2B_MASK64 = (1n << 64n) - 1n;
function blake2bRotr(x, n) { return ((x >> n) | (x << (64n - n))) & BLAKE2B_MASK64; }
function blake2bLeWords(bytes) {
  const words = [];
  for (let i = 0; i < bytes.length; i += 8) {
    let w = 0n;
    for (let j = 7; j >= 0; j--) w = (w << 8n) | BigInt(bytes[i + j]);
    words.push(w);
  }
  return words;
}
function blake2fCalc(roundsStr, hHex, mHex, tHex, fStr) {
  if (typeof roundsStr !== "string" || typeof fStr !== "string") return null;
  const rs = roundsStr.trim();
  if (!/^\d+$/.test(rs)) return null;
  const rounds = BigInt(rs);
  if (rounds > BLAKE2F_CALC_MAX_ROUNDS) return null;
  if (fStr.trim() !== "0" && fStr.trim() !== "1") return null;
  const hBytes = parseHexBytes(hHex, 64);
  const mBytes = parseHexBytes(mHex, 128);
  const tBytes = parseHexBytes(tHex, 16);
  if (hBytes === null || mBytes === null || tBytes === null) return null;
  const h = blake2bLeWords(hBytes);
  const m = blake2bLeWords(mBytes);
  const t = blake2bLeWords(tBytes);
  const v = [...h, ...BLAKE2B_IV];
  v[12] ^= t[0];
  v[13] ^= t[1];
  if (fStr.trim() === "1") v[14] ^= BLAKE2B_MASK64;
  const G = (a, b, c, d, x, y) => {
    v[a] = (v[a] + v[b] + x) & BLAKE2B_MASK64;
    v[d] = blake2bRotr(v[d] ^ v[a], 32n);
    v[c] = (v[c] + v[d]) & BLAKE2B_MASK64;
    v[b] = blake2bRotr(v[b] ^ v[c], 24n);
    v[a] = (v[a] + v[b] + y) & BLAKE2B_MASK64;
    v[d] = blake2bRotr(v[d] ^ v[a], 16n);
    v[c] = (v[c] + v[d]) & BLAKE2B_MASK64;
    v[b] = blake2bRotr(v[b] ^ v[c], 63n);
  };
  const nRounds = Number(rounds);
  for (let r = 0; r < nRounds; r++) {
    const s = BLAKE2B_SIGMA[r % 10];
    G(0, 4, 8, 12, m[s[0]], m[s[1]]);
    G(1, 5, 9, 13, m[s[2]], m[s[3]]);
    G(2, 6, 10, 14, m[s[4]], m[s[5]]);
    G(3, 7, 11, 15, m[s[6]], m[s[7]]);
    G(0, 5, 10, 15, m[s[8]], m[s[9]]);
    G(1, 6, 11, 12, m[s[10]], m[s[11]]);
    G(2, 7, 8, 13, m[s[12]], m[s[13]]);
    G(3, 4, 9, 14, m[s[14]], m[s[15]]);
  }
  const outBytes = [];
  for (let i = 0; i < 8; i++) {
    let w = h[i] ^ v[i] ^ v[i + 8];
    for (let j = 0; j < 8; j++) { outBytes.push(Number(w & 0xffn)); w >>= 8n; }
  }
  const gas = blake2fGasCalc(rs);
  if (gas === null) return null;
  return {
    output: "0x" + bytesToHex(outBytes),
    rounds: rounds.toString(), finalBlock: fStr.trim() === "1" ? "true" : "false",
    totalGas: gas.totalGas
  };
}

/* KZG point evaluation precompile gas — the precompile at
   address 0x0a added by EIP-4844 at Cancun (Deneb) so a
   contract can verify that a blob's polynomial evaluates to
   a claimed value at a claimed point (the EIP is CC0; the
   schedule is restated here in my own words, and the price
   was cross-verified across two independent sources this
   run: EIP-4844's own parameter table, which names
   POINT_EVALUATION_PRECOMPILE_GAS as 50000 and the address
   as Bytes20(0x0A), and independent implementation write-ups
   of the precompile at exactly 50,000 over a 192-byte input):
     - the input is fixed-width, exactly 192 bytes: the
       32-byte versioned hash, then the evaluation point z
       and the claimed value y as 32-byte field elements,
       then the 48-byte KZG commitment and the 48-byte proof;
     - the charge is a flat 50,000 — no base-plus-term split,
       no per-word or per-element term, and nothing in the
       input's contents moves it. Unlike BLAKE2f (0x09), whose
       price is read from a field inside its input, this price
       does not depend on the input at all: the input's LENGTH
       is a validity condition, not a priced quantity — any
       length other than exactly 192 fails the precompile's
       own length check, so no gas price exists for it and
       this calculator refuses it rather than quoting 50,000
       for a call that cannot run;
     - on success the precompile returns 64 bytes:
       FIELD_ELEMENTS_PER_BLOB (4096) and the BLS modulus,
       each a 32-byte big-endian value.
   There is no EIP-2929 access term: like the other
   precompiles, this one starts warm. This prices the
   precompile's OWN charge only: the CALL or STATICCALL that
   invokes it charges its own terms separately (the CALL
   calculator above). A versioned hash that does not match
   the commitment, a z or y that is not a canonical field
   element (not strictly below the BLS modulus), or a proof
   that does not verify all fail for non-gas reasons — the
   applied calculator (kzgPointEvalCalc, with the BLS tools
   below) runs exactly those checks; this gas calculator
   takes the input length directly, as the other precompile
   tools take their priced or validity quantity. */
const KZG_INPUT_BYTES = 192n;
const KZG_GAS = 50000n;
function kzgGasCalc(inputLenStr) {
  const len = memParseBytes(inputLenStr);
  if (len === null || len !== KZG_INPUT_BYTES) return null;
  return {
    precompile: "kzg-point-evaluation", address: "0x000000000000000000000000000000000000000a",
    inputBytes: KZG_INPUT_BYTES.toString(), outputBytes: "64",
    fieldElementsPerBlob: "4096",
    totalGas: KZG_GAS.toString()
  };
}

/* BLS12-381 precompile gas — the seven precompiles at
   addresses 0x0b-0x11 defined by EIP-2537 for operations on
   the BLS12-381 curve (the curve BLS signatures and the
   consensus layer use, offering roughly 120+ bits of security
   where alt_bn128 offers roughly 80). The EIP is Final and
   CC0; the schedule is restated here in my own words, and the
   constants were cross-verified across two independent
   sources this run: EIP-2537's own gas schedule and an
   independent client implementation's per-precompile gas
   listing (a second implementation's pricing table agreed).
   EIP-2537 shipped in the Prague/Electra upgrade (the
   EIP-7600 hardfork meta, also Final): mainnet activation at
   epoch 364032, so these are live mainnet prices, not a
   proposal. The seven:
     - G1ADD (0x0b): a flat 375. Its defined input is two G1
       points, 256 bytes, and its output one G1 point.
     - G2ADD (0x0d): a flat 600. Input two G2 points, 512
       bytes.
     - MAP_FP_TO_G1 (0x10): a flat 5,500, mapping one 64-byte
       base-field element to a G1 point.
     - MAP_FP2_TO_G2 (0x11): a flat 23,800, mapping one
       128-byte extension-field element to a G2 point.
     - PAIRING (0x0f): 37,700 plus 32,600 per pair, a pair
       being one 384-byte element (a 128-byte G1 point and a
       256-byte G2 point). (An early draft price of 43,000
       per pair still circulates in stale write-ups; the
       Final EIP and live clients charge 32,600.)
     - G1MSM (0x0c) and G2MSM (0x0e): multi-scalar
       multiplication — k point/scalar pairs priced as
       floor(k * mulCost * discount(k) / 1000), where mulCost
       is the single-multiplication cost (12,000 for G1,
       22,500 for G2) and discount(k) is a per-k discount
       from the EIP's tables (Pippenger's algorithm beats k
       separate multiplications, and the discount is that
       saving): the tables run k = 1..128 and the discount is
       capped past the table at 519 (G1) / 524 (G2). At k = 1
       the discount is 1000, so an MSM of one pair costs
       exactly the single-multiplication price. A G1 pair is
       160 bytes of input (128-byte point + 32-byte scalar),
       a G2 pair 288 bytes (256 + 32).
   Unlike the alt_bn128 pairing check, whose empty input
   succeeds, the EIP requires the variable-length operations
   (both MSMs and the pairing check) to return an error on an
   empty input, so a count of 0 has no price here and is
   refused. There is no dedicated single-MUL precompile: an
   MSM with k = 1 is the multiplication. There is no
   EIP-2929 access term: like the other precompiles, these
   start warm. This prices the precompile's OWN charge only:
   the CALL or STATICCALL that invokes it charges its own
   terms separately (the CALL calculator above). For the flat
   operations the count argument is not even parsed, exactly
   as their pricing never reads it; for the variable ones the
   count is bounded so the implied input fits the same size
   bound the memory tools use. A point not on its curve, a
   point outside its subgroup where a subgroup check applies
   (the MSMs and the pairing check; the ADDs perform none),
   a non-canonical field element, or an input length that is
   not the defined width (or a multiple of it) fails for a
   non-gas reason and is not modelled — on error a BLS
   precompile burns all the gas supplied to the call, which
   is also not modelled. */
const BLS_G1_DISCOUNT = [1000, 949, 848, 797, 764, 750, 738, 728, 719, 712, 705, 698, 692, 687, 682, 677, 673, 669, 665, 661, 658, 654, 651, 648, 645, 642, 640, 637, 635, 632, 630, 627, 625, 623, 621, 619, 617, 615, 613, 611, 609, 608, 606, 604, 603, 601, 599, 598, 596, 595, 593, 592, 591, 589, 588, 586, 585, 584, 582, 581, 580, 579, 577, 576, 575, 574, 573, 572, 570, 569, 568, 567, 566, 565, 564, 563, 562, 561, 560, 559, 558, 557, 556, 555, 554, 553, 552, 551, 550, 549, 548, 547, 547, 546, 545, 544, 543, 542, 541, 540, 540, 539, 538, 537, 536, 536, 535, 534, 533, 532, 532, 531, 530, 529, 528, 528, 527, 526, 525, 525, 524, 523, 522, 522, 521, 520, 520, 519];
const BLS_G2_DISCOUNT = [1000, 1000, 923, 884, 855, 832, 812, 796, 782, 770, 759, 749, 740, 732, 724, 717, 711, 704, 699, 693, 688, 683, 679, 674, 670, 666, 663, 659, 655, 652, 649, 646, 643, 640, 637, 634, 632, 629, 627, 624, 622, 620, 618, 615, 613, 611, 609, 607, 606, 604, 602, 600, 598, 597, 595, 593, 592, 590, 589, 587, 586, 584, 583, 582, 580, 579, 578, 576, 575, 574, 573, 571, 570, 569, 568, 567, 566, 565, 563, 562, 561, 560, 559, 558, 557, 556, 555, 554, 553, 552, 552, 551, 550, 549, 548, 547, 546, 545, 545, 544, 543, 542, 541, 541, 540, 539, 538, 537, 537, 536, 535, 535, 534, 533, 532, 532, 531, 530, 530, 529, 528, 528, 527, 526, 526, 525, 524, 524];
const BLS_GAS_TABLE = {
  "g1add": { address: "0x000000000000000000000000000000000000000b", flat: 375n, inputBytes: 256n },
  "g2add": { address: "0x000000000000000000000000000000000000000d", flat: 600n, inputBytes: 512n },
  "map-fp-to-g1": { address: "0x0000000000000000000000000000000000000010", flat: 5500n, inputBytes: 64n },
  "map-fp2-to-g2": { address: "0x0000000000000000000000000000000000000011", flat: 23800n, inputBytes: 128n },
  "g1msm": { address: "0x000000000000000000000000000000000000000c", perPairBytes: 160n, mulCost: 12000n, discount: BLS_G1_DISCOUNT, maxDiscount: 519n },
  "g2msm": { address: "0x000000000000000000000000000000000000000e", perPairBytes: 288n, mulCost: 22500n, discount: BLS_G2_DISCOUNT, maxDiscount: 524n },
  "pairing": { address: "0x000000000000000000000000000000000000000f", perPairBytes: 384n, base: 37700n, perPair: 32600n }
};
function blsGasCalc(nameStr, pairsStr) {
  if (typeof nameStr !== "string") return null;
  const name = nameStr.trim();
  const entry = BLS_GAS_TABLE[name];
  if (!entry) return null;
  if (entry.flat !== undefined) {
    return {
      precompile: name, address: entry.address,
      baseGas: entry.flat.toString(), perPairGas: "0",
      pairs: "0", pairGas: "0", discount: "0",
      inputBytes: entry.inputBytes.toString(),
      totalGas: entry.flat.toString()
    };
  }
  const pairs = memParseBytes(pairsStr);
  if (pairs === null || pairs < 1n || pairs * entry.perPairBytes > MEM_MAX_BYTES) return null;
  if (entry.perPair !== undefined) {
    const pairGas = entry.perPair * pairs;
    return {
      precompile: name, address: entry.address,
      baseGas: entry.base.toString(), perPairGas: entry.perPair.toString(),
      pairs: pairs.toString(), pairGas: pairGas.toString(), discount: "0",
      inputBytes: (pairs * entry.perPairBytes).toString(),
      totalGas: (entry.base + pairGas).toString()
    };
  }
  const discount = pairs <= 128n ? BigInt(entry.discount[Number(pairs) - 1]) : entry.maxDiscount;
  const totalGas = (pairs * entry.mulCost * discount) / 1000n;
  return {
    precompile: name, address: entry.address,
    baseGas: "0", perPairGas: entry.mulCost.toString(),
    pairs: pairs.toString(), pairGas: totalGas.toString(),
    discount: discount.toString(),
    inputBytes: (pairs * entry.perPairBytes).toString(),
    totalGas: totalGas.toString()
  };
}

/* ---------- BLS12-381 G1 point arithmetic (G1ADD / one-pair G1MSM applied) ----------
   The applied counterpart of the BLS gas calculator above, for
   the G1 half of the family: that tool quotes G1ADD's flat 375
   and the MSM schedule from the pair count alone and does not
   read the points — this one takes the points (and, for the
   MSM, the scalar) and runs the G1 arithmetic itself, exactly
   as the precompiles at 0x0b and 0x0c do. Scope is stated
   plainly: G1ADD in full, and G1MSM for ONE point/scalar pair
   — the multiplication case, at the k = 1 price of exactly
   12,000 (the EIP-2537 discount at k = 1 is 1000, so there is
   no separate MUL precompile); a multi-pair MSM is a sum of
   such multiplications under Pippenger's discount and stays
   gas-only here (the pairing check is run by its own
   tool below; the field-to-curve maps are run by their own tools below;
   G2 arithmetic is run by the G2 tool below). The curve is
   y^2 = x^3 + 4 over the field of prime order
   p = 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787:
   the coefficient a is 0, so the doubling slope is 3x^2 / 2y,
   as for alt_bn128 above (whose constant term is 3, not 4).
   The EIP-2537 encoding differs from alt_bn128's and the trap
   is the width: each coordinate is a 48-byte value carried in
   a 64-byte field element whose top 16 bytes must be zero, so
   a point is 128 bytes on the wire and the output below is
   that full 128-byte encoding; this page takes each coordinate
   as its 48-byte value and pads it back out on output. The
   point at infinity is written (0, 0) on input and output
   alike. The subgroup order is the prime
   q = 52435875175126190479447740508185965837690552500527637822603658699938581184513
   and — the deliberate contrast this tool pins — G1ADD
   performs NO subgroup check (EIP-2537 says so outright), so
   an on-curve point outside the subgroup adds like any other,
   while the MSM MUST check the subgroup (a point is in it
   exactly when q * P is infinity, computed here by the full
   multiplication with no scalar reduction) and a point
   outside it makes the MSM call FAIL. Validity otherwise
   mirrors EIP-196's: a coordinate at or above p, or a
   non-infinity point off the curve, in either position makes
   the precompile call fail — no output, and a failing BLS
   precompile call burns all the gas supplied to it, so the
   totalGas reported here is the scheduled charge from
   blsGasCalc (375 for G1ADD, the k = 1 MSM price of 12,000)
   that a successful call pays, cross-checked against it in
   tests on every row. The MSM scalar is any 256-bit word, not
   required to be below q, and acts modulo q by the group law
   alone (q * P is infinity, (q + 1) * P is P — both pinned).
   Malformed input to THIS page is refused with null, as the
   other calculators refuse unparseable input: the operation
   must be g1add or g1msm and each field it reads must be
   exactly 48 bytes of hex (32 for the MSM scalar). For the
   MSM the second point's fields are never read at all,
   exactly as the gas tool never reads the pair count for the
   flat operations. Verified in the tests against an
   independent pure-Python oracle (oracle-bls-g1-calc.py)
   carrying TWO implementations (affine and Jacobian
   coordinates) asserted to agree on every vector, anchored
   in-script BEFORE emitting vectors on go-ethereum's official
   precompile testdata — all 112 blsG1Add and 11 blsG1Mul rows
   reproduce under both implementations, every G1Mul input is
   verified in the subgroup, and the G1Add rows' one on-curve
   off-subgroup point (the testdata's own "wrong order" point)
   anchors the ADD/MSM subgroup contrast — and on the subgroup
   order itself (q * G is infinity and (q - 1) * G is -G,
   computed with NO scalar reduction). Computes locally; no
   chain is queried. */
const BLS_G1_P = 4002409555221667393417789825735904156556882819939007885332058136124031650490837864442687629129015664037894272559787n;
const BLS_G1_Q = 52435875175126190479447740508185965837690552500527637822603658699938581184513n;
function blsG1Mod(a) { const r = a % BLS_G1_P; return r < 0n ? r + BLS_G1_P : r; }
function blsG1OnCurve(x, y) {
  return blsG1Mod(y * y) === blsG1Mod(x * x * x + 4n);
}
function blsG1ValidPoint(x, y) {
  if (x >= BLS_G1_P || y >= BLS_G1_P) return false;
  if (x === 0n && y === 0n) return true; /* infinity encoding */
  return blsG1OnCurve(x, y);
}
function blsG1Add(p1, p2) {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  const [x1, y1] = p1, [x2, y2] = p2;
  let lam;
  if (x1 === x2) {
    if (blsG1Mod(y1 + y2) === 0n) return null;
    lam = blsG1Mod(3n * x1 * x1 * secpModPow(2n * y1, BLS_G1_P - 2n, BLS_G1_P));
  } else {
    lam = blsG1Mod((y2 - y1) * secpModPow(x2 - x1, BLS_G1_P - 2n, BLS_G1_P));
  }
  const x3 = blsG1Mod(lam * lam - x1 - x2);
  return [x3, blsG1Mod(lam * (x1 - x3) - y1)];
}
function blsG1Mul(k, point) {
  let result = null, addend = point, scalar = k;
  while (scalar > 0n) {
    if (scalar & 1n) result = blsG1Add(result, addend);
    addend = blsG1Add(addend, addend);
    scalar >>= 1n;
  }
  return result;
}
function blsG1Calc(opStr, x1Hex, y1Hex, aHex, bHex) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim();
  if (op !== "g1add" && op !== "g1msm") return null;
  const gas = op === "g1add" ? blsGasCalc("g1add", null) : blsGasCalc("g1msm", "1");
  if (gas === null) return null;
  const x1Bytes = parseHexBytes(x1Hex, 48);
  const y1Bytes = parseHexBytes(y1Hex, 48);
  const aBytes = parseHexBytes(aHex, op === "g1add" ? 48 : 32);
  if (x1Bytes === null || y1Bytes === null || aBytes === null) return null;
  let bBytes = null;
  if (op === "g1add") {
    bBytes = parseHexBytes(bHex, 48);
    if (bBytes === null) return null;
  }
  const failed = {
    precompile: op, address: gas.address, succeeded: "false",
    output: "0x", outputBytes: "0", totalGas: gas.totalGas
  };
  const x1 = bytesToBigInt(x1Bytes), y1 = bytesToBigInt(y1Bytes);
  if (!blsG1ValidPoint(x1, y1)) return failed;
  const p1 = (x1 === 0n && y1 === 0n) ? null : [x1, y1];
  let result;
  if (op === "g1add") {
    const x2 = bytesToBigInt(aBytes), y2 = bytesToBigInt(bBytes);
    if (!blsG1ValidPoint(x2, y2)) return failed;
    const p2 = (x2 === 0n && y2 === 0n) ? null : [x2, y2];
    result = blsG1Add(p1, p2);
  } else {
    /* EIP-2537: MSM inputs must be in the correct subgroup —
       q * P is infinity exactly for subgroup points. G1ADD
       above performs no such check. */
    if (p1 !== null && blsG1Mul(BLS_G1_Q, p1) !== null) return failed;
    result = blsG1Mul(bytesToBigInt(aBytes), p1);
  }
  return {
    precompile: op, address: gas.address, succeeded: "true",
    output: result === null
      ? "0x" + "00".repeat(128)
      : "0x" + result[0].toString(16).padStart(128, "0") + result[1].toString(16).padStart(128, "0"),
    outputBytes: "128", totalGas: gas.totalGas
  };
}

/* ---------- BLS12-381 G2 point arithmetic (G2ADD / one-pair G2MSM applied) ----------
   The applied counterpart of the BLS gas calculator above, for
   the G2 half of the family: that tool quotes G2ADD's flat 600
   and the MSM schedule from the pair count alone and does not
   read the points — this one takes the points (and, for the
   MSM, the scalar) and runs the G2 arithmetic itself, exactly
   as the precompiles at 0x0d and 0x0e do. Scope is stated
   plainly: G2ADD in full, and G2MSM for ONE point/scalar pair
   — the multiplication case, at the k = 1 price of exactly
   22,500 (the EIP-2537 G2 discount at k = 1 is 1000, so there
   is no separate MUL precompile); a multi-pair MSM is a sum of
   such multiplications under Pippenger's discount and stays
   gas-only here (the pairing check and the Fp2-to-G2
   field-to-curve map are run by their own tools below). The
   arithmetic lives in the quadratic
   extension field Fp2 = Fp[u] / (u^2 + 1): an element is the
   pair (c0, c1) read as c0 + c1*u, with multiplication
   (a0*b0 - a1*b1, a0*b1 + a1*b0) and inversion through the
   norm a0^2 + a1^2. G2 is the twist curve y^2 = x^3 + 4 + 4u
   over Fp2: the coefficient a is again 0, so the doubling
   slope is 3x^2 / 2y, as for G1 above — but the constant term
   is the Fp2 element (4, 4), not G1's plain 4. The encoding
   doubles G1's width: each Fp2 coordinate is two field
   elements, so a point is four 48-byte values carried in four
   64-byte field elements (top 16 bytes zero) — 256 bytes on
   the wire, in the order x.c0, x.c1, y.c0, y.c1; this page
   takes each component as its 48-byte value and returns the
   full 256-byte encoding. The point at infinity is written
   (0, 0, 0, 0) on input and output alike. The subgroup is the
   same prime order q as G1's, the twist's cofactor is not 1,
   and EIP-2537 splits the two operations exactly as it did
   for G1 — G2ADD performs NO subgroup check, so an on-curve
   point outside the subgroup adds like any other, while the
   MSM MUST check the subgroup (a point is in it exactly when
   q * P is infinity, computed here by the full multiplication
   with no scalar reduction) and a point outside it makes the
   MSM call FAIL. Validity otherwise mirrors G1's: a component
   at or above p, or a non-infinity point off the twist, in
   either position makes the precompile call fail — no output,
   and a failing BLS precompile call burns all the gas supplied
   to it, so the totalGas reported here is the scheduled charge
   from blsGasCalc (600 for G2ADD, the k = 1 MSM price of
   22,500) that a successful call pays, cross-checked against
   it in tests on every row. The MSM scalar is any 256-bit
   word, not required to be below q, and acts modulo q by the
   group law alone (q * P is infinity, (q + 1) * P is P — both
   pinned). Malformed input to THIS page is refused with null,
   as the other calculators refuse unparseable input: the
   operation must be g2add or g2msm and each field it reads
   must be exactly 48 bytes of hex (32 for the MSM scalar).
   For the MSM the second point's fields are never read at
   all, exactly as the gas tool never reads the pair count for
   the flat operations. Verified in the tests against an
   independent pure-Python oracle (oracle-bls-g2-calc.py)
   carrying TWO implementations over Fp2 (affine and Jacobian
   coordinates) asserted to agree on every vector, anchored
   in-script BEFORE emitting vectors on go-ethereum's official
   precompile testdata — all 112 blsG2Add and 11 blsG2Mul rows
   reproduce under both implementations, every G2Mul input is
   verified in the prime-order subgroup, and the G2Add rows
   are mined for an on-curve off-subgroup point that anchors
   the ADD/MSM subgroup contrast — and on the subgroup order
   itself (q * G is infinity and (q - 1) * G is -G, computed
   with NO scalar reduction). Computes locally; no chain is
   queried. */
const BLS_G2_P = BLS_G1_P;
const BLS_G2_Q = BLS_G1_Q;
function blsG2Mod(a) { const r = a % BLS_G2_P; return r < 0n ? r + BLS_G2_P : r; }
function blsG2FAdd(u, v) { return [blsG2Mod(u[0] + v[0]), blsG2Mod(u[1] + v[1])]; }
function blsG2FSub(u, v) { return [blsG2Mod(u[0] - v[0]), blsG2Mod(u[1] - v[1])]; }
function blsG2FMul(u, v) {
  return [blsG2Mod(u[0] * v[0] - u[1] * v[1]), blsG2Mod(u[0] * v[1] + u[1] * v[0])];
}
function blsG2FScal(u, k) { return [blsG2Mod(u[0] * k), blsG2Mod(u[1] * k)]; }
function blsG2FInv(u) {
  const norm = blsG2Mod(u[0] * u[0] + u[1] * u[1]);
  const ni = secpModPow(norm, BLS_G2_P - 2n, BLS_G2_P);
  return [blsG2Mod(u[0] * ni), blsG2Mod(-u[1] * ni)];
}
function blsG2FEq(u, v) { return u[0] === v[0] && u[1] === v[1]; }
function blsG2OnCurve(x, y) {
  const lhs = blsG2FMul(y, y);
  const rhs = blsG2FAdd(blsG2FMul(blsG2FMul(x, x), x), [4n, 4n]);
  return blsG2FEq(lhs, rhs);
}
function blsG2ValidPoint(x, y) {
  if (x[0] >= BLS_G2_P || x[1] >= BLS_G2_P || y[0] >= BLS_G2_P || y[1] >= BLS_G2_P) return false;
  if (x[0] === 0n && x[1] === 0n && y[0] === 0n && y[1] === 0n) return true; /* infinity encoding */
  return blsG2OnCurve(x, y);
}
function blsG2Add(p1, p2) {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  const [x1, y1] = p1, [x2, y2] = p2;
  let lam;
  if (blsG2FEq(x1, x2)) {
    if (blsG2FEq(blsG2FAdd(y1, y2), [0n, 0n])) return null;
    lam = blsG2FMul(blsG2FScal(blsG2FMul(x1, x1), 3n), blsG2FInv(blsG2FScal(y1, 2n)));
  } else {
    lam = blsG2FMul(blsG2FSub(y2, y1), blsG2FInv(blsG2FSub(x2, x1)));
  }
  const x3 = blsG2FSub(blsG2FSub(blsG2FMul(lam, lam), x1), x2);
  return [x3, blsG2FSub(blsG2FMul(lam, blsG2FSub(x1, x3)), y1)];
}
function blsG2Mul(k, point) {
  let result = null, addend = point, scalar = k;
  while (scalar > 0n) {
    if (scalar & 1n) result = blsG2Add(result, addend);
    addend = blsG2Add(addend, addend);
    scalar >>= 1n;
  }
  return result;
}
function blsG2Calc(opStr, x1aHex, x1bHex, y1aHex, y1bHex, aHex, bHex, cHex, dHex) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim();
  if (op !== "g2add" && op !== "g2msm") return null;
  const gas = op === "g2add" ? blsGasCalc("g2add", null) : blsGasCalc("g2msm", "1");
  if (gas === null) return null;
  const x1aBytes = parseHexBytes(x1aHex, 48);
  const x1bBytes = parseHexBytes(x1bHex, 48);
  const y1aBytes = parseHexBytes(y1aHex, 48);
  const y1bBytes = parseHexBytes(y1bHex, 48);
  const aBytes = parseHexBytes(aHex, op === "g2add" ? 48 : 32);
  if (x1aBytes === null || x1bBytes === null || y1aBytes === null || y1bBytes === null || aBytes === null) return null;
  let bBytes = null, cBytes = null, dBytes = null;
  if (op === "g2add") {
    bBytes = parseHexBytes(bHex, 48);
    cBytes = parseHexBytes(cHex, 48);
    dBytes = parseHexBytes(dHex, 48);
    if (bBytes === null || cBytes === null || dBytes === null) return null;
  }
  const failed = {
    precompile: op, address: gas.address, succeeded: "false",
    output: "0x", outputBytes: "0", totalGas: gas.totalGas
  };
  const x1 = [bytesToBigInt(x1aBytes), bytesToBigInt(x1bBytes)];
  const y1 = [bytesToBigInt(y1aBytes), bytesToBigInt(y1bBytes)];
  if (!blsG2ValidPoint(x1, y1)) return failed;
  const p1 = (x1[0] === 0n && x1[1] === 0n && y1[0] === 0n && y1[1] === 0n) ? null : [x1, y1];
  let result;
  if (op === "g2add") {
    const x2 = [bytesToBigInt(aBytes), bytesToBigInt(bBytes)];
    const y2 = [bytesToBigInt(cBytes), bytesToBigInt(dBytes)];
    if (!blsG2ValidPoint(x2, y2)) return failed;
    const p2 = (x2[0] === 0n && x2[1] === 0n && y2[0] === 0n && y2[1] === 0n) ? null : [x2, y2];
    result = blsG2Add(p1, p2);
  } else {
    /* EIP-2537: MSM inputs must be in the correct subgroup —
       q * P is infinity exactly for subgroup points. G2ADD
       above performs no such check. */
    if (p1 !== null && blsG2Mul(BLS_G2_Q, p1) !== null) return failed;
    result = blsG2Mul(bytesToBigInt(aBytes), p1);
  }
  return {
    precompile: op, address: gas.address, succeeded: "true",
    output: result === null
      ? "0x" + "00".repeat(256)
      : "0x" + result[0][0].toString(16).padStart(128, "0") + result[0][1].toString(16).padStart(128, "0") + result[1][0].toString(16).padStart(128, "0") + result[1][1].toString(16).padStart(128, "0"),
    outputBytes: "256", totalGas: gas.totalGas
  };
}

/* ---------- BLS12-381 multi-pair MSM (G1MSM / G2MSM applied) ----------
   The multi-pair half of the two MSM precompiles, closing the
   scope the two tools above state plainly: they run G1ADD /
   G2ADD in full and the MSM for ONE point/scalar pair — the
   multiplication case — while a multi-pair MSM "stays gas-only".
   This tool takes the precompiles' own input instead of separate
   fields: k repetitions of (point, scalar) — a G1 pair is 160
   bytes (a 128-byte point, then a 32-byte scalar) at 0x0c, a G2
   pair 288 bytes (a 256-byte point, then the scalar) at 0x0e —
   validates every point exactly as the one-pair tools do (a
   field element at or above p, which also catches nonzero top
   bytes, since those make the value >= 2^384 > p; a non-infinity
   point off the curve; and the MSM subgroup check, q * P computed
   by the full multiplication with no scalar reduction), and sums
   scalar * point over all pairs with the same point arithmetic.
   ANY bad pair fails the WHOLE call — no output, and a failing
   BLS call burns all gas supplied to it, so the totalGas here is
   the scheduled charge from blsGasCalc at that pair count
   (pairs x the single-multiplication cost x the EIP-2537
   discount / 1000, floored), cross-checked against it exactly in
   tests on every row. The discounts are the point of the MSM
   precompiles: at k = 2 a G1 pair already costs 949/1000 of the
   single price (22,776 for two pairs, not 24,000), and the
   schedule falls to 519/1000 past k = 128. Scalars are any
   256-bit words and act modulo q by the group law alone, across
   pairs as within one: (G, q - 1) + (G, 1) sums to infinity, and
   a zero scalar or an infinity point contributes nothing.
   Malformed input to THIS page is refused with null, as the
   other calculators refuse unparseable input: the operation
   must be g1msm or g2msm, the input must be hex whose length is
   a positive multiple of the pair size, and the pair count is
   capped at 16 as a stated page computation cap — the
   precompiles accept any count a caller's gas can pay for (the
   official testdata runs to k = 4,877), a client fails the call
   itself on a bad length where this page refuses it as
   malformed, and the gas tool above still prices any count.
   The pairing check (0x0f) — Fp12 / Miller-loop machinery
   of a different order — and the field-to-curve maps (0x10 and
   0x11) are run by the tools below. Verified in the tests against an independent
   pure-Python oracle (oracle-bls-msm.py) carrying affine AND
   Jacobian implementations for both curves, anchored in-script
   BEFORE emitting vectors on go-ethereum's official precompile
   testdata: the gas schedule reproduces the Gas field of all
   154 blsG1MultiExp and 153 blsG2MultiExp rows (k up to 4,877),
   every success row up to k = 6 (G1) / k = 3 (G2) reproduces
   under both implementations, with further rows under the
   Jacobian implementation (to k = 16 for G1, k = 6 for G2),
   and all 14 fail-blsG1MultiExp / fail-blsG2MultiExp
   rows fail under the semantics. Computes locally; no chain is
   queried. */
const BLS_MSM_MAX_PAIRS = 16;
function blsMsmCalc(opStr, inputHex) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim();
  if (op !== "g1msm" && op !== "g2msm") return null;
  const bytes = parseHexBytes(inputHex);
  if (bytes === null) return null;
  const pairBytes = op === "g1msm" ? 160 : 288;
  if (bytes.length === 0 || bytes.length % pairBytes !== 0) return null;
  const pairs = bytes.length / pairBytes;
  if (pairs > BLS_MSM_MAX_PAIRS) return null;
  const gas = blsGasCalc(op, String(pairs));
  if (gas === null) return null;
  const failed = {
    precompile: op, address: gas.address, pairs: String(pairs),
    discount: gas.discount, succeeded: "false",
    output: "0x", outputBytes: "0", totalGas: gas.totalGas
  };
  let total = null;
  if (op === "g1msm") {
    for (let i = 0; i < pairs; i++) {
      const off = i * 160;
      const x = bytesToBigInt(bytes.slice(off, off + 64));
      const y = bytesToBigInt(bytes.slice(off + 64, off + 128));
      const k = bytesToBigInt(bytes.slice(off + 128, off + 160));
      if (!blsG1ValidPoint(x, y)) return failed;
      const pt = (x === 0n && y === 0n) ? null : [x, y];
      if (pt !== null && blsG1Mul(BLS_G1_Q, pt) !== null) return failed;
      total = blsG1Add(total, pt === null || k === 0n ? null : blsG1Mul(k, pt));
    }
    return {
      precompile: op, address: gas.address, pairs: String(pairs),
      discount: gas.discount, succeeded: "true",
      output: total === null
        ? "0x" + "00".repeat(128)
        : "0x" + total[0].toString(16).padStart(128, "0") + total[1].toString(16).padStart(128, "0"),
      outputBytes: "128", totalGas: gas.totalGas
    };
  }
  for (let i = 0; i < pairs; i++) {
    const off = i * 288;
    const x = [bytesToBigInt(bytes.slice(off, off + 64)), bytesToBigInt(bytes.slice(off + 64, off + 128))];
    const y = [bytesToBigInt(bytes.slice(off + 128, off + 192)), bytesToBigInt(bytes.slice(off + 192, off + 256))];
    const k = bytesToBigInt(bytes.slice(off + 256, off + 288));
    if (!blsG2ValidPoint(x, y)) return failed;
    const pt = (x[0] === 0n && x[1] === 0n && y[0] === 0n && y[1] === 0n) ? null : [x, y];
    if (pt !== null && blsG2Mul(BLS_G2_Q, pt) !== null) return failed;
    total = blsG2Add(total, pt === null || k === 0n ? null : blsG2Mul(k, pt));
  }
  return {
    precompile: op, address: gas.address, pairs: String(pairs),
    discount: gas.discount, succeeded: "true",
    output: total === null
      ? "0x" + "00".repeat(256)
      : "0x" + total[0][0].toString(16).padStart(128, "0") + total[0][1].toString(16).padStart(128, "0") + total[1][0].toString(16).padStart(128, "0") + total[1][1].toString(16).padStart(128, "0"),
    outputBytes: "256", totalGas: gas.totalGas
  };
}

/* ---------- BLS12-381 MAP_FP_TO_G1 (field-to-curve map applied) ----------
   The applied half of the G1 map pair: blsGasCalc quotes
   MAP_FP_TO_G1's flat 5,500 at 0x10 from the operation name
   alone and never reads the field element, while the pairing
   check (0x0f) is run by the tool further below (Fp12 /
   Miller-loop machinery of a different order); the
   Fp2-to-G2 map (0x11) is run by the tool further below
   as well. This tool takes the
   precompile's own input — exactly one 64-byte field element:
   16 zero top bytes carrying a 48-byte value — and runs the
   construction in the EIP-2537 field-to-curve document:
     1. simplified SWU (the Shallue-van Woestijne-Ulas map in
        its Brier et al. / Wahby-Boneh simplified form) maps u
        to a point on the 11-isogenous curve
        E': y^2 = x^3 + A' x + B' with Z = 11 (non-square,
        != -1). It forms x1 from (-B/A)(1 + inv0(Z^2 u^4 +
        Z u^2)) — inv0(0) is 0, and the tv1 == 0 case (u = 0)
        is the exceptional branch, x1 = B / (Z A), whose gx1
        is square by the condition on Z — and x2 = Z u^2 x1;
        whichever of gx1, gx2 is square supplies (x, sqrt(g)),
        and the root is chosen so sgn0(y) == sgn0(u), where
        sgn0 is the parity (least significant bit) sign: that
        convention is pinned by the testdata anchor below —
        the alternative "greater than (p-1)/2" sign flips y on
        9 of the first 20 official rows. sqrt in Fp is
        a^((p+1)/4) because p % 4 == 3.
     2. the 11-isogeny map takes the point to G1 itself:
        x = x_num / x_den (degrees 11 / 10) and
        y = y' * y_num / y_den (degrees 15 / 15); a zero
        denominator returns the identity (infinity), per the
        document. The 53 isogeny constants were extracted
        PROGRAMMATICALLY from the EIP document, never
        hand-copied.
     3. the cofactor is cleared by multiplying by
        h_eff = 0xd201000000010001 with the hub's own G1
        multiplication, so the result lies in the prime-order
        subgroup (the oracle asserts q * P = infinity on every
        row) — this is a map INTO the subgroup, not just onto
        the curve.
   Two consequences are pinned in tests: map(-u) = -map(u)
   (the SWU x depends on u^2 alone, and sgn0 flips under
   negation because p is odd), and u = 0 maps through the
   exceptional branch to a fixed non-infinity point. The
   failure mode is a FAILED CALL, as for the other BLS tools:
   a value at or above p — which any nonzero top byte forces,
   since that makes the value at least 2^384 — returns
   succeeded=false with no output, priced at the scheduled
   charge cross-checked against blsGasCalc exactly in tests
   (a failing BLS call burns all gas supplied to it, so the
   scheduled charge is what a successful call pays).
   Malformed input to THIS page is refused with null, as the
   other calculators refuse unparseable input: the input must
   be exactly 64 bytes of hex — a client fails the call itself
   on a wrong length, where this page refuses it as malformed,
   exactly as the official fail testdata splits the two cases.
   Prefill is u = 1, mapping to
   (0x10733111...88b908, 0x34d6e375...06d45) at 5,500.
   Verified in the tests against an independent pure-Python
   oracle (oracle-bls-map-g1.py) anchored in-script BEFORE
   emitting vectors on go-ethereum's official precompile
   testdata — all 105 blsMapG1 rows reproduce exactly, with
   the SWU point asserted on E', the isogeny image and the
   cleared point asserted on G1, and the cleared point
   asserted in the subgroup, on every row; the fail testdata's
   wrong-length rows classify as page-malformed and its
   top-bytes / at-or-above-p rows fail the call. Computes
   locally; no chain is queried. */
const BLS_MAP_G1_APR = 0x144698a3b8e9433d693a02c96d4982b0ea985383ee66a8d8e8981aefd881ac98936f8da0e0f97f5cf428082d584c1dn;
const BLS_MAP_G1_BPR = 0x12e2908d11688030018b12e8753eee3b2016c1f0f24f4070a0b9c14fcef35ef55a23215a316ceaa5d1cc48e98e172be0n;
const BLS_MAP_G1_H_EFF = 0xd201000000010001n;
const BLS_MAP_G1_K1 = [0x6e08c248e260e70bd1e962381edee3d31d79d7e22c837bc23c0bf1bc24c6b68c24b1b80b64d391fa9c8ba2e8ba2d229n, 0x10321da079ce07e272d8ec09d2565b0dfa7dccdde6787f96d50af36003b14866f69b771f8c285decca67df3f1605fb7bn, 0x169b1f8e1bcfa7c42e0c37515d138f22dd2ecb803a0c5c99676314baf4bb1b7fa3190b2edc0327797f241067be390c9en, 0x80d3cf1f9a78fc47b90b33563be990dc43b756ce79f5574a2c596c928c5d1de4fa295f296b74e956d71986a8497e317n, 0x17b81e7701abdbe2e8743884d1117e53356de5ab275b4db1a682c62ef0f2753339b7c8f8c8f475af9ccb5618e3f0c88en, 0xd6ed6553fe44d296a3726c38ae652bfb11586264f0f8ce19008e218f9c86b2a8da25128c1052ecaddd7f225a139ed84n, 0x1630c3250d7313ff01d1201bf7a74ab5db3cb17dd952799b9ed3ab9097e68f90a0870d2dcae73d19cd13c1c66f652983n, 0xe99726a3199f4436642b4b3e4118e5499db995a1257fb3f086eeb65982fac18985a286f301e77c451154ce9ac8895d9n, 0x1778e7166fcc6db74e0609d307e55412d7f5e4656a8dbf25f1b33289f1b330835336e25ce3107193c5b388641d9b6861n, 0xd54005db97678ec1d1048c5d10a9a1bce032473295983e56878e501ec68e25c958c3e3d2a09729fe0179f9dac9edcb0n, 0x17294ed3e943ab2f0588bab22147a81c7c17e75b2f6a8417f565e33c70d1e86b4838f2a6f318c356e834eef1b3cb83bbn, 0x11a05f2b1e833340b809101dd99815856b303e88a2d7005ff2627b56cdb4e2c85610c2d5f2e62d6eaeac1662734649b7n];
const BLS_MAP_G1_K2 = [0x1n, 0x95fc13ab9e92ad4476d6e3eb3a56680f682b4ee96f7d03776df533978f31c1593174e4b4b7865002d6384d168ecdd0an, 0xa10ecf6ada54f825e920b3dafc7a3cce07f8d1d7161366b74100da67f39883503826692abba43704776ec3a79a1d641n, 0x14a7ac2a9d64a8b230b3f5b074cf01996e7f63c21bca68a81996e1cdf9822c580fa5b9489d11e2d311f7d99bbdcc5a5en, 0x772caacf16936190f3e0c63e0596721570f5799af53a1894e2e073062aede9cea73b3538f0de06cec2574496ee84a3an, 0xe7355f8e4e667b955390f7f0506c6e9395735e9ce9cad4d0a43bcef24b8982f7400d24bc4228f11c02df9a29f6304a5n, 0x13a8e162022914a80a6f1d5f43e7a07dffdfc759a12062bb8d6b44e833b306da9bd29ba81f35781d539d395b3532a21en, 0x3425581a58ae2fec83aafef7c40eb545b08243f16b1655154cca8abc28d6fd04976d5243eecf5c4130de8938dc62cd8n, 0xb2962fe57a3225e8137e629bff2991f6f89416f5a718cd1fca64e00b11aceacd6a3d0967c94fedcfcc239ba5cb83e19n, 0x12561a5deb559c4348b4711298e536367041e8ca0cf0800c0126c2588c48bf5713daa8846cb026e9e5c8276ec82b3bffn, 0x8ca8d548cff19ae18b2e62f4bd3fa6f01d5ef4ba35b48ba9c9588617fc8ac62b558d681be343df8993cf9fa40d21b1cn];
const BLS_MAP_G1_K3 = [0x15e6be4e990f03ce4ea50b3b42df2eb5cb181d8f84965a3957add4fa95af01b2b665027efec01c7704b456be69c8b604n, 0x5c129645e44cf1102a159f748c4a3fc5e673d81d7e86568d9ab0f5d396a7ce46ba1049b6579afb7866b1e715475224bn, 0x245a394ad1eca9b72fc00ae7be315dc757b3b080d4c158013e6632d3c40659cc6cf90ad1c232a6442d9d3f5db980133n, 0xb182cac101b9399d155096004f53f447aa7b12a3426b08ec02710e807b4633f06c851c1919211f20d4c04f00b971ef8n, 0x18b46a908f36f6deb918c143fed2edcc523559b8aaf0c2462e6bfe7f911f643249d9cdf41b44d606ce07c8a4d0074d8en, 0x19713e47937cd1be0dfd0b8f1d43fb93cd2fcbcb6caf493fd1183e416389e61031bf3a5cce3fbafce813711ad011c132n, 0xe1bba7a1186bdb5223abde7ada14a23c42a0ca7915af6fe06985e7ed1e4d43b9b3f7055dd4eba6f2bafaaebca731c30n, 0x9fc4018bd96684be88c9e221e4da1bb8f3abd16679dc26c1e8b6e6a1f20cabe69d65201c78607a360370e577bdba587n, 0x987c8d5333ab86fde9926bd2ca6c674170a05bfe3bdd81ffd038da6c26c842642f64550fedfe935a15e4ca31870fb29n, 0x4ab0b9bcfac1bbcb2c977d027796b3ce75bb8ca2be184cb5231413c4d634f3747a87ac2460f415ec961f8855fe9d6f2n, 0x16603fca40634b6a2211e11db8f0a6a074a7d0d4afadb7bd76505c3d3ad5544e203f6326c95a807299b23ab13633a5f0n, 0x8cc03fdefe0ff135caf4fe2a21529c4195536fbe3ce50b879833fd221351adc2ee7f8dc099040a841b6daecf2e8fedbn, 0x1f86376e8981c217898751ad8746757d42aa7b90eeb791c09e4a3ec03251cf9de405aba9ec61deca6355c77b0e5f4cbn, 0xcc786baa966e66f4a384c86a3b49942552e2d658a31ce2c344be4b91400da7d26d521628b00523b8dfe240c72de1f6n, 0x134996a104ee5811d51036d776fb46831223e96c254f383d0f906343eb67ad34d6c56711962fa8bfe097e75a2e41c696n, 0x90d97c81ba24ee0259d1f094980dcfa11ad138e48a869522b52af6c956543d3cd0c7aee9b3ba3c2be9845719707bb33n];
const BLS_MAP_G1_K4 = [0x1n, 0xe0fa1d816ddc03e6b24255e0d7819c171c40f65e273b853324efcd6356caa205ca2f570f13497804415473a1d634b8fn, 0x2660400eb2e4f3b628bdd0d53cd76f2bf565b94e72927c1cb748df27942480e420517bd8714cc80d1fadc1326ed06f7n, 0xad6b9514c767fe3c3613144b45f1496543346d98adf02267d5ceef9a00d9b8693000763e3b90ac11e99b138573345ccn, 0xaccbb67481d033ff5852c1e48c50c477f94ff8aefce42d28c0f9a88cea7913516f968986f7ebbea9684b529e2561092n, 0x4d2f259eea405bd48f010a01ad2911d9c6dd039bb61a6290e591b36e636a5c871a5c29f4f83060400f8b49cba8f6aa8n, 0x167a55cda70a6e1cea820597d94a84903216f763e13d87bb5308592e7ea7d4fbc7385ea3d529b35e346ef48bb8913f55n, 0x1866c8ed336c61231a1be54fd1d74cc4f9fb0ce4c6af5920abc5750c4bf39b4852cfe2f7bb9248836b233d9d55535d4an, 0x16a3ef08be3ea7ea03bcddfabba6ff6ee5a4375efa1f4fd7feb34fd206357132b920f5b00801dee460ee415a15812ed9n, 0x166007c08a99db2fc3ba8734ace9824b5eecfdfa8d0cf8ef5dd365bc400a0051d5fa9c01a58b1fb93d1a1399126a775cn, 0x8d9e5297186db2d9fb266eaac783182b70152c65550d881c5ecd87b6f0f5a6449f38db9dfa9cce202c6477faaf9b7acn, 0xbe0e079545f43e4b00cc912f8228ddcc6d19c9f0f69bbb0542eda0fc9dec916a20b15dc0fd2ededda39142311a5001dn, 0x16b7d288798e5395f20d23bf89edb4d1d115c5dbddbcd30e123da489e726af41727364f2c28297ada8d26d98445f5416n, 0x58df3306640da276faaae7d6e8eb15778c4855551ae7f310c35a5dd279cd2eca6757cd636f96f891e2538b53dbf67f2n, 0x1962d75c2381201e1a0cbd6c43c348b885c84ff731c4d59ca4a10356f453e01f78a4260763529e3532f6102c2e49a03dn, 0x16112c4c3a9c98b252181140fad0eae9601a6de578980be6eec3232b5be72e7a07f3688ef60c206d01479253b03663c1n];
function blsMapG1Poly(coeffs, x) {
  let r = 0n;
  for (const c of coeffs) r = blsG1Mod(r * x + c);
  return r;
}
function blsMapG1Calc(inputHex) {
  const bytes = parseHexBytes(inputHex, 64);
  if (bytes === null) return null;
  const gas = blsGasCalc("map-fp-to-g1", null);
  if (gas === null) return null;
  const failed = {
    precompile: "mapg1", address: gas.address, succeeded: "false",
    output: "0x", outputBytes: "0", totalGas: gas.totalGas
  };
  const u = bytesToBigInt(bytes);
  if (u >= BLS_G1_P) return failed;
  const Z = 11n;
  const inv = a => secpModPow(a, BLS_G1_P - 2n, BLS_G1_P);
  const arg = blsG1Mod(Z * Z * u ** 4n + Z * u * u);
  const tv1 = arg === 0n ? 0n : inv(arg);
  let x1 = blsG1Mod(blsG1Mod(-BLS_MAP_G1_BPR * inv(BLS_MAP_G1_APR)) * (1n + tv1));
  if (tv1 === 0n) x1 = blsG1Mod(BLS_MAP_G1_BPR * inv(blsG1Mod(Z * BLS_MAP_G1_APR)));
  const gx1 = blsG1Mod(x1 * x1 * x1 + BLS_MAP_G1_APR * x1 + BLS_MAP_G1_BPR);
  const x2 = blsG1Mod(Z * u * u * x1);
  const gx2 = blsG1Mod(x2 * x2 * x2 + BLS_MAP_G1_APR * x2 + BLS_MAP_G1_BPR);
  const gx1Square = gx1 === 0n || secpModPow(gx1, (BLS_G1_P - 1n) / 2n, BLS_G1_P) === 1n;
  const xp = gx1Square ? x1 : x2;
  let yp = secpModPow(gx1Square ? gx1 : gx2, (BLS_G1_P + 1n) / 4n, BLS_G1_P);
  if ((u & 1n) !== (yp & 1n)) yp = blsG1Mod(-yp);
  const xDen = blsMapG1Poly(BLS_MAP_G1_K2, xp);
  const yDen = blsMapG1Poly(BLS_MAP_G1_K4, xp);
  let pt = null;
  if (xDen !== 0n && yDen !== 0n) {
    pt = [blsG1Mod(blsMapG1Poly(BLS_MAP_G1_K1, xp) * inv(xDen)),
          blsG1Mod(yp * blsMapG1Poly(BLS_MAP_G1_K3, xp) * inv(yDen))];
  }
  const result = pt === null ? null : blsG1Mul(BLS_MAP_G1_H_EFF, pt);
  return {
    precompile: "mapg1", address: gas.address, succeeded: "true",
    output: result === null
      ? "0x" + "00".repeat(128)
      : "0x" + result[0].toString(16).padStart(128, "0") + result[1].toString(16).padStart(128, "0"),
    outputBytes: "128", totalGas: gas.totalGas
  };
}

/* ---------- BLS12-381 MAP_FP2_TO_G2 (field-to-curve map applied) ----------
   The applied half of the G2 map pair, closing the BLS map
   family: blsGasCalc quotes MAP_FP2_TO_G2's flat 23,800 at
   0x11 from the operation name alone and never reads the
   element, while the pairing check (0x0f) is run by the
   tool below (Fp12 / Miller-loop machinery of a different
   order). This
   tool takes the precompile's own input — exactly one Fp2
   element, 128 bytes: two 64-byte field elements (16 zero top
   bytes carrying a 48-byte value each), read (c0, c1) as
   c0 + c1*u in Fp2 = Fp[u] / (u^2 + 1), the hub's G2
   convention — and runs the construction in the EIP-2537
   field-to-curve document, all in Fp2:
     1. simplified SWU in its AB == 0 form (the twist's own
        A is 0, so the map first lands on the 3-isogenous
        curve E': y^2 = x^3 + A' x + B' with A' = 240u,
        B' = 1012(1 + u) and Z = -(2 + u)): it forms x1 from
        (-B/A)(1 + inv0(Z^2 u^4 + Z u^2)) — inv0(0) is 0, and
        the tv1 == 0 case (u = 0 among others) is the
        exceptional branch, x1 = B / (Z A), whose gx1 is
        square by the condition on Z — and x2 = Z u^2 x1;
        whichever of gx1, gx2 is a square in Fp2 supplies
        (x, sqrt(g)), and the root is chosen so
        sgn0(y) == sgn0(u), where Fp2's sgn0 reads the c0
        component's parity when c0 != 0 and the c1
        component's otherwise (the Fp sign is the parity
        sign, as the G1 map's anchor pinned). Square roots
        in Fp2 are built from roots in Fp (a^((p+1)/4),
        since p % 4 == 3): with alpha = sqrt(c0^2 + c1^2),
        one of (c0 +/- alpha)/2 is a square in Fp, its root
        is the root's c0, and its c1 is c1 / (2 c0); an
        element with c1 == 0 roots inside Fp or as a pure-u
        element. Is-square in Fp2 is the Euler criterion
        a^((p^2 - 1)/2) == 1.
     2. the 3-isogeny map takes the point to the twist
        itself: x = x_num / x_den (degrees 3 / 2) and
        y = y' * y_num / y_den (degrees 3 / 3); a zero
        denominator returns the identity (infinity), per
        the document. The 12 isogeny constants were
        extracted PROGRAMMATICALLY from the EIP document,
        never hand-copied.
     3. the cofactor is cleared by multiplying by the
        document's h_eff (a 636-bit scalar) with the hub's
        own G2 multiplication, so the result lies in the
        prime-order subgroup (the oracle asserts
        q * P = infinity on every row) — a map INTO the
        subgroup, not just onto the twist.
   Two consequences are pinned in tests: map(-u) = -map(u)
   for inputs with c0 != 0 (the SWU x depends on u^2 alone,
   and sgn0 flips under negation because p is odd), and
   u = 0 maps through the exceptional branch to a fixed
   non-infinity point. The failure mode is a FAILED CALL,
   as for the other BLS tools: a component at or above p —
   which any nonzero top byte forces, since that makes the
   component at least 2^384 — returns succeeded=false with
   no output, priced at the scheduled charge cross-checked
   against blsGasCalc exactly in tests (a failing BLS call
   burns all gas supplied to it, so the scheduled charge is
   what a successful call pays). Malformed input to THIS
   page is refused with null, as the other calculators
   refuse unparseable input: the input must be exactly 128
   bytes of hex — a client fails the call itself on a wrong
   length, where this page refuses it as malformed, exactly
   as the official fail testdata splits the two cases.
   Prefill is u = 1 + 0u, mapping to the point whose x.c0
   is 0x1770d4f6...729976 at 23,800. The pairing check
   (0x0f) is run by the tool below, closing the family.
   Verified in the tests against an
   independent pure-Python oracle (oracle-bls-map-g2.py)
   anchored in-script BEFORE emitting vectors on
   go-ethereum's official precompile testdata — all 105
   blsMapG2 rows reproduce exactly, with the SWU point
   asserted on E', the isogeny image and the cleared point
   asserted on the twist, and the cleared point asserted
   in the subgroup, on every row; the fail testdata's
   wrong-length rows classify as page-malformed and its
   top-bytes / invalid-element rows fail the call.
   Computes locally; no chain is queried. */
const BLS_MAP_G2_Z = [BLS_G2_P - 2n, BLS_G2_P - 1n];
const BLS_MAP_G2_APR = [0n, 240n];
const BLS_MAP_G2_BPR = [1012n, 1012n];
const BLS_MAP_G2_H_EFF = 0xbc69f08f2ee75b3584c6a0ea91b352888e2a8e9145ad7689986ff031508ffe1329c2f178731db956d82bf015d1212b02ec0ec69d7477c1ae954cbc06689f6a359894c0adebbf6b4e8020005aaa95551n;
const BLS_MAP_G2_K1 = [[0x171d6541fa38ccfaed6dea691f5fb614cb14b4e7f4e810aa22d6108f142b85757098e38d0f671c7188e2aaaaaaaa5ed1n, 0x0n], [0x11560bf17baa99bc32126fced787c88f984f87adf7ae0c7f9a208c6b4f20a4181472aaa9cb8d555526a9ffffffffc71en, 0x8ab05f8bdd54cde190937e76bc3e447cc27c3d6fbd7063fcd104635a790520c0a395554e5c6aaaa9354ffffffffe38dn], [0x0n, 0x11560bf17baa99bc32126fced787c88f984f87adf7ae0c7f9a208c6b4f20a4181472aaa9cb8d555526a9ffffffffc71an], [0x5c759507e8e333ebb5b7a9a47d7ed8532c52d39fd3a042a88b58423c50ae15d5c2638e343d9c71c6238aaaaaaaa97d6n, 0x5c759507e8e333ebb5b7a9a47d7ed8532c52d39fd3a042a88b58423c50ae15d5c2638e343d9c71c6238aaaaaaaa97d6n]];
const BLS_MAP_G2_K2 = [[0x1n, 0x0n], [0xcn, 0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaa9fn], [0x0n, 0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaa63n]];
const BLS_MAP_G2_K3 = [[0x124c9ad43b6cf79bfbf7043de3811ad0761b0f37a1e26286b0e977c69aa274524e79097a56dc4bd9e1b371c71c718b10n,0x0n],[0x11560bf17baa99bc32126fced787c88f984f87adf7ae0c7f9a208c6b4f20a4181472aaa9cb8d555526a9ffffffffc71cn,0x8ab05f8bdd54cde190937e76bc3e447cc27c3d6fbd7063fcd104635a790520c0a395554e5c6aaaa9354ffffffffe38fn],[0x0n,0x5c759507e8e333ebb5b7a9a47d7ed8532c52d39fd3a042a88b58423c50ae15d5c2638e343d9c71c6238aaaaaaaa97ben],[0x1530477c7ab4113b59a4c18b076d11930f7da5d4a07f649bf54439d87d27e500fc8c25ebf8c92f6812cfc71c71c6d706n,0x1530477c7ab4113b59a4c18b076d11930f7da5d4a07f649bf54439d87d27e500fc8c25ebf8c92f6812cfc71c71c6d706n]];
const BLS_MAP_G2_K4 = [[0x1n, 0x0n], [0x12n, 0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaa99n], [0x0n, 0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffa9d3n], [0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffa8fbn, 0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffa8fbn]];
function blsMapG2FDiv(a, b) { return blsG2FMul(a, blsG2FInv(b)); }
function blsMapG2Pow(a, e) {
  let r = [1n, 0n], b = a, exp = e;
  while (exp > 0n) {
    if (exp & 1n) r = blsG2FMul(r, b);
    b = blsG2FMul(b, b);
    exp >>= 1n;
  }
  return r;
}
function blsMapG2IsSquare(a) {
  if (a[0] === 0n && a[1] === 0n) return true;
  const r = blsMapG2Pow(a, (BLS_G2_P * BLS_G2_P - 1n) / 2n);
  return r[0] === 1n && r[1] === 0n;
}
function blsMapG2Sqrt(a) {
  if (a[0] === 0n && a[1] === 0n) return [0n, 0n];
  const sqrtFp = v => secpModPow(v, (BLS_G2_P + 1n) / 4n, BLS_G2_P);
  if (a[1] === 0n) {
    if (a[0] === 0n || secpModPow(a[0], (BLS_G2_P - 1n) / 2n, BLS_G2_P) === 1n) return [sqrtFp(a[0]), 0n];
    return [0n, sqrtFp(blsG2Mod(-a[0]))];
  }
  const alpha = sqrtFp(blsG2Mod(a[0] * a[0] + a[1] * a[1]));
  const inv2 = (BLS_G2_P + 1n) / 2n;
  for (const cand of [blsG2Mod(a[0] + alpha), blsG2Mod(a[0] - alpha)]) {
    const half = blsG2Mod(cand * inv2);
    if (half === 0n || secpModPow(half, (BLS_G2_P - 1n) / 2n, BLS_G2_P) === 1n) {
      const x0 = sqrtFp(half);
      const x1 = blsG2Mod(a[1] * secpModPow(blsG2Mod(2n * x0), BLS_G2_P - 2n, BLS_G2_P));
      return [x0, x1];
    }
  }
  return null; /* unreachable: only called on squares */
}
function blsMapG2Sgn0(x) { return x[0] !== 0n ? (x[0] & 1n) : (x[1] & 1n); }
function blsMapG2Poly(coeffs, x) {
  let r = [0n, 0n];
  for (const c of coeffs) r = blsG2FAdd(blsG2FMul(r, x), c);
  return r;
}
function blsMapG2Calc(inputHex) {
  const bytes = parseHexBytes(inputHex, 128);
  if (bytes === null) return null;
  const gas = blsGasCalc("map-fp2-to-g2", null);
  if (gas === null) return null;
  const failed = {
    precompile: "mapg2", address: gas.address, succeeded: "false",
    output: "0x", outputBytes: "0", totalGas: gas.totalGas
  };
  const u = [bytesToBigInt(bytes.slice(0, 64)), bytesToBigInt(bytes.slice(64, 128))];
  if (u[0] >= BLS_G2_P || u[1] >= BLS_G2_P) return failed;
  const u2 = blsG2FMul(u, u);
  const arg = blsG2FAdd(
    blsG2FMul(blsG2FMul(BLS_MAP_G2_Z, BLS_MAP_G2_Z), blsG2FMul(u2, u2)),
    blsG2FMul(BLS_MAP_G2_Z, u2));
  const argZero = arg[0] === 0n && arg[1] === 0n;
  const tv1 = argZero ? [0n, 0n] : blsG2FInv(arg);
  let x1 = blsG2FMul(
    blsG2FSub([0n, 0n], blsMapG2FDiv(BLS_MAP_G2_BPR, BLS_MAP_G2_APR)),
    blsG2FAdd([1n, 0n], tv1));
  if (argZero) x1 = blsMapG2FDiv(BLS_MAP_G2_BPR, blsG2FMul(BLS_MAP_G2_Z, BLS_MAP_G2_APR));
  const gOf = x => blsG2FAdd(
    blsG2FAdd(blsG2FMul(blsG2FMul(x, x), x), blsG2FMul(BLS_MAP_G2_APR, x)),
    BLS_MAP_G2_BPR);
  const gx1 = gOf(x1);
  const x2 = blsG2FMul(blsG2FMul(BLS_MAP_G2_Z, u2), x1);
  const gx1Square = blsMapG2IsSquare(gx1);
  const xp = gx1Square ? x1 : x2;
  let yp = blsMapG2Sqrt(gx1Square ? gx1 : gOf(x2));
  if (blsMapG2Sgn0(u) !== blsMapG2Sgn0(yp)) yp = blsG2FSub([0n, 0n], yp);
  const xDen = blsMapG2Poly(BLS_MAP_G2_K2, xp);
  const yDen = blsMapG2Poly(BLS_MAP_G2_K4, xp);
  let pt = null;
  if (!(xDen[0] === 0n && xDen[1] === 0n) && !(yDen[0] === 0n && yDen[1] === 0n)) {
    pt = [blsMapG2FDiv(blsMapG2Poly(BLS_MAP_G2_K1, xp), xDen),
          blsMapG2FDiv(blsG2FMul(yp, blsMapG2Poly(BLS_MAP_G2_K3, xp)), yDen)];
  }
  const result = pt === null ? null : blsG2Mul(BLS_MAP_G2_H_EFF, pt);
  return {
    precompile: "mapg2", address: gas.address, succeeded: "true",
    output: result === null
      ? "0x" + "00".repeat(256)
      : "0x" + result[0][0].toString(16).padStart(128, "0") + result[0][1].toString(16).padStart(128, "0") + result[1][0].toString(16).padStart(128, "0") + result[1][1].toString(16).padStart(128, "0"),
    outputBytes: "256", totalGas: gas.totalGas
  };
}

/* ---------- BLS12-381 pairing check (EIP-2537, applied) ----------
   The applied half of the last BLS precompile: blsGasCalc
   quotes the pairing check's 37,700 + 32,600 per pair from
   the pair count alone and never reads a point; the G1/G2,
   MSM and map tools above run their arithmetic and leave
   this one out, because its arithmetic is of a different
   order — Fp12 extension-field work and a Miller loop. This
   tool runs it. It takes the precompile's own input — k
   repetitions of (G1 point, G2 point), 384 bytes per pair in
   the EIP-2537 encoding (the G1 point's two 64-byte field
   elements, then the G2 point's four) — and decides the
   statement EIP-2537 defines: the product of the pairings
   e(ai, bi) is the identity, returning the 32-byte word
   holding 1 when it holds and 0 when it does not.
   Validation is the family's strictest, and both subgroup
   checks are the deliberate contrast with the ADD tools
   above: EVERY point must be in the prime-order subgroup —
   a field element at or above p fails (which also catches
   nonzero top bytes, since those make the value at least
   2^384), a non-infinity point off its curve fails, and an
   on-curve point with q * P != infinity fails, for G1
   exactly as for G2 (checked here by the full
   multiplications, no scalar reduction). Any bad pair fails
   the WHOLE call at the scheduled charge cross-checked
   against blsGasCalc exactly on every row (a failing BLS
   call burns all gas supplied to it, so the scheduled
   charge is what a successful call pays). A pair with an
   infinity in either position contributes the identity.
   Two further traps are pinned. The first is the empty
   input: unlike the alt_bn128 pairing check above, whose
   empty product succeeds and returns 1, EIP-2537 makes an
   empty pairing input FAIL — returned here as a failed call
   at the 37,700 base (the gas tool above refuses a count of
   0 as its own input rule, so that one row prices from the
   EIP's formula directly). The second is the Fp2 word
   order: a G2 element is written c0 first, then c1 — the
   opposite of EIP-197's imaginary-first order for
   alt_bn128 — and the official rows pin it, since the
   generator only lies on the twist read this way.
   The arithmetic mirrors the alt_bn128 pairing tool's
   shape on the BLS tower: Fp12 is the degree-12 polynomial
   extension with w^12 = 2 w^6 - 2; the twist point is
   carried into Fp12 by the field isomorphism (c0 + c1 i
   maps to (c0 - c1) + c1 w^6), held projectively as
   (embed(x) * w, embed(y), w^3), whose affine point
   (embed(x) / w^2, embed(y) / w^3) lies on y^2 = x^3 + 4
   itself. The Miller loop runs the ate loop count
   15132376222941642752 (the curve's |x| parameter) in its
   plain binary encoding — the loop starts from R = Q, the
   encoding's top bit (bit 63) being 1 and implicit, and
   consumes bits 62..0; there are no signed digits and no
   Frobenius correction steps for this curve (the steps in
   many specifications are, in py_ecc's own note on its
   pairing code, lines that "technically do nothing" here).
   Line functions are tracked as numerator / denominator
   pairs so exactly one Fp12 inversion — by the polynomial
   extended Euclidean algorithm — is needed, and the final
   exponentiation splits into the Frobenius easy part
   f^((p^6 - 1)(p^2 + 1)) and the hard part
   f^((p^4 - p^2 + 1) / q) by square-and-multiply, exactly
   as the alt_bn128 tool splits its own. Pairs are capped
   at 16 as a stated page computation cap — the precompile
   accepts any count a caller's gas can pay for and the gas
   calculator above still prices beyond it; a client fails
   the call itself on a length that is not a multiple of
   384, where this page refuses it as malformed, as on every
   tool. Nothing on this page remains gas-only after this
   tool: the KZG point evaluation (0x0a) is run by its own
   applied calculator (tool 113). Verified
   against an independent oracle (oracle-bls-pairing.py) in
   two parts asserted to agree on every row: py_ecc, the
   Ethereum Foundation's bls12_381 library, with EIP-2537's
   subgroup checks added explicitly, and a pure-Python
   prototype of this exact algorithm — both reproducing all
   106 rows of go-ethereum's official blsPairing testdata
   (results and EIP-2537 prices) and classifying all 9
   fail-blsPairing rows, with the anchors asserted in-script
   before emitting (Euclid inverse == Fermat inverse,
   Frobenius == x^p and x^(p^6), the twisted generator on
   the Fp12 curve, fast final exponentiation == the naive
   (p^12 - 1) / q power, and bilinearity e(2G, 3G2) ==
   e(G, 6G2) != 1). Computes locally; no chain is queried,
   nothing is called. */
const BLS_PAIRING_MAX_PAIRS = 16;
const BLS_ATE_PSEUDO = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1
];
/* Fp12 helpers: an element is 12 coefficients [c0..c11] of
   1, w, ..., w^11 with w^12 = 2 w^6 - 2 */
function blsPrF12Zero() { return [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]; }
function blsPrF12One() { const o = blsPrF12Zero(); o[0] = 1n; return o; }
function blsPrF12Add(a, b) { return a.map((v, i) => blsG1Mod(v + b[i])); }
function blsPrF12Sub(a, b) { return a.map((v, i) => blsG1Mod(v - b[i])); }
function blsPrF12Smul(a, s) { return a.map((v) => blsG1Mod(v * s)); }
function blsPrF12Eq(a, b) { return a.every((v, i) => blsG1Mod(v - b[i]) === 0n); }
function blsPrF12IsZero(a) { return a.every((v) => blsG1Mod(v) === 0n); }
function blsPrF12Mul(a, b) {
  const t = new Array(23).fill(0n);
  for (let i = 0; i < 12; i++) {
    if (a[i] === 0n) continue;
    for (let j = 0; j < 12; j++) {
      if (b[j] === 0n) continue;
      t[i + j] = blsG1Mod(t[i + j] + a[i] * b[j]);
    }
  }
  for (let k = 22; k >= 12; k--) {
    const c = blsG1Mod(t[k]);
    if (c === 0n) continue;
    t[k - 6] = blsG1Mod(t[k - 6] + 2n * c);
    t[k - 12] = blsG1Mod(t[k - 12] - 2n * c);
  }
  return t.slice(0, 12);
}
function blsPrF12Pow(a, e) {
  let result = blsPrF12One(), base = a, exp = e;
  while (exp > 0n) {
    if (exp & 1n) result = blsPrF12Mul(result, base);
    base = blsPrF12Mul(base, base);
    exp >>= 1n;
  }
  return result;
}
/* Polynomial helpers over Fp (coefficient lists, low to high)
   for the Fp12 inverse: the modulus is w^12 - 2 w^6 + 2 */
const BLS_PR_MOD12 = [2n, 0n, 0n, 0n, 0n, 0n, BLS_G1_P - 2n, 0n, 0n, 0n, 0n, 0n, 1n];
function blsPrPolyTrim(a) {
  const out = a.map((v) => blsG1Mod(v));
  while (out.length > 1 && out[out.length - 1] === 0n) out.pop();
  return out;
}
function blsPrPolyDivmod(aIn, bIn) {
  let a = blsPrPolyTrim(aIn.slice());
  const b = blsPrPolyTrim(bIn.slice());
  if (a.length < b.length) return [[0n], a];
  const q = new Array(a.length - b.length + 1).fill(0n);
  const invLead = secpModPow(b[b.length - 1], BLS_G1_P - 2n, BLS_G1_P);
  while (a.length >= b.length && !(a.length === 1 && a[0] === 0n)) {
    const d = a.length - b.length;
    const c = blsG1Mod(a[a.length - 1] * invLead);
    q[d] = c;
    for (let j = 0; j < b.length; j++) a[d + j] = blsG1Mod(a[d + j] - c * b[j]);
    a = blsPrPolyTrim(a);
  }
  return [blsPrPolyTrim(q), a];
}
function blsPrPolyMod(a) {
  const t = blsPrPolyTrim(a.slice());
  if (t.length < 13) {
    const out = t.slice();
    while (out.length < 12) out.push(0n);
    return out;
  }
  const r = blsPrPolyDivmod(t, BLS_PR_MOD12)[1];
  const out = r.slice();
  while (out.length < 12) out.push(0n);
  return out;
}
function blsPrPolyMulMod(a, b) {
  const t = new Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) {
    if (blsG1Mod(a[i]) === 0n) continue;
    for (let j = 0; j < b.length; j++) {
      t[i + j] = blsG1Mod(t[i + j] + a[i] * b[j]);
    }
  }
  return blsPrPolyMod(t);
}
function blsPrF12Inv(a) {
  let oldR = BLS_PR_MOD12.slice(), r = blsPrPolyTrim(a.slice());
  let oldS = [0n], s = [1n];
  while (r.length > 1) {
    const dm = blsPrPolyDivmod(oldR, r);
    oldR = r; r = dm[1];
    const qs = blsPrPolyMulMod(dm[0], s);
    const newS = [];
    for (let i = 0; i < 12; i++) {
      newS.push(blsG1Mod((i < oldS.length ? oldS[i] : 0n) - (i < qs.length ? qs[i] : 0n)));
    }
    oldS = s; s = blsPrPolyMod(newS);
  }
  const invC = secpModPow(r[0], BLS_G1_P - 2n, BLS_G1_P);
  return blsPrPolyMod(s).map((v) => blsG1Mod(v * invC));
}
/* Frobenius: (sum ci w^i)^p = sum ci (w^p)^i, the ci being in
   Fp and so fixed. Powers of w^p are computed once, lazily. */
let BLS_PR_WPOW = null;
function blsPrF12FrobInit() {
  if (BLS_PR_WPOW !== null) return;
  const W = blsPrF12Zero(); W[1] = 1n;
  const WP = blsPrF12Pow(W, BLS_G1_P);
  BLS_PR_WPOW = [blsPrF12One()];
  for (let i = 0; i < 11; i++) BLS_PR_WPOW.push(blsPrF12Mul(BLS_PR_WPOW[i], WP));
}
function blsPrF12Frob(a) {
  blsPrF12FrobInit();
  let out = blsPrF12Zero();
  for (let i = 0; i < 12; i++) {
    if (a[i] !== 0n) out = blsPrF12Add(out, blsPrF12Smul(BLS_PR_WPOW[i], a[i]));
  }
  return out;
}
function blsPrF12FrobPow(a, k) {
  let wk = blsPrF12Zero(); wk[1] = 1n;
  for (let j = 0; j < k; j++) wk = blsPrF12Frob(wk);
  const powers = [blsPrF12One()];
  for (let i = 0; i < 11; i++) powers.push(blsPrF12Mul(powers[i], wk));
  let out = blsPrF12Zero();
  for (let i = 0; i < 12; i++) {
    if (a[i] !== 0n) out = blsPrF12Add(out, blsPrF12Smul(powers[i], a[i]));
  }
  return out;
}
/* Projective point arithmetic over Fp12 (the add-2007 /
   dbl formulas for a = 0, in homogeneous (x/z, y/z) form);
   a point is [x, y, z] of Fp12 elements, z = 0 is infinity. */
function blsPrP12Double(pt) {
  const [x, y, z] = pt;
  const W = blsPrF12Smul(blsPrF12Mul(x, x), 3n);
  const S = blsPrF12Mul(y, z);
  const B = blsPrF12Mul(blsPrF12Mul(x, y), S);
  const H = blsPrF12Sub(blsPrF12Mul(W, W), blsPrF12Smul(B, 8n));
  const S2 = blsPrF12Mul(S, S);
  const nx = blsPrF12Smul(blsPrF12Mul(H, S), 2n);
  const ny = blsPrF12Sub(
    blsPrF12Mul(W, blsPrF12Sub(blsPrF12Smul(B, 4n), H)),
    blsPrF12Smul(blsPrF12Mul(blsPrF12Mul(y, y), S2), 8n));
  const nz = blsPrF12Smul(blsPrF12Mul(S, S2), 8n);
  return [nx, ny, nz];
}
function blsPrP12Add(p1, p2) {
  if (blsPrF12IsZero(p1[2])) return p2;
  if (blsPrF12IsZero(p2[2])) return p1;
  const [x1, y1, z1] = p1, [x2, y2, z2] = p2;
  const U1 = blsPrF12Mul(y2, z1), U2 = blsPrF12Mul(y1, z2);
  const V1 = blsPrF12Mul(x2, z1), V2 = blsPrF12Mul(x1, z2);
  if (blsPrF12Eq(V1, V2)) {
    if (blsPrF12Eq(U1, U2)) return blsPrP12Double(p1);
    return [blsPrF12One(), blsPrF12One(), blsPrF12Zero()];
  }
  const U = blsPrF12Sub(U1, U2), V = blsPrF12Sub(V1, V2);
  const Vsq = blsPrF12Mul(V, V);
  const VsqV2 = blsPrF12Mul(Vsq, V2);
  const Vcube = blsPrF12Mul(V, Vsq);
  const W = blsPrF12Mul(z1, z2);
  const A = blsPrF12Sub(blsPrF12Sub(blsPrF12Mul(blsPrF12Mul(U, U), W), Vcube), blsPrF12Smul(VsqV2, 2n));
  const nx = blsPrF12Mul(V, A);
  const ny = blsPrF12Sub(blsPrF12Mul(U, blsPrF12Sub(VsqV2, A)), blsPrF12Mul(Vcube, U2));
  const nz = blsPrF12Mul(Vcube, W);
  return [nx, ny, nz];
}
/* The twist isomorphism into Fp12: c0 + c1 i is carried to
   (c0 - c1) + c1 w^6, then the point is held projectively as
   (embed(x) * w, embed(y), w^3), whose affine coordinates
   (embed(x) / w^2, embed(y) / w^3) satisfy y^2 = x^3 + 4 */
function blsPrTwistToF12(x, y) {
  const embed = (c) => {
    const e = blsPrF12Zero();
    e[0] = blsG1Mod(c[0] - c[1]);
    e[6] = blsG1Mod(c[1]);
    return e;
  };
  const ex = embed(x), ey = embed(y);
  const X = blsPrF12Zero(); X[1] = ex[0]; X[7] = ex[6];
  const Z = blsPrF12Zero(); Z[3] = 1n;
  return [X, ey, Z];
}
/* The line through P1 and P2 evaluated at T, returned as a
   (numerator, denominator) pair so the loop needs no
   inversions until the very end */
function blsPrLinefunc(P1, P2, T) {
  const [x1, y1, z1] = P1, [x2, y2, z2] = P2, [xt, yt, zt] = T;
  const mn = blsPrF12Sub(blsPrF12Mul(y2, z1), blsPrF12Mul(y1, z2));
  const md = blsPrF12Sub(blsPrF12Mul(x2, z1), blsPrF12Mul(x1, z2));
  if (!blsPrF12IsZero(md)) {
    const num = blsPrF12Sub(
      blsPrF12Mul(mn, blsPrF12Sub(blsPrF12Mul(xt, z1), blsPrF12Mul(x1, zt))),
      blsPrF12Mul(md, blsPrF12Sub(blsPrF12Mul(yt, z1), blsPrF12Mul(y1, zt))));
    return [num, blsPrF12Mul(blsPrF12Mul(md, zt), z1)];
  }
  if (blsPrF12IsZero(mn)) {
    const mn2 = blsPrF12Smul(blsPrF12Mul(x1, x1), 3n);
    const md2 = blsPrF12Smul(blsPrF12Mul(y1, z1), 2n);
    const num = blsPrF12Sub(
      blsPrF12Mul(mn2, blsPrF12Sub(blsPrF12Mul(xt, z1), blsPrF12Mul(x1, zt))),
      blsPrF12Mul(md2, blsPrF12Sub(blsPrF12Mul(yt, z1), blsPrF12Mul(y1, zt))));
    return [num, blsPrF12Mul(blsPrF12Mul(md2, zt), z1)];
  }
  return [blsPrF12Sub(blsPrF12Mul(xt, z1), blsPrF12Mul(x1, zt)), blsPrF12Mul(z1, zt)];
}
function blsPrMillerRaw(Q12, P12) {
  let R = Q12;
  let fNum = blsPrF12One(), fDen = blsPrF12One();
  for (let idx = 62; idx >= 0; idx--) {
    const v = BLS_ATE_PSEUDO[idx];
    const ld = blsPrLinefunc(R, R, P12);
    fNum = blsPrF12Mul(blsPrF12Mul(fNum, fNum), ld[0]);
    fDen = blsPrF12Mul(blsPrF12Mul(fDen, fDen), ld[1]);
    R = blsPrP12Double(R);
    if (v === 1) {
      const la = blsPrLinefunc(R, Q12, P12);
      fNum = blsPrF12Mul(fNum, la[0]);
      fDen = blsPrF12Mul(fDen, la[1]);
      R = blsPrP12Add(R, Q12);
    }
  }
  return blsPrF12Mul(fNum, blsPrF12Inv(fDen));
}
function blsPrFinalExp(f) {
  const f1 = blsPrF12Mul(blsPrF12FrobPow(f, 6), blsPrF12Inv(f)); /* f^(p^6 - 1) */
  const f2 = blsPrF12Mul(blsPrF12FrobPow(f1, 2), f1); /* ^(p^2 + 1) */
  return blsPrF12Pow(f2, (BLS_G1_P ** 4n - BLS_G1_P ** 2n + 1n) / BLS_G1_Q);
}
function blsPairingCalc(inputHex) {
  const bytes = parseHexBytes(inputHex);
  if (bytes === null) return null;
  if (bytes.length % 384 !== 0) return null;
  const pairs = bytes.length / 384;
  if (pairs > BLS_PAIRING_MAX_PAIRS) return null;
  if (pairs === 0) {
    /* EIP-2537: an empty pairing input FAILS (unlike
       alt_bn128's empty product) at the 37,700 base */
    return {
      precompile: "pairing", address: "0x000000000000000000000000000000000000000f",
      pairs: "0", succeeded: "false", output: "0x", outputBytes: "0",
      totalGas: "37700"
    };
  }
  const gas = blsGasCalc("pairing", String(pairs));
  if (gas === null) return null;
  const failed = {
    precompile: "pairing", address: gas.address, pairs: String(pairs),
    succeeded: "false", output: "0x", outputBytes: "0", totalGas: gas.totalGas
  };
  const parsed = [];
  for (let i = 0; i < pairs; i++) {
    const off = i * 384;
    const fe = [];
    for (let j = 0; j < 6; j++) fe.push(bytesToBigInt(bytes.slice(off + 64 * j, off + 64 * j + 64)));
    const gx = fe[0], gy = fe[1];
    if (!blsG1ValidPoint(gx, gy)) return failed;
    let p12 = null;
    if (!(gx === 0n && gy === 0n)) {
      if (blsG1Mul(BLS_G1_Q, [gx, gy]) !== null) return failed; /* EIP-2537 subgroup check */
      const ex = blsPrF12Zero(); ex[0] = gx;
      const ey = blsPrF12Zero(); ey[0] = gy;
      p12 = [ex, ey, blsPrF12One()];
    }
    const x = [fe[2], fe[3]], y = [fe[4], fe[5]];
    if (!blsG2ValidPoint(x, y)) return failed;
    let q12 = null;
    if (!(x[0] === 0n && x[1] === 0n && y[0] === 0n && y[1] === 0n)) {
      if (blsG2Mul(BLS_G2_Q, [x, y]) !== null) return failed; /* EIP-2537 subgroup check */
      q12 = blsPrTwistToF12(x, y);
    }
    parsed.push([p12, q12]);
  }
  let acc = blsPrF12One();
  for (const [p12, q12] of parsed) {
    if (p12 === null || q12 === null) continue;
    acc = blsPrF12Mul(acc, blsPrMillerRaw(q12, p12));
  }
  const ok = blsPrF12Eq(blsPrFinalExp(acc), blsPrF12One());
  return {
    precompile: "pairing", address: gas.address, pairs: String(pairs),
    succeeded: "true",
    output: "0x" + (ok ? "0".repeat(63) + "1" : "0".repeat(64)),
    outputBytes: "32", totalGas: gas.totalGas
  };
}

/* KZG point evaluation precompile — APPLIED. The gas
   calculator above (kzgGasCalc) quotes the flat 50,000 for a
   192-byte input without reading a byte of it; this tool is
   the applied half of the pair — it takes the precompile's
   own input (EIP-4844, address 0x0a) and runs the check:
     input = versioned hash (32) | z (32) | y (32) |
             commitment (48) | proof (48)
   and on success returns the precompile's own 64-byte
   output as two 32-byte words: 4096
   (FIELD_ELEMENTS_PER_BLOB) and the BLS modulus.
   The checks, in the EIP's order:
     - the versioned hash must equal 0x01 || SHA-256 of the
       commitment with its first byte replaced (the hub's
       blobVersionedHash construction, recomputed here from
       the input's own commitment bytes);
     - z and y must be canonical field elements, strictly
       below the BLS modulus (the scalar-field order q — the
       same constant as the BLS tools' subgroup order);
     - the commitment and the proof are compressed G1 points
       in the ZCash encoding the consensus layer uses — flag
       bits in the first byte (0x80 compressed, which must be
       set; 0x40 point at infinity, whose remaining bytes
       must then be zero with the sign bit clear; 0x20 the
       sign of y, read as y lying in the upper half of the
       field) over a 381-bit x, recovered by the (p + 1) / 4
       root since p % 4 == 3, exactly as py_ecc's
       point_compression does it;
     - BOTH points must lie in the prime-order subgroup
       (q * P == infinity by the full multiplication) — the
       validity condition EIP-4844's verification leans on
       and c-kzg's validate_kzg_g1 enforces; an on-curve
       point outside the subgroup fails the call;
     - the pairing equation itself,
         e(commitment - y*G, G2) == e([tau]G2 - z*G2, proof),
       decided here as the two-pair product
         e(C - y*G, G2) * e(proof, z*G2 - [tau]G2) == 1
       by the hub's own blsPairingCalc, so the applied KZG
       tool and the applied pairing tool cannot disagree
       about what a pairing is. [tau]G2 is SetupG2[1] of the
       official KZG trusted setup (the mainnet setup c-kzg
       ships), decompressed from its 96-byte encoding and
       asserted tau-consistent in the oracle:
       e([tau]G2, G) == e(G2, [tau]G1).
   Failure is a FAILED CALL, not a 0 word — unlike the
   pairing precompiles, whose "does not hold" is a successful
   return of 0, EIP-4844 errors the call on any failed check,
   so every non-success below returns succeeded=false with no
   output at the scheduled 50,000 from kzgGasCalc fed "192",
   cross-checked exactly in tests on every row (a failing
   precompile call burns all the gas supplied to it, so that
   is the charge a successful call pays). A length other than
   exactly 192 is refused as malformed (null), mirroring the
   gas calculator, which likewise refuses other lengths
   rather than pricing a call that cannot run. Verified
   against an independent oracle (oracle-kzg-point-eval.py):
   py_ecc for decompression, subgroup and pairing, anchored
   on the trusted setup itself (SRS generators, tau
   consistency, the empty-blob versioned hash) before
   reproducing all 122 official verify_kzg_proof cases from
   c-kzg-4844's consensus test vectors (54 verify, 48 fail
   the pairing, 20 invalid), plus self-generated proofs built
   from the SRS for polynomials of degree 0-2. Computes
   locally; no chain is queried. */
const KZG_G1_GENERATOR = [3685416753713387016781088315183077757961620795782546409894578378688607592378376318836054947676345821548104185464507n, 1339506544944476473020471379941921221584933875938349620426543736416511423956333506472724655353366534992391756441569n];
const KZG_G2_GENERATOR = [[352701069587466618187139116011060144890029952792775240219908644239793785735715026873347600343865175952761926303160n, 3059144344244213709971259814753781636986470325476647558659373206291635324768958432433509563104347017837885763365758n], [1985150602287291935568054521177171638300868978215655730859378665066344726373823718423869104263333984641494340347905n, 927553665492332455747201965776037880757740193453592970025027978793976877002675564980949289727957565575433344219582n]];
const KZG_TAU_G2 = [[3749701713850085193403383609513386037494151572263731328608276629425322978272408394373143740944003571525027436289778n, 3347537128081568434923729147580015899756771550835613107520576615563260658656019591232316627827007503930666726825842n], [194392958648403190675529552496435226424111592982833162118538452666741235889530674000225873281133418439621742897817n, 3447898402727835650716129438012169492682148398295533958400255525306573911008434577489634554212211450783070687991119n]];
function kzgDecompressG1(bytes) {
  /* ZCash compressed G1: undefined = invalid encoding,
     null = the point at infinity, [x, y] = the point */
  const b0 = bytes[0];
  if ((b0 & 0x80) === 0) return undefined; /* not compressed */
  const isInf = (b0 & 0x40) !== 0;
  const sign = (b0 & 0x20) !== 0;
  const xb = bytes.slice();
  xb[0] &= 0x1f;
  const x = bytesToBigInt(xb);
  if (isInf) {
    if (x !== 0n || sign) return undefined;
    return null;
  }
  if (x >= BLS_G1_P) return undefined;
  const y2 = blsG1Mod(x * x * x + 4n);
  let y = secpModPow(y2, (BLS_G1_P + 1n) / 4n, BLS_G1_P);
  if (blsG1Mod(y * y) !== y2) return undefined;
  /* sign of y: the upper half of the field, as py_ecc's
     decompress_G1 chooses it ((y * 2) / p == a_flag) */
  if (y !== 0n && (y * 2n / BLS_G1_P === 1n) !== sign) y = BLS_G1_P - y;
  return [x, y];
}
function kzgPointEvalCalc(inputHex) {
  const bytes = parseHexBytes(inputHex);
  if (bytes === null || bytes.length !== 192) return null;
  const gas = kzgGasCalc("192");
  const failed = {
    precompile: "kzg-point-evaluation", address: gas.address,
    succeeded: "false", output: "0x", outputBytes: "0",
    totalGas: gas.totalGas
  };
  const commitment = bytes.slice(96, 144);
  const digest = sha256Bytes(commitment.slice());
  digest[0] = 0x01; /* VERSIONED_HASH_VERSION_KZG */
  for (let i = 0; i < 32; i++) if (digest[i] !== bytes[i]) return failed;
  const z = bytesToBigInt(bytes.slice(32, 64));
  const y = bytesToBigInt(bytes.slice(64, 96));
  if (z >= BLS_G1_Q || y >= BLS_G1_Q) return failed;
  const C = kzgDecompressG1(commitment);
  const proof = kzgDecompressG1(bytes.slice(144, 192));
  if (C === undefined || proof === undefined) return failed;
  if (C !== null && blsG1Mul(BLS_G1_Q, C) !== null) return failed;
  if (proof !== null && blsG1Mul(BLS_G1_Q, proof) !== null) return failed;
  const negG1 = p => (p === null ? null : [p[0], blsG1Mod(-p[1])]);
  const negG2 = p => (p === null ? null
    : [p[0], [blsG2Mod(-p[1][0]), blsG2Mod(-p[1][1])]]);
  const lhs = blsG1Add(C, negG1(blsG1Mul(y, KZG_G1_GENERATOR)));
  const rhs = blsG2Add(blsG2Mul(z, KZG_G2_GENERATOR), negG2(KZG_TAU_G2));
  const enc64 = v => v.toString(16).padStart(128, "0");
  const encG1 = p => (p === null ? "00".repeat(128)
    : enc64(p[0]) + enc64(p[1]));
  const encG2 = p => (p === null ? "00".repeat(256)
    : enc64(p[0][0]) + enc64(p[0][1]) + enc64(p[1][0]) + enc64(p[1][1]));
  const pr = blsPairingCalc("0x" + encG1(lhs) + encG2(KZG_G2_GENERATOR)
    + encG1(proof) + encG2(rhs));
  if (pr === null || pr.succeeded !== "true") return failed;
  if (!pr.output.endsWith("1")) return failed;
  return {
    precompile: "kzg-point-evaluation", address: gas.address,
    succeeded: "true",
    output: "0x" + (4096n).toString(16).padStart(64, "0")
      + BLS_G1_Q.toString(16).padStart(64, "0"),
    outputBytes: "64", totalGas: gas.totalGas
  };
}

/* secp256r1 precompile gas — P256VERIFY at address 0x0100,
   defined by EIP-7951 for checking an ECDSA signature over
   the secp256r1 curve (P-256 — the curve secure hardware
   such as phone enclaves and WebAuthn/passkey authenticators
   sign with, so this precompile is what lets a contract
   check a passkey signature cheaply). The EIP is Final and
   CC0; the schedule is restated here in my own words, and
   the constants were cross-verified across two independent
   sources this run: EIP-7951's own gas schedule, and client
   implementations agreeing at the same price, address and
   input width (an empirical go-ethereum probe found the
   required gas is this same constant at every input length
   it tried, and a second client's release notes state the
   same figures). EIP-7951 shipped in the Fulu/Osaka upgrade
   (the EIP-7607 hardfork meta, also Final, lists it among
   its core EIPs): mainnet activation at epoch 411392
   (December 2025), so this is a live mainnet price, not a
   proposal:
     - the defined input is exactly 160 bytes: the message
       hash, then the signature's r and s, then the public
       key's x and y — five 32-byte fields;
     - the charge is a flat 6,900 — no base-plus-term split,
       no per-word or per-byte term, and nothing in the
       input's contents moves it;
     - on a valid signature it returns 32 bytes holding the
       value 1; on any failure it returns nothing (0 bytes).
   Deliberate contrast with the KZG tool above: that
   precompile's calculator refuses other lengths because its
   length is a validity condition with no stated burn rule,
   but this EIP states its failure rule outright — the
   precompile never reverts, and a bad input (a wrong length
   included) or a failed verification returns empty while
   burning the same 6,900 a success would have, the charge
   being taken before the precompile runs. So this
   calculator quotes 6,900 at ANY length and reports whether
   the length is the exact 160 at which success is possible;
   at any other length the return is necessarily empty.
   A second deliberate contrast: RIP-7212, the earlier
   rollup version with the same address and input shape,
   charges 3,450 on the L2s that deployed it — exactly half
   this L1 price; the two are not interchangeable. There is
   no EIP-2929 access term: like the other precompiles, this
   one starts warm. This prices the precompile's OWN charge
   only: the CALL or STATICCALL that invokes it charges its
   own terms separately (the CALL calculator above). An r
   or s outside (0, n), a public key off the curve, at the
   point at infinity or with a coordinate at or above the
   field modulus, or a signature that simply does not verify
   all return empty at this same price — the failure modes
   are named, but which of them a given input hits depends
   on the input's contents, which this calculator does not
   read: it takes the input length only. */
const P256_INPUT_BYTES = 160n;
const P256_GAS = 6900n;
function p256GasCalc(inputLenStr) {
  const len = memParseBytes(inputLenStr);
  if (len === null) return null;
  const exact = len === P256_INPUT_BYTES;
  return {
    precompile: "p256verify", address: "0x0000000000000000000000000000000000000100",
    inputBytes: len.toString(), requiredInputBytes: P256_INPUT_BYTES.toString(),
    exactLength: exact ? "yes" : "no",
    outputBytesOnSuccess: exact ? "32" : "0",
    totalGas: P256_GAS.toString()
  };
}

/* ---------- P256VERIFY precompile verification (EIP-7951) ----------
   The applied counterpart of the gas calculator above: that tool
   quotes the flat 6,900 from the input length alone and does not
   read the input — this one takes the precompile's five fields
   (the 32-byte message hash, the signature's r and s, and the
   public key's x and y) and runs the verification itself, exactly
   as the precompile at 0x0100 does: it returns the 32-byte word
   holding 1 when the signature verifies and nothing (empty
   output) on any failure, at the same flat 6,900 either way.
   The curve is secp256r1 (P-256), NOT the secp256k1 of
   ecrecover above: the field prime, the curve coefficient
   (a = p − 3, where k1's doubling shortcut 3x² does not apply —
   the doubling slope here is (3x² + a) / 2y), the base point
   and the group order all differ, so the point arithmetic is
   written out for this curve rather than reused. Verification
   is the textbook ECDSA check: with e the hash as an integer
   and w = s⁻¹ mod n, the point u1·G + u2·Q with u1 = e·w and
   u2 = r·w must be non-infinity with x ≡ r (mod n). Failure
   modes, all returning empty at the same price, never a
   refusal: r or s outside [1, n − 1]; a public-key coordinate
   at or above the field prime; a public key off the curve
   (the point at infinity cannot be written in this input
   shape at all — x and y are always two field-width words);
   or a signature that simply does not verify. One deliberate
   contrast with the hub's ecrecover-family verifiers: there is
   NO low-s rule here — ECDSA verification accepts the high-s
   twin, which mathematically verifies, and so does the
   precompile (the EIP-2 low-s rule binds transaction
   signatures, not this check); a test pins the twin verifying.
   P-256 has cofactor 1, so an on-curve public key is
   automatically in the prime-order group and no separate
   subgroup check exists. Malformed input to THIS page (a
   field that is not exactly 32 bytes of hex) is refused with
   null, as the other calculators refuse unparseable input —
   the precompile itself only ever sees the 160 assembled
   bytes. The price is the hub's own P256 gas function fed the
   exact 160-byte length, cross-checked against it in tests.
   Verified in the tests against an independent pure-Python
   oracle (oracle-p256-verify.py) anchored in-script BEFORE
   emitting vectors on the published curve arithmetic (n·G is
   infinity, (n−1)·G is −G, 2·G at its published coordinates)
   and on RFC 6979 Appendix A.2.5: that appendix's private key
   multiplies to its published public key, its deterministic
   nonce reproduces, and its published (r, s) for SHA-256 of
   "sample" — the prefill below — verifies. Verifies locally;
   it never asks for a private key, signs nothing, and no
   chain is queried. */
const P256_P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const P256_B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const P256_G = [
  0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n,
  0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n
];
function p256Mod(a) { const r = a % P256_P; return r < 0n ? r + P256_P : r; }
function p256Add(p1, p2) {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  const [x1, y1] = p1, [x2, y2] = p2;
  let lam;
  if (x1 === x2) {
    if (p256Mod(y1 + y2) === 0n) return null;
    lam = p256Mod((3n * x1 * x1 + (P256_P - 3n)) * secpModPow(2n * y1, P256_P - 2n, P256_P));
  } else {
    lam = p256Mod((y2 - y1) * secpModPow(x2 - x1, P256_P - 2n, P256_P));
  }
  const x3 = p256Mod(lam * lam - x1 - x2);
  return [x3, p256Mod(lam * (x1 - x3) - y1)];
}
function p256Mul(k, point) {
  let result = null, addend = point, scalar = k;
  while (scalar > 0n) {
    if (scalar & 1n) result = p256Add(result, addend);
    addend = p256Add(addend, addend);
    scalar >>= 1n;
  }
  return result;
}
function p256VerifyCalc(hashHex, rHex, sHex, xHex, yHex) {
  const hashBytes = parseHexBytes(hashHex, 32);
  const rBytes = parseHexBytes(rHex, 32);
  const sBytes = parseHexBytes(sHex, 32);
  const xBytes = parseHexBytes(xHex, 32);
  const yBytes = parseHexBytes(yHex, 32);
  if (hashBytes === null || rBytes === null || sBytes === null || xBytes === null || yBytes === null) return null;
  const gas = p256GasCalc("160");
  if (gas === null) return null;
  const r = bytesToBigInt(rBytes), s = bytesToBigInt(sBytes);
  const qx = bytesToBigInt(xBytes), qy = bytesToBigInt(yBytes);
  let valid = false;
  if (r >= 1n && r < P256_N && s >= 1n && s < P256_N && qx < P256_P && qy < P256_P &&
      p256Mod(qy * qy) === p256Mod(qx * qx * qx + (P256_P - 3n) * qx + P256_B)) {
    const e = bytesToBigInt(hashBytes);
    const w = secpModPow(s, P256_N - 2n, P256_N);
    const pt = p256Add(p256Mul((e * w) % P256_N, P256_G), p256Mul((r * w) % P256_N, [qx, qy]));
    valid = pt !== null && pt[0] % P256_N === r;
  }
  return {
    valid: valid ? "true" : "false",
    output: valid ? "0x" + "00".repeat(31) + "01" : "0x",
    outputBytes: valid ? "32" : "0",
    totalGas: gas.totalGas
  };
}

/* CLZ opcode — count leading zeros, defined by EIP-7939.
   The EIP is Final and CC0; the semantics are restated here
   in my own words, and the constants were cross-verified
   across two independent sources this run: EIP-7939's own
   specification (opcode 0x1e, cost 5, zero returning 256,
   with published test cases) and independent client
   implementations of the Osaka fork pricing CLZ in the
   G_low tier at exactly 5. EIP-7939 shipped in the
   Fulu/Osaka upgrade (the EIP-7607 hardfork meta, also
   Final, lists it among its core EIPs): mainnet activation
   at epoch 411392 (December 2025), so this is a live
   mainnet opcode, not a proposal:
     - CLZ (0x1e) pops one 256-bit word and pushes the
       number of leading zero bits in it — the count of
       zero bits before the most significant set bit;
     - zero is the defined special case: with no set bit
       to count up to, CLZ(0) returns 256;
     - for a non-zero word the result is 256 minus the
       word's bit length, so the highest set bit sits at
       index 255 minus the result — which is also
       floor(log2(x)), the quantity the fixed-point math
       libraries (log, sqrt, power routines), bitmap
       scans and calldata compression code that motivated
       the opcode actually consume;
     - the charge is a flat 5 — the MUL tier; the EIP's
       rationale records that 5 was chosen over 3 to avoid
       under-pricing DoS risk. There is no other term: the
       value is a stack word, never written to memory, and
       the opcode touches no account, storage or accessed
       set, so no memory, EIP-2929 or refund term exists.
   Unlike every gas tool above, this opcode's RESULT is
   the utility, so the calculator computes both: the count
   itself (with the word's bit length and highest set bit
   derived from it) and the flat 5-gas charge. Before this
   opcode, the fastest known Solidity routine for the same
   count cost about 184 gas and over a hundred bytes of
   inlined bytecode; the native opcode is 5 gas and one
   byte. The input is one word YOU supply, in decimal or
   0x hex: anything that is not a single 256-bit word —
   malformed, negative, fractional, or wider than
   2^256 - 1 — is refused rather than wrapped or truncated,
   because the stack word it models cannot hold it. */
const CLZ_GAS = 5n;
const UINT256_MAX = (1n << 256n) - 1n;
function clzCalc(valueStr) {
  if (typeof valueStr !== "string") return null;
  const s = valueStr.trim();
  let v;
  if (/^0[xX]/.test(s)) {
    const h = s.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(h) || h.length > 128) return null;
    v = BigInt("0x" + h);
  } else {
    if (!/^\d+$/.test(s) || s.length > 128) return null;
    v = BigInt(s);
  }
  if (v > UINT256_MAX) return null;
  const bitLength = v === 0n ? 0n : BigInt(v.toString(2).length);
  return {
    opcode: "clz", opcodeByte: "0x1e",
    value: v.toString(),
    valueHex: "0x" + v.toString(16).padStart(64, "0"),
    leadingZeros: (256n - bitLength).toString(),
    bitLength: bitLength.toString(),
    highestSetBit: v === 0n ? "none" : (bitLength - 1n).toString(),
    totalGas: CLZ_GAS.toString()
  };
}

/* EXP (0x0a) — exponentiation, the EVM's one dynamic-priced
   arithmetic opcode, priced by the EXPONENT's byte length:
     - EXP pops a base and an exponent and pushes
       base^exponent mod 2^256 — the stack word wraps, so
       2^256 itself pushes 0; 0^0 pushes 1, as an empty
       product does;
     - the result is computed here by square-and-multiply,
       reducing mod 2^256 at every step — at most 256
       squarings for any 256-bit exponent, so no input can
       make the loop long;
     - the charge is 10 plus a per-byte term on the
       exponent's byte length — the number of bytes its
       value needs, ceil(bit length / 8), and 0 bytes for
       an exponent of 0, which therefore costs the flat 10;
     - the per-byte term is 50 since EIP-160 (Spurious
       Dragon, block 2,675,000) raised it from 10, after
       benchmarks showed EXP underpriced by about 4–8x —
       the legacy 10-per-byte price is returned alongside
       as legacyGas for the contrast. The BASE moves no
       term: a 32-byte base costs exactly what a 1-byte
       base costs at the same exponent.
   Both inputs are single 256-bit words YOU supply, in
   decimal or 0x hex; anything malformed, negative,
   fractional, or wider than 2^256 - 1 is refused rather
   than wrapped, because the stack words cannot hold it. */
function parseWord256(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  let v;
  if (/^0[xX]/.test(s)) {
    const h = s.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(h) || h.length > 128) return null;
    v = BigInt("0x" + h);
  } else {
    if (!/^\d+$/.test(s) || s.length > 128) return null;
    v = BigInt(s);
  }
  return v > UINT256_MAX ? null : v;
}
function expCalc(baseStr, exponentStr) {
  const base = parseWord256(baseStr);
  const exponent = parseWord256(exponentStr);
  if (base === null || exponent === null) return null;
  const modulus = 1n << 256n;
  let result = 1n, b = base % modulus, e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  const exponentBytes = exponent === 0n ? 0n : BigInt((exponent.toString(2).length + 7) >> 3);
  return {
    opcode: "exp", opcodeByte: "0x0a",
    base: base.toString(),
    baseHex: "0x" + base.toString(16).padStart(64, "0"),
    exponent: exponent.toString(),
    exponentHex: "0x" + exponent.toString(16).padStart(64, "0"),
    exponentBytes: exponentBytes.toString(),
    result: result.toString(),
    resultHex: "0x" + result.toString(16).padStart(64, "0"),
    totalGas: (10n + 50n * exponentBytes).toString(),
    legacyGas: (10n + 10n * exponentBytes).toString()
  };
}

/* SIGNEXTEND (0x0b) — sign extension of a two's-complement
   integer, restated in my own words from the opcode's
   definition and cross-checked this run against a zkEVM
   opcode spec and two independent opcode tables (opcode
   0x0b, flat 5 gas):
     - SIGNEXTEND pops a byte index b and a value x and
       pushes x re-interpreted as a signed integer of
       b + 1 bytes, widened to the full 256-bit word;
     - the sign is the most significant bit of byte b of
       x, counting byte 0 as the LEAST significant byte
       (the opposite end from the BYTE opcode);
     - every byte above byte b is replaced: 0xFF bytes
       when the sign is 1, 0x00 bytes when it is 0 — so
       on a positive sign the upper bytes are CLEARED, not
       preserved (SIGNEXTEND(0, 0x100) pushes 0, because
       byte 0 of 0x100 is 0x00);
     - when b >= 31 there is no byte above the sign byte
       inside the word, so the result is x unchanged —
       b = 31 reads bit 255 and larger b has no byte in
       the word to read; both report signBit "none";
     - the charge is a flat 5 — the MUL tier — with no
       other term: both inputs are stack words, nothing
       is written to memory and no account or storage is
       touched.
   This is the opcode Solidity emits when a narrower
   signed type (int8, int16, ...) is widened, so its
   result is the utility: the calculator computes the
   extended word, its signed (two's-complement)
   reading, and the flat charge. Both inputs are single
   256-bit words YOU supply, in decimal or 0x hex;
   anything malformed, negative, fractional, or wider
   than 2^256 - 1 is refused rather than wrapped,
   because the stack words cannot hold it. */
const SIGNEXTEND_GAS = 5n;
function signExtendCalc(byteIndexStr, valueStr) {
  const b = parseWord256(byteIndexStr);
  const x = parseWord256(valueStr);
  if (b === null || x === null) return null;
  let result, signBit, extendedBytes;
  if (b >= 31n) {
    result = x; signBit = "none"; extendedBytes = 0n;
  } else {
    const sign = (x >> (8n * b + 7n)) & 1n;
    const keep = (1n << (8n * (b + 1n))) - 1n;
    result = sign === 1n ? (x | (UINT256_MAX ^ keep)) : (x & keep);
    signBit = sign.toString(); extendedBytes = 31n - b;
  }
  const signedResult = result >= (1n << 255n) ? result - (1n << 256n) : result;
  return {
    opcode: "signextend", opcodeByte: "0x0b",
    byteIndex: b.toString(),
    value: x.toString(),
    valueHex: "0x" + x.toString(16).padStart(64, "0"),
    signBit: signBit,
    extendedBytes: extendedBytes.toString(),
    result: result.toString(),
    resultHex: "0x" + result.toString(16).padStart(64, "0"),
    signedResult: signedResult.toString(),
    totalGas: SIGNEXTEND_GAS.toString()
  };
}

/* Shift opcodes (EIP-145) — SHL (0x1b), SHR (0x1c) and
   SAR (0x1d), the native bitwise shifts Constantinople
   added, restated in my own words from the EIP's
   specification and cross-checked this run against two
   independent opcode/gas tables (bytes 0x1b-0x1d, flat 3
   gas each):
     - each pops the shift FIRST and then the value (the
       operand order is swapped against most arithmetic
       opcodes, deliberately, to fit shifting a value
       already on the stack);
     - SHL pushes (value x 2^shift) mod 2^256 — the word
       wraps, bits shifted past bit 255 are lost;
     - SHR pushes floor(value / 2^shift) — a logical
       shift, zero-filled from the top;
     - SAR reads the value as a SIGNED two's-complement
       integer and pushes floor(signed / 2^shift),
       re-encoded as a word — an arithmetic shift,
       sign-filled from the top. The floor matters: SAR
       rounds toward minus infinity, so SAR(-255, 1)
       pushes -128, where the truncating SDIV(-255, 2)
       would give -127 — SAR is NOT PUSH 2, EXP, SDIV;
     - a shift of 256 or more saturates: SHL and SHR
       push 0 whatever the value, SAR pushes 0 when the
       value is non-negative and all-ones (-1) when it
       is negative;
     - the charge is a flat 3 — the verylow tier, on par
       with ADD — with no other term: both inputs are
       stack words, nothing touches memory, an account
       or storage. Before these opcodes existed the
       arithmetic workarounds cost about 35 each.
   Solidity's <<, >> on unsigned types and >> on signed
   types compile to exactly these, so the result is the
   utility: the calculator computes the pushed word and
   its signed reading, for whichever of the three the
   caller picks. Both inputs are single 256-bit words
   YOU supply, in decimal or 0x hex; anything malformed,
   negative, fractional, or wider than 2^256 - 1 is
   refused rather than wrapped, as is an opcode name
   other than shl / shr / sar. */
const SHIFT_GAS = 3n;
const SHIFT_OPCODE_BYTES = { shl: "0x1b", shr: "0x1c", sar: "0x1d" };
function shiftCalc(opStr, shiftStr, valueStr) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SHIFT_OPCODE_BYTES, op)) return null;
  const s = parseWord256(shiftStr);
  const x = parseWord256(valueStr);
  if (s === null || x === null) return null;
  const signedValue = x >= (1n << 255n) ? x - (1n << 256n) : x;
  const saturated = s >= 256n;
  let result;
  if (op === "shl") result = saturated ? 0n : ((x << s) & UINT256_MAX);
  else if (op === "shr") result = saturated ? 0n : (x >> s);
  else result = saturated
    ? (signedValue < 0n ? UINT256_MAX : 0n)
    : ((signedValue >> s) & UINT256_MAX);
  const signedResult = result >= (1n << 255n) ? result - (1n << 256n) : result;
  return {
    opcode: op, opcodeByte: SHIFT_OPCODE_BYTES[op],
    shift: s.toString(),
    value: x.toString(),
    valueHex: "0x" + x.toString(16).padStart(64, "0"),
    signedValue: signedValue.toString(),
    saturated: saturated ? "true" : "false",
    result: result.toString(),
    resultHex: "0x" + result.toString(16).padStart(64, "0"),
    signedResult: signedResult.toString(),
    totalGas: SHIFT_GAS.toString()
  };
}

/* Modular arithmetic opcodes — ADDMOD (0x08) and
   MULMOD (0x09), Frontier opcodes, restated in my own
   words and cross-checked this run against several
   independent opcode references (bytes 0x08/0x09, flat
   8 gas each):
     - each pops three words — a, b and the modulus N —
       and pushes (a + b) mod N (ADDMOD) or (a x b) mod N
       (MULMOD); a and b are interchangeable, N is the
       third (deepest) of the three;
     - the intermediate is computed at FULL precision:
       the sum or product is NOT reduced mod 2^256
       before the modulus is taken, so an ADDMOD sum can
       reach 2^257 - 2 and a MULMOD product 2^512 - 2^257
       + 1 — this is the entire point of the pair, and
       the trap: (2^255 x 2) mod (2^255 - 19) is 38 at
       full precision, but a calculator that wraps the
       product to a word first gets 2^256 mod 2^256 = 0
       and answers 0. BigInt arithmetic is exact at any
       width, so the direct formula below IS the full-
       precision computation;
     - a modulus of 0 pushes 0, whatever a and b are —
       the raw opcode's rule, matching MOD/DIV by zero.
       (Solidity's addmod / mulmod built-in functions
       check for a zero modulus first and revert with
       Panic(0x12); that check is the language's, not
       the opcode's, and this calculator prices and
       computes the opcode.)
     - the charge is a flat 8 — the Mid tier — with no
       other term: the inputs are stack words, nothing
       touches memory, an account or storage.
   These are what Solidity's addmod(a, b, N) / mulmod(a,
   b, N) built-ins compile to, and the standard way to do
   modular arithmetic over a large prime (curve fields,
   RSA-style math) without a 512-bit intermediate
   overflowing. The operands are read unsigned — there
   is no signed variant; SMOD is a different opcode.
   All three inputs are single 256-bit words YOU supply,
   in decimal or 0x hex; anything malformed, negative,
   fractional, or wider than 2^256 - 1 is refused rather
   than wrapped, as is an opcode name other than
   addmod / mulmod. */
const MODMATH_GAS = 8n;
const MODMATH_OPCODE_BYTES = { addmod: "0x08", mulmod: "0x09" };
function modMathCalc(opStr, aStr, bStr, nStr) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(MODMATH_OPCODE_BYTES, op)) return null;
  const a = parseWord256(aStr);
  const b = parseWord256(bStr);
  const n = parseWord256(nStr);
  if (a === null || b === null || n === null) return null;
  const result = n === 0n ? 0n : (op === "addmod" ? (a + b) % n : (a * b) % n);
  return {
    opcode: op, opcodeByte: MODMATH_OPCODE_BYTES[op],
    a: a.toString(),
    b: b.toString(),
    modulus: n.toString(),
    zeroModulus: n === 0n ? "true" : "false",
    result: result.toString(),
    resultHex: "0x" + result.toString(16).padStart(64, "0"),
    totalGas: MODMATH_GAS.toString()
  };
}

/* BYTE opcode (0x1a) — a Frontier opcode, restated in
   my own words and cross-checked this run against
   evm.codes and a client implementation (byte 0x1a,
   flat 3 gas):
     - it pops the index i FIRST, then the word x, and
       pushes the single byte of x at position i, placed
       at the least significant position of the pushed
       word (so the result is always 0..255);
     - position 0 is the MOST significant byte of x —
       the byte extracted is (x >> (248 - 8*i)) & 0xff.
       This end convention is the trap: SIGNEXTEND
       counts its byte index from the LEAST significant
       end, BYTE from the most significant end, so the
       same index selects opposite bytes in the two
       opcodes — on 0xab00...0001, BYTE at index 0
       pushes 0xab (171) where an LSB-first reading
       would push 1, and BYTE at index 31 pushes 1;
     - an index of 32 or more pushes 0 — out of range
       is a defined result, not an error;
     - the charge is a flat 3 — the verylow tier, on
       par with ADD — with no other term: the inputs
       are stack words, nothing touches memory, an
       account or storage.
   Both inputs are single 256-bit words YOU supply, in
   decimal or 0x hex; anything malformed, negative,
   fractional, or wider than 2^256 - 1 is refused
   rather than wrapped, because the stack words cannot
   hold it. (An index wider than a word cannot occur
   on the real stack either — it arrives AS a word.) */
const BYTE_GAS = 3n;
function byteCalc(indexStr, valueStr) {
  const i = parseWord256(indexStr);
  const x = parseWord256(valueStr);
  if (i === null || x === null) return null;
  const outOfRange = i >= 32n;
  const result = outOfRange ? 0n : ((x >> (248n - 8n * i)) & 0xffn);
  return {
    opcode: "byte", opcodeByte: "0x1a",
    byteIndex: i.toString(),
    value: x.toString(),
    valueHex: "0x" + x.toString(16).padStart(64, "0"),
    outOfRange: outOfRange ? "true" : "false",
    result: result.toString(),
    resultHex: "0x" + result.toString(16).padStart(64, "0"),
    totalGas: BYTE_GAS.toString()
  };
}

/* Division and modulo opcodes — DIV (0x04), SDIV (0x05),
   MOD (0x06) and SMOD (0x07), Frontier opcodes, restated
   in my own words and cross-checked this run against
   independent opcode references (bytes 0x04-0x07, flat
   5 gas each):
     - each pops the dividend a FIRST, then the divisor
       b, and pushes a / b (DIV, unsigned), the signed
       quotient (SDIV), a mod b (MOD, unsigned) or the
       signed remainder (SMOD);
     - a divisor of 0 pushes 0 for all four — division
       by zero is a defined result, not an error or a
       revert at the opcode level. (Solidity's / and %
       check first and revert with Panic(0x12); that
       check is the language's, not the opcode's.)
     - SDIV truncates toward zero: -255 / 2 pushes -127,
       NOT the -128 a floor division gives (the SAR
       lesson again: rounding direction is per-opcode).
       And -1 / 2 pushes 0, not -1. This is the trap for
       anyone porting Python's //, which floors.
     - SDIV has exactly one overflow: -2^255 / -1 would
       be 2^255, which no signed word holds, so the
       opcode pushes the -2^255 word itself (0x8000...0)
       — the quotient wraps, it does not trap.
     - SMOD's result takes the sign of the DIVIDEND a,
       never the divisor: -255 mod 2 pushes -1 and
       255 mod -2 pushes 1. A floor-mod (Python's %)
       takes the divisor's sign and answers the opposite
       in both mixed-sign cases.
     - the charge is a flat 5 — the Low tier — with no
       other term: the inputs are stack words, nothing
       touches memory, an account or storage.
   Both inputs are single 256-bit words YOU supply, in
   decimal or 0x hex; anything malformed, negative,
   fractional, or wider than 2^256 - 1 is refused rather
   than wrapped, as is an opcode name other than
   div / sdiv / mod / smod. Signed readings are the
   two's-complement reading of the same words. */
const DIV_GAS = 5n;
const DIV_OPCODE_BYTES = { div: "0x04", sdiv: "0x05", mod: "0x06", smod: "0x07" };
function divCalc(opStr, aStr, bStr) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(DIV_OPCODE_BYTES, op)) return null;
  const a = parseWord256(aStr);
  const b = parseWord256(bStr);
  if (a === null || b === null) return null;
  const signedA = a >= (1n << 255n) ? a - (1n << 256n) : a;
  const signedB = b >= (1n << 255n) ? b - (1n << 256n) : b;
  let result;
  if (op === "div") result = b === 0n ? 0n : a / b;
  else if (op === "mod") result = b === 0n ? 0n : a % b;
  else if (op === "sdiv") {
    if (signedB === 0n) result = 0n;
    else {
      const q = signedA / signedB; /* BigInt division truncates toward zero */
      result = q < 0n ? q + (1n << 256n) : q & UINT256_MAX; /* -2^255 / -1 wraps to the 2^255 word */
    }
  } else {
    if (signedB === 0n) result = 0n;
    else {
      const m = (signedA < 0n ? -signedA : signedA) % (signedB < 0n ? -signedB : signedB);
      const sr = signedA < 0n ? -m : m;
      result = sr < 0n ? sr + (1n << 256n) : sr;
    }
  }
  const signedResult = result >= (1n << 255n) ? result - (1n << 256n) : result;
  return {
    opcode: op, opcodeByte: DIV_OPCODE_BYTES[op],
    a: a.toString(),
    b: b.toString(),
    aHex: "0x" + a.toString(16).padStart(64, "0"),
    bHex: "0x" + b.toString(16).padStart(64, "0"),
    signedA: signedA.toString(),
    signedB: signedB.toString(),
    zeroDivisor: b === 0n ? "true" : "false",
    result: result.toString(),
    resultHex: "0x" + result.toString(16).padStart(64, "0"),
    signedResult: signedResult.toString(),
    totalGas: DIV_GAS.toString()
  };
}

const CMP_GAS = 3n;
const CMP_OPCODE_BYTES = { lt: "0x10", gt: "0x11", slt: "0x12", sgt: "0x13", eq: "0x14", iszero: "0x15" };
function cmpCalc(opStr, aStr, bStr) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CMP_OPCODE_BYTES, op)) return null;
  const a = parseWord256(aStr);
  if (a === null) return null;
  const unary = op === "iszero";
  /* ISZERO pops one word only: b is never read, and is reported as a
     itself (flagged unary) so the result fields stay uniform. */
  const b = unary ? a : parseWord256(bStr);
  if (b === null) return null;
  const signedA = a >= (1n << 255n) ? a - (1n << 256n) : a;
  const signedB = b >= (1n << 255n) ? b - (1n << 256n) : b;
  let result;
  if (op === "lt") result = a < b ? 1n : 0n;
  else if (op === "gt") result = a > b ? 1n : 0n;
  else if (op === "slt") result = signedA < signedB ? 1n : 0n;
  else if (op === "sgt") result = signedA > signedB ? 1n : 0n;
  else if (op === "eq") result = a === b ? 1n : 0n;
  else result = a === 0n ? 1n : 0n;
  return {
    opcode: op, opcodeByte: CMP_OPCODE_BYTES[op],
    a: a.toString(),
    b: b.toString(),
    aHex: "0x" + a.toString(16).padStart(64, "0"),
    bHex: "0x" + b.toString(16).padStart(64, "0"),
    signedA: signedA.toString(),
    signedB: signedB.toString(),
    unary: unary ? "true" : "false",
    result: result.toString(),
    resultHex: "0x" + result.toString(16).padStart(64, "0"),
    totalGas: CMP_GAS.toString()
  };
}

/* Bitwise opcodes AND (0x16), OR (0x17), XOR (0x18),
   NOT (0x19) -- Frontier opcodes, flat 3 gas each (the
   verylow tier):
     - AND / OR / XOR pop a first, then b, and push the
       bit-by-bit combination of the two words: a bit of
       the result is 1 exactly when both bits are 1 (AND),
       when at least one is 1 (OR), or when exactly one
       is 1 (XOR). The three are commutative -- a and b
       are interchangeable, unlike SUB / DIV / LT -- and
       they operate on the raw 256 bits, so the signed or
       unsigned reading of the words is irrelevant: there
       is no signed pair here, unlike the comparison
       family above.
     - NOT is unary: it pops one word only and pushes
       that word with every one of its 256 bits flipped,
       i.e. (2^256 - 1) XOR a, equivalently
       (2^256 - 1) - a. NOT 0 pushes the all-ones word;
       NOT of the all-ones word pushes 0.
     - NOT is NOT negation. There is no NEG opcode:
       arithmetic negation is 0 - x (a SUB), and the
       two's-complement identity is -x = NOT(x) + 1, so
       NOT 1 pushes 0xffff...fffe (which reads as -2
       signed), not the all-ones word (which reads as
       -1). An implementation that computes NOT as
       0 - x, or in a language whose ~ is
       infinite-precision (Python's ~0 is -1, not the
       all-ones word), is off by one on every input.
     - the charge is a flat 3 -- the Verylow tier -- with
       no other term: the inputs are stack words, nothing
       touches memory, an account or storage.
   Both inputs are single 256-bit words YOU supply, in
   decimal or 0x hex; anything malformed, negative,
   fractional, or wider than 2^256 - 1 is refused rather
   than wrapped, as is an opcode name other than
   and / or / xor / not. For NOT, b is never read. */
const BIT_GAS = 3n;
const BIT_OPCODE_BYTES = { and: "0x16", or: "0x17", xor: "0x18", not: "0x19" };
const UINT256_MAX_WORD = (1n << 256n) - 1n;
function bitCalc(opStr, aStr, bStr) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(BIT_OPCODE_BYTES, op)) return null;
  const a = parseWord256(aStr);
  if (a === null) return null;
  const unary = op === "not";
  /* NOT pops one word only: b is never read, and is reported as a
     itself (flagged unary) so the result fields stay uniform. */
  const b = unary ? a : parseWord256(bStr);
  if (b === null) return null;
  let result;
  if (op === "and") result = a & b;
  else if (op === "or") result = a | b;
  else if (op === "xor") result = a ^ b;
  else result = UINT256_MAX_WORD ^ a;
  return {
    opcode: op, opcodeByte: BIT_OPCODE_BYTES[op],
    a: a.toString(),
    b: b.toString(),
    aHex: "0x" + a.toString(16).padStart(64, "0"),
    bHex: "0x" + b.toString(16).padStart(64, "0"),
    unary: unary ? "true" : "false",
    result: result.toString(),
    resultHex: "0x" + result.toString(16).padStart(64, "0"),
    totalGas: BIT_GAS.toString()
  };
}

/* Arithmetic opcodes ADD (0x01), MUL (0x02), SUB (0x03) --
   the plain arithmetic trio that completes the Frontier
   arithmetic group alongside EXP, ADDMOD/MULMOD and DIV/
   SDIV/MOD/SMOD above. Each pops a first, then b, and
   pushes the result reduced modulo 2^256:
     ADD pushes (a + b) mod 2^256;
     MUL pushes (a * b) mod 2^256;
     SUB pushes (a - b) mod 2^256, a the minuend.
   The defining rule is the wrap:
     - no result traps, saturates or signals: MAX + 1
       pushes 0, 0 - 1 pushes MAX, 2^255 * 2 pushes 0 and
       2^255 * 3 pushes 2^255. The checked overflow and
       underflow reverts of Solidity >= 0.8 are a language
       check inserted around these opcodes, not the
       opcodes' own behaviour -- in unchecked blocks and
       raw assembly the wrap is what executes.
     - SUB is not commutative and its order is a - b with
       a popped first: 3 - 5 pushes 2^256 - 2, not 2.
       ADD and MUL are commutative.
     - there is no signed pair in this family (unlike DIV
       or the comparisons): addition, multiplication and
       subtraction modulo 2^256 give the same word under
       either reading, which is why one opcode each serves
       both Solidity int and uint arithmetic.
     - gas is NOT uniform inside the family: ADD and SUB
       are a flat 3 (the Verylow tier) while MUL is a flat
       5 (the Low tier) -- quoting 3 for MUL is wrong on
       every call. No other term applies: the inputs are
       stack words, nothing touches memory, an account or
       storage.
   Both inputs are single 256-bit words YOU supply, in
   decimal or 0x hex; anything malformed, negative,
   fractional, or wider than 2^256 - 1 is refused rather
   than wrapped on input, as is an opcode name other than
   add / mul / sub. (The RESULT wraps, as the opcode's
   does; the inputs cannot, because a stack word cannot
   hold them.) */
const ARITH_OPCODE_BYTES = { add: "0x01", mul: "0x02", sub: "0x03" };
const ARITH_GAS = { add: 3n, mul: 5n, sub: 3n };
function arithCalc(opStr, aStr, bStr) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(ARITH_OPCODE_BYTES, op)) return null;
  const a = parseWord256(aStr);
  if (a === null) return null;
  const b = parseWord256(bStr);
  if (b === null) return null;
  const modulus = 1n << 256n;
  let result;
  if (op === "add") result = (a + b) % modulus;
  else if (op === "mul") result = (a * b) % modulus;
  else { result = (a - b) % modulus; if (result < 0n) result += modulus; }
  return {
    opcode: op, opcodeByte: ARITH_OPCODE_BYTES[op],
    a: a.toString(),
    b: b.toString(),
    aHex: "0x" + a.toString(16).padStart(64, "0"),
    bHex: "0x" + b.toString(16).padStart(64, "0"),
    result: result.toString(),
    resultHex: "0x" + result.toString(16).padStart(64, "0"),
    totalGas: ARITH_GAS[op].toString()
  };
}

/* Push opcodes -- PUSH0 (0x5f, EIP-3855) and PUSH1..PUSH32
   (0x60..0x7f, Frontier). pushCalc(n, imm) computes the word
   the opcode pushes and its flat charge:
     - PUSHn reads the n bytes after the opcode byte as a
       big-endian integer. Those bytes are the HIGH-order
       bytes of the pushed value.
     - TRUNCATION (the trap): if the code ends before n bytes
       remain, the missing bytes are the LOW-order bytes and
       read as zero -- the byte string is padded on the RIGHT
       with zeros. So PUSH2 at the end of code carrying only
       0xff pushes 0xff00 (65280), not 0xff (255); an
       implementation that pads on the left (the natural
       "short integer" reading) is wrong on every truncated
       push, and truncated pushes are exactly what a
       disassembler or jumpdest scan meets at code end.
     - PUSH0 has no immediate at all and pushes 0; like the
       family's unary members above it never reads its
       immediate input, however malformed.
     - gas splits inside the family: PUSH0 is 2 (the Base
       tier, EIP-3855 -- the 1-gas saving over PUSH1 0x00,
       plus a saved code byte, is the opcode's whole point,
       live since Shanghai), PUSH1..PUSH32 are a flat 3
       (Verylow) whatever n or the value.
     - minimalN: the smallest push that pushes the same
       value (0 for 0, else the value's byte length) -- a
       PUSH5 of 0x0000000001 pushes 1, which PUSH1 (or, for
       0, PUSH0) pushes in fewer bytes; leading zero bytes
       waste code size, never change the value.
   The immediate is hex bytes YOU supply (0x prefix optional,
   "" = no bytes remain); more supplied bytes than n is
   refused rather than silently cut (the extra bytes would
   be the next instruction, not part of this push), as are
   odd-length or non-hex input and an n outside 0..32. */
function pushCalc(nStr, immStr) {
  if (typeof nStr !== "string") return null;
  const ns = nStr.trim();
  if (!/^\d+$/.test(ns)) return null;
  const n = Number(ns);
  if (!Number.isSafeInteger(n) || n < 0 || n > 32) return null;
  if (n === 0) {
    return {
      n: "0", opcodeByte: "0x5f", immHex: "0x",
      suppliedBytes: "0", paddedBytes: "0",
      result: "0",
      resultHex: "0x" + "0".padStart(64, "0"),
      minimalN: "0", totalGas: "2"
    };
  }
  if (typeof immStr !== "string") return null;
  let h = immStr.trim();
  if (/^0[xX]/.test(h)) h = h.slice(2);
  if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
  const supplied = h.length / 2;
  if (supplied > n) return null;
  const paddedHex = h.toLowerCase().padEnd(n * 2, "0");
  const value = BigInt("0x" + paddedHex);
  const minimal = value === 0n ? 0 : (value.toString(16).length + 1) >> 1;
  return {
    n: String(n),
    opcodeByte: "0x" + (0x60 + n - 1).toString(16).padStart(2, "0"),
    immHex: "0x" + h.toLowerCase(),
    suppliedBytes: String(supplied),
    paddedBytes: String(n - supplied),
    result: value.toString(),
    resultHex: "0x" + value.toString(16).padStart(64, "0"),
    minimalN: String(minimal),
    totalGas: "3"
  };
}

/* Stack opcodes -- POP (0x50), DUP1..DUP16 (0x80..0x8f) and
   SWAP1..SWAP16 (0x90..0x9f), all Frontier. stackCalc(op, n,
   stack) applies ONE of them to the stack YOU supply, listed
   and returned DEEPEST FIRST with the TOP ITEM LAST, and
   computes the resulting stack:
     - POP removes the top item; depth falls by 1. It needs
       depth >= 1.
     - DUPn pushes a copy of the n-th item counting THE TOP
       AS 1, so DUP1 copies the top item itself and DUP16 the
       16th down; the copied item stays where it was and the
       copy lands on top, so depth grows by exactly 1. It
       needs depth >= n.
     - SWAPn exchanges the top item with the (n+1)-th item
       counting the top as 1, so SWAP1 swaps the top two and
       SWAP16 reaches the 17th item down; depth is unchanged.
       It needs depth >= n + 1.
   The orientation is the trap: DUP and SWAP both count FROM
   THE TOP, so an implementation that counts from the bottom
   (the deepest item as 1) duplicates or swaps exactly the
   wrong word whenever the stack is deeper than the index --
   DUP3 of [10, 20, 30] (30 on top) copies 10, the deepest,
   and a bottom-counting implementation copies 30 instead.
   The same off-by-one family bites SWAP: the n in SWAPn is
   the DISTANCE below the top, so the partner sits at depth
   n + 1, and SWAP1 already needs a 2-deep stack.
   A stack that is too short is a STACK ERROR, not a defined
   result like DIV by zero or an out-of-range BYTE: in a real
   execution it is an exceptional halt, the frame's gas is
   consumed and its state reverts, and NO resulting stack
   exists. The calculator therefore reports the opcode's flat
   charge (still quoted, for the record) with underflow true
   and the unchanged stack, and the page states the halt
   plainly -- quoting only the 2 gas as the "cost" of an
   underflowing call would understate a real halt by the
   frame's whole remaining gas.
   Gas is a flat 2 for all three families -- the Base tier,
   one BELOW the Verylow 3 the push family above charges.
   DUP and SWAP are the only Verylow-looking stack opcodes NOT
   in Verylow; copying the push family's 3 here overprices
   every call by half again.
   The stack is a list of 256-bit words YOU supply, deepest
   first, separated by commas, whitespace or newlines, each
   in decimal or 0x hex; an empty field is an empty stack.
   More than 64 items is refused (a real stack caps at 1024,
   far beyond what one opcode step needs to show); a DUP that
   would take a full 1024-deep stack past the limit is the
   mirror-image stack overflow, likewise an exceptional halt,
   and is out of scope here because the input cap keeps every
   supplied stack far below it. Anything malformed, negative,
   fractional or wider than a word is refused, as is an
   opcode other than pop / dup / swap or an n outside 1..16
   for dup / swap (POP takes no n and never reads it). */
function stackCalc(opStr, nStr, stackStr) {
  if (typeof opStr !== "string" || typeof stackStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (op !== "pop" && op !== "dup" && op !== "swap") return null;
  let n = 0;
  let opcodeByte;
  if (op === "pop") {
    opcodeByte = "0x50";
  } else {
    if (typeof nStr !== "string") return null;
    const ns = nStr.trim();
    if (!/^\d+$/.test(ns)) return null;
    n = Number(ns);
    if (!Number.isSafeInteger(n) || n < 1 || n > 16) return null;
    opcodeByte = "0x" + ((op === "dup" ? 0x80 : 0x90) + n - 1).toString(16).padStart(2, "0");
  }
  const tokens = stackStr.split(/[\s,]+/).filter(t => t !== "");
  if (tokens.length > 64) return null;
  const before = [];
  for (const t of tokens) {
    const w = parseWord256(t);
    if (w === null) return null;
    before.push(w);
  }
  const depth = before.length;
  const need = op === "pop" ? 1 : op === "dup" ? n : n + 1;
  const underflow = depth < need;
  const after = before.slice();
  if (!underflow) {
    if (op === "pop") after.pop();
    else if (op === "dup") after.push(after[after.length - n]);
    else {
      const top = after.length - 1;
      const tmp = after[top];
      after[top] = after[top - n];
      after[top - n] = tmp;
    }
  }
  const dec = arr => arr.map(w => w.toString());
  const hex = arr => arr.map(w => "0x" + w.toString(16).padStart(64, "0"));
  return {
    opcode: op, n: String(n), opcodeByte,
    before: dec(before), beforeHex: hex(before),
    after: dec(after), afterHex: hex(after),
    depthBefore: String(depth), depthAfter: String(after.length),
    underflow: underflow ? "true" : "false",
    totalGas: "2"
  };
}

/* JUMPDEST analysis -- JUMPDEST (0x5b, Frontier).
   jumpdestCalc(code, dest) walks the bytecode YOU supply
   from pc 0 and computes the set of VALID jump destinations
   -- the offsets a JUMP (0x56) or JUMPI (0x57) may legally
   land on -- exactly as the Yellow Paper's jump-destination
   validity definition computes it: the next instruction
   sits at pc + 1 for every opcode except PUSH1..PUSH32
   (0x60..0x7f), where it sits at pc + 1 + n because the n
   bytes after the opcode are immediate data, not code;
   PUSH0 (0x5f) has no immediate and advances by 1 like any
   other opcode. A byte 0x5b counts as a destination only
   when the walk lands on it AS an instruction.
   The naive scan is the trap: grepping the raw bytes for
   0x5b also matches every 0x5b sitting inside PUSH
   immediate data, and those bytes are data, never
   destinations -- a jump onto one is an invalid jump
   destination, an exceptional halt that consumes the
   frame's gas, in code where the byte LOOKS like a
   JUMPDEST. The calculator lists those impostor offsets
   separately (fakes) precisely so the difference is
   visible: in the prefilled code 0x605b5b615b5b5b the
   bytes at 1, 4 and 5 are all 0x5b and none of them is a
   destination; only 2 and 6 are.
   A PUSHn whose immediates run past the end of the code
   consumes the rest of the code (the truncated push of
   tool 73) and the walk ends there; that is reported as
   truncatedPush, and any 0x5b among the consumed bytes is
   a fake like any other push data.
   JUMPDEST itself is a no-op marker when execution falls
   through it, charged a flat 1 gas -- the cheapest opcode
   in the machine -- which is not a term of this analysis
   and is stated here only to place the opcode.
   The code is hex bytes YOU supply (0x prefix optional;
   empty is empty code), capped at 24,576 bytes, the
   EIP-170 limit on deployed code; odd-length or non-hex
   input is refused. The optional destination (decimal or
   0x hex; empty means no query) is answered against the
   computed set -- a destination at or past the end of the
   code, on a non-JUMPDEST instruction, or inside push
   data is not valid. Metadata in deployed code (the CBOR
   trailer a compiler appends) is walked as instructions
   like any other bytes, which is what a client's own
   analysis does; it normally contains no boundary 0x5b
   the walk lands on, and any it did contain would be a
   destination by the same rule. */
const JUMPDEST_MAX_BYTES = 24576;
function jumpdestCalc(codeStr, destStr) {
  if (typeof codeStr !== "string" || typeof destStr !== "string") return null;
  let h = codeStr.trim();
  if (/^0[xX]/.test(h)) h = h.slice(2);
  if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
  if (h.length / 2 > JUMPDEST_MAX_BYTES) return null;
  const bytes = [];
  for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.slice(i, i + 2), 16));
  let dest = null;
  const ds = destStr.trim();
  if (ds !== "") {
    dest = parseWord256(ds);
    if (dest === null) return null;
  }
  const jumpdests = [], fakes = [];
  let pc = 0, instructions = 0, truncated = false;
  while (pc < bytes.length) {
    const op = bytes[pc];
    instructions++;
    if (op === 0x5b) {
      jumpdests.push(pc);
      pc += 1;
    } else if (op >= 0x60 && op <= 0x7f) {
      const width = op - 0x5f;
      for (let k = 1; k <= width; k++) {
        if (pc + k < bytes.length && bytes[pc + k] === 0x5b) fakes.push(pc + k);
      }
      if (pc + 1 + width > bytes.length) truncated = true;
      pc += 1 + width;
    } else {
      pc += 1;
    }
  }
  return {
    codeBytes: String(bytes.length),
    instructions: String(instructions),
    jumpdests: jumpdests.map(String),
    jumpdestCount: String(jumpdests.length),
    fakes: fakes.map(String),
    fakeCount: String(fakes.length),
    truncatedPush: truncated ? "true" : "false",
    dest: dest === null ? "" : dest.toString(),
    destValid: dest === null ? "" : (jumpdests.some(d => BigInt(d) === dest) ? "true" : "false")
  };
}

/* Linear disassembly -- the EVM opcode assignment (Yellow
   Paper appendix H as carried through Cancun/Prague, plus
   CLZ 0x1e from EIP-7939, which the hub already prices).
   disasmCalc(code) lists one line per instruction the same
   next-instruction walk the JUMPDEST analyser uses lands on:
   advance 1 byte per instruction except PUSH1..PUSH32
   (0x60..0x7f), whose 1 + n bytes are opcode plus immediate
   data -- the data bytes produce NO line of their own, so
   the prefilled 0x605b5b615b5b5b (seven bytes, five of them
   0x5b) disassembles to exactly four lines and only the two
   boundary 0x5b bytes appear as JUMPDEST.
   Two honest-shape rules. First, a linear sweep is NOT an
   execution trace: it does not follow control flow, so
   instructions after a STOP, RETURN or JUMP are still
   listed -- they are instructions in the code whether or
   not any execution reaches them, and code a JUMP skips to
   is listed in address order, not visit order. Second,
   bytes with no assigned opcode are listed as UNASSIGNED
   with their byte shown -- executing one is an invalid-
   instruction exceptional halt, but it is not the assigned
   INVALID opcode (0xfe), and conflating the two would
   misname both.
   A truncated PUSHn lists the immediate bytes present and
   its pushed value pads the missing LOW-order bytes with
   zero (right-padding -- the push calculator's rule), so
   a truncated PUSH2 carrying only 0xff is listed as
   pushing 65280. PUSH0 has no immediate and no value
   suffix. Code is hex YOU supply, capped at 24,576 bytes
   (EIP-170) like the analyser above; odd-length or non-hex
   input is refused. Names only -- no gas, stack or memory
   effect is computed, and nothing is executed. */
const DISASM_NAMES = {
  0x00: "STOP", 0x01: "ADD", 0x02: "MUL", 0x03: "SUB", 0x04: "DIV",
  0x05: "SDIV", 0x06: "MOD", 0x07: "SMOD", 0x08: "ADDMOD",
  0x09: "MULMOD", 0x0a: "EXP", 0x0b: "SIGNEXTEND",
  0x10: "LT", 0x11: "GT", 0x12: "SLT", 0x13: "SGT", 0x14: "EQ",
  0x15: "ISZERO", 0x16: "AND", 0x17: "OR", 0x18: "XOR", 0x19: "NOT",
  0x1a: "BYTE", 0x1b: "SHL", 0x1c: "SHR", 0x1d: "SAR", 0x1e: "CLZ",
  0x20: "SHA3",
  0x30: "ADDRESS", 0x31: "BALANCE", 0x32: "ORIGIN", 0x33: "CALLER",
  0x34: "CALLVALUE", 0x35: "CALLDATALOAD", 0x36: "CALLDATASIZE",
  0x37: "CALLDATACOPY", 0x38: "CODESIZE", 0x39: "CODECOPY",
  0x3a: "GASPRICE", 0x3b: "EXTCODESIZE", 0x3c: "EXTCODECOPY",
  0x3d: "RETURNDATASIZE", 0x3e: "RETURNDATACOPY", 0x3f: "EXTCODEHASH",
  0x40: "BLOCKHASH", 0x41: "COINBASE", 0x42: "TIMESTAMP",
  0x43: "NUMBER", 0x44: "PREVRANDAO", 0x45: "GASLIMIT",
  0x46: "CHAINID", 0x47: "SELFBALANCE", 0x48: "BASEFEE",
  0x49: "BLOBHASH", 0x4a: "BLOBBASEFEE",
  0x50: "POP", 0x51: "MLOAD", 0x52: "MSTORE", 0x53: "MSTORE8",
  0x54: "SLOAD", 0x55: "SSTORE", 0x56: "JUMP", 0x57: "JUMPI",
  0x58: "PC", 0x59: "MSIZE", 0x5a: "GAS", 0x5b: "JUMPDEST",
  0x5c: "TLOAD", 0x5d: "TSTORE", 0x5e: "MCOPY", 0x5f: "PUSH0",
  0xa0: "LOG0", 0xa1: "LOG1", 0xa2: "LOG2", 0xa3: "LOG3", 0xa4: "LOG4",
  0xf0: "CREATE", 0xf1: "CALL", 0xf2: "CALLCODE", 0xf3: "RETURN",
  0xf4: "DELEGATECALL", 0xf5: "CREATE2", 0xfa: "STATICCALL",
  0xfd: "REVERT", 0xfe: "INVALID", 0xff: "SELFDESTRUCT"
};
for (let n = 1; n <= 32; n++) DISASM_NAMES[0x5f + n] = "PUSH" + n;
for (let n = 1; n <= 16; n++) { DISASM_NAMES[0x7f + n] = "DUP" + n; DISASM_NAMES[0x8f + n] = "SWAP" + n; }
function disasmCalc(codeStr) {
  if (typeof codeStr !== "string") return null;
  let h = codeStr.trim();
  if (/^0[xX]/.test(h)) h = h.slice(2);
  if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
  if (h.length / 2 > JUMPDEST_MAX_BYTES) return null;
  const bytes = [];
  for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.slice(i, i + 2), 16));
  const listing = [];
  let pc = 0, truncated = false, unassigned = 0, jumpdests = 0;
  while (pc < bytes.length) {
    const op = bytes[pc];
    if (op >= 0x60 && op <= 0x7f) {
      const width = op - 0x5f;
      const present = bytes.slice(pc + 1, pc + 1 + width);
      const immHex = present.map(b => b.toString(16).padStart(2, "0")).join("");
      let value = 0n;
      for (const b of present) value = value * 256n + BigInt(b);
      value = value * (256n ** BigInt(width - present.length));
      if (present.length < width) {
        truncated = true;
        listing.push(`${pc}: PUSH${width} 0x${immHex} [truncated: ${present.length} of ${width} immediate bytes present; missing low-order bytes read as zero] (= ${value.toString()})`);
      } else {
        listing.push(`${pc}: PUSH${width} 0x${immHex} (= ${value.toString()})`);
      }
      pc += 1 + width;
    } else {
      const name = DISASM_NAMES[op];
      if (name === undefined) {
        unassigned++;
        listing.push(`${pc}: UNASSIGNED (0x${op.toString(16).padStart(2, "0")})`);
      } else {
        if (op === 0x5b) jumpdests++;
        listing.push(`${pc}: ${name}`);
      }
      pc += 1;
    }
  }
  return {
    codeBytes: String(bytes.length),
    instructions: String(listing.length),
    listing,
    jumpdestCount: String(jumpdests),
    unassignedCount: String(unassigned),
    truncatedPush: truncated ? "true" : "false"
  };
}

/* Memory opcodes -- MLOAD (0x51), MSTORE (0x52), MSTORE8
   (0x53), all Frontier. memCalc(op, offset, value, memory)
   applies one memory opcode to memory YOU supply, given as
   hex bytes (0x prefix optional; empty is empty memory):
     - memory is a byte array, zero-initialised: bytes past
       the supplied length read as zero, and a write past the
       end extends the array with zeros in the gap;
     - MSTORE writes the value as a 32-byte BIG-ENDIAN word
       at the offset -- the value's low byte lands at
       offset + 31, not at the offset -- at any offset,
       aligned or not, overwriting the bytes it covers and
       leaving bytes outside the word untouched;
     - MSTORE8 writes ONE byte at the offset: the value's
       least significant byte, i.e. the value mod 256, so
       storing 511 (0x1ff) stores 0xff and the high bytes of
       the value are discarded -- the trap of the family,
       since an implementation that stores the whole word
       or refuses values above 255 is wrong on both sides;
     - MLOAD reads the 32 big-endian bytes starting at the
       offset and pushes them as one word; it never changes
       the bytes, only (possibly) the size.
   Size and gas: MSIZE is the touched size rounded UP to
   whole 32-byte words (a 6-byte memory still has MSIZE 32,
   and a 33rd byte makes it 64). Each opcode charges a flat
   3 (the Verylow tier) PLUS the memory-expansion increase
   for growing from the supplied size's word count to the
   touched size's word count, on the hub memory function's
   own cost curve -- total(w) = 3w + floor(w^2 / 512),
   charged as the increase only, so touching memory already
   covered costs the flat 3 alone, and growing empty memory
   to 1,024 bytes costs 3 + 98, the same 98 the expansion
   tool above quotes for that growth. MLOAD pays expansion
   too: reading far past the end is not free.
   Inputs are refused rather than wrapped: the offset and
   (for the stores) the value are single 256-bit words in
   decimal or 0x hex via parseWord256; the memory hex must
   be even-length; and the supplied memory and the touched
   end are each capped at 4,096 bytes so the resulting byte
   string stays displayable -- a real frame's memory is
   bounded by gas, not by this cap, which is a display cap
   and is stated as such. For MLOAD the value argument is
   never read. */
const MEMOP_MAX_BYTES = 4096;
const MEMOP_BYTES = { mload: "0x51", mstore: "0x52", mstore8: "0x53" };
function memCalc(opStr, offsetStr, valueStr, memoryStr) {
  if (typeof opStr !== "string" || typeof memoryStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(MEMOP_BYTES, op)) return null;
  const offset = parseWord256(offsetStr);
  if (offset === null || offset > BigInt(MEMOP_MAX_BYTES)) return null;
  let h = memoryStr.trim();
  if (/^0[xX]/.test(h)) h = h.slice(2);
  if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
  if (h.length / 2 > MEMOP_MAX_BYTES) return null;
  const before = [];
  for (let i = 0; i < h.length; i += 2) before.push(parseInt(h.slice(i, i + 2), 16));
  const width = op === "mstore8" ? 1 : 32;
  const off = Number(offset);
  const end = off + width;
  if (end > MEMOP_MAX_BYTES) return null;
  let value = null;
  if (op !== "mload") {
    value = parseWord256(valueStr);
    if (value === null) return null;
  }
  const after = before.slice();
  let result = null, storedByte = null;
  if (op === "mload") {
    result = 0n;
    for (let i = 0; i < 32; i++) {
      const b = off + i < before.length ? before[off + i] : 0;
      result = result * 256n + BigInt(b);
    }
  } else if (op === "mstore") {
    while (after.length < end) after.push(0);
    for (let i = 0; i < 32; i++) {
      after[off + i] = Number((value >> BigInt(8 * (31 - i))) & 0xffn);
    }
  } else {
    storedByte = value & 0xffn;
    while (after.length < end) after.push(0);
    after[off] = Number(storedByte);
  }
  const wordsBefore = BigInt(Math.ceil(before.length / 32));
  const wordsAfter = BigInt(Math.ceil(Math.max(before.length, end) / 32));
  const expansion = wordsAfter > wordsBefore ? memTotalCost(wordsAfter) - memTotalCost(wordsBefore) : 0n;
  const toHex = arr => "0x" + arr.map(b => b.toString(16).padStart(2, "0")).join("");
  const wordHex = v => v === null ? "" : "0x" + v.toString(16).padStart(64, "0");
  return {
    opcode: op, opcodeByte: MEMOP_BYTES[op],
    offset: offset.toString(), width: String(width),
    value: value === null ? "" : value.toString(), valueHex: wordHex(value),
    storedByte: storedByte === null ? "" : storedByte.toString(),
    result: result === null ? "" : result.toString(), resultHex: wordHex(result),
    memoryBefore: toHex(before), memoryAfter: toHex(after),
    memoryBeforeBytes: String(before.length), memoryAfterBytes: String(after.length),
    msizeBefore: (wordsBefore * 32n).toString(), msizeAfter: (wordsAfter * 32n).toString(),
    expansionGas: expansion.toString(), totalGas: (3n + expansion).toString()
  };
}

/* Calldata opcodes CALLDATALOAD (0x35) / CALLDATASIZE (0x36) /
   CALLDATACOPY (0x37), all Frontier — what a call frame's
   read-only input byte array, the calldata, yields. The three
   traps live in the padding and the offsets. CALLDATALOAD
   pushes the 32 big-endian bytes STARTING at its offset, so
   loading at 0 of a transfer(address,uint256) call pushes the
   selector in the HIGH four bytes followed by the first 28
   bytes of the address word — not the selector as a number,
   which sits at no offset; and offsets are BYTE offsets into
   the raw calldata including the 4 selector bytes, so the
   two argument words sit at 4 and 36, not at 0 and 1.
   CALLDATACOPY copies size bytes from a calldata offset to a
   memory destination, zero-padding the source past the
   calldata's end and zero-filling any memory gap, exactly as
   CALLDATALOAD zero-pads — the contrast is RETURNDATACOPY,
   the one copy that REVERTS when its source range runs past
   the return data's end, and borrowing that behaviour here
   is wrong. CALLDATASIZE pushes the calldata's length in
   bytes. Gas splits inside the family: SIZE is a flat 2 (the
   Base tier), LOAD a flat 3 (Verylow) at ANY offset — a load
   at 2^255 pushes 0 and still costs 3, because calldata is
   not memory and reading it expands nothing — and COPY is
   the flat 3 plus 3 per word copied (the size rounded up to
   whole words) plus the memory-expansion increase on the
   hub's own cost curve for growing the destination, the
   same total the hub's copy-gas tool quotes; a zero-size
   copy touches no memory whatever its destination and costs
   the flat 3 alone. Inputs are refused rather than wrapped:
   the offsets and size are single 256-bit words in decimal
   or 0x hex via parseWord256 (for LOAD the destination and
   size arguments are never read; for SIZE none of the three
   is); the calldata and memory hex must be even-length; and
   the supplied calldata, the supplied memory, the copy size
   and a non-empty copy's destination end are each capped at
   4,096 bytes so the byte strings stay displayable — display
   caps, stated as such. The offsets themselves are NOT
   capped: no allocation depends on them, a real frame's
   offsets are bounded by the stack word, not by this cap. */
const CDAT_MAX_BYTES = 4096;
const CDAT_BYTES = { calldataload: "0x35", calldatasize: "0x36", calldatacopy: "0x37" };
function cdCalc(opStr, offsetStr, destStr, sizeStr, calldataStr, memoryStr) {
  if (typeof opStr !== "string" || typeof calldataStr !== "string" || typeof memoryStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CDAT_BYTES, op)) return null;
  const parseBytes = s => {
    let h = s.trim();
    if (/^0[xX]/.test(h)) h = h.slice(2);
    if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
    if (h.length / 2 > CDAT_MAX_BYTES) return null;
    const arr = [];
    for (let i = 0; i < h.length; i += 2) arr.push(parseInt(h.slice(i, i + 2), 16));
    return arr;
  };
  const cd = parseBytes(calldataStr);
  const before = parseBytes(memoryStr);
  if (cd === null || before === null) return null;
  const after = before.slice();
  let offset = null, dest = null, size = null, result = null, copied = null;
  let baseGas = 0n, wordGas = 0n;
  if (op === "calldataload") {
    offset = parseWord256(offsetStr);
    if (offset === null) return null;
    result = 0n;
    for (let i = 0; i < 32; i++) {
      const idx = offset + BigInt(i);
      const b = idx < BigInt(cd.length) ? cd[Number(idx)] : 0;
      result = result * 256n + BigInt(b);
    }
    baseGas = 3n;
  } else if (op === "calldatasize") {
    result = BigInt(cd.length);
    baseGas = 2n;
  } else {
    offset = parseWord256(offsetStr);
    dest = parseWord256(destStr);
    size = parseWord256(sizeStr);
    if (offset === null || dest === null || size === null) return null;
    if (size > BigInt(CDAT_MAX_BYTES)) return null;
    if (size > 0n && (dest > BigInt(CDAT_MAX_BYTES) || dest + size > BigInt(CDAT_MAX_BYTES))) return null;
    const sz = Number(size);
    copied = [];
    for (let i = 0; i < sz; i++) {
      const idx = offset + BigInt(i);
      copied.push(idx < BigInt(cd.length) ? cd[Number(idx)] : 0);
    }
    if (sz > 0) {
      const d = Number(dest), end = d + sz;
      while (after.length < end) after.push(0);
      for (let i = 0; i < sz; i++) after[d + i] = copied[i];
    }
    wordGas = 3n * BigInt(Math.ceil(sz / 32));
    baseGas = 3n;
  }
  const touchedEnd = (op === "calldatacopy" && size !== null && size > 0n) ? Number(dest) + Number(size) : before.length;
  const wordsBefore = BigInt(Math.ceil(before.length / 32));
  const wordsAfter = BigInt(Math.ceil(Math.max(before.length, touchedEnd) / 32));
  const expansion = wordsAfter > wordsBefore ? memTotalCost(wordsAfter) - memTotalCost(wordsBefore) : 0n;
  const toHex = arr => "0x" + arr.map(b => b.toString(16).padStart(2, "0")).join("");
  const wordHex = v => v === null ? "" : "0x" + v.toString(16).padStart(64, "0");
  return {
    opcode: op, opcodeByte: CDAT_BYTES[op],
    calldataBytes: String(cd.length),
    offset: offset === null ? "" : offset.toString(),
    destOffset: dest === null ? "" : dest.toString(),
    copySize: size === null ? "" : size.toString(),
    result: result === null ? "" : result.toString(), resultHex: wordHex(result),
    copied: copied === null ? "" : toHex(copied),
    memoryBefore: toHex(before), memoryAfter: toHex(after),
    memoryBeforeBytes: String(before.length), memoryAfterBytes: String(after.length),
    msizeBefore: (wordsBefore * 32n).toString(), msizeAfter: (wordsAfter * 32n).toString(),
    wordGas: wordGas.toString(), expansionGas: expansion.toString(),
    totalGas: (baseGas + wordGas + expansion).toString()
  };
}

/* Returndata opcodes RETURNDATASIZE (0x3d) / RETURNDATACOPY
   (0x3e), both Byzantium (EIP-211) — what the frame's return
   data buffer, the bytes the most recent CALL-family opcode
   returned (or reverted with), yields. Before any call the
   buffer is empty. The family's one trap is the copy's bounds
   rule: RETURNDATACOPY is the ONE copy that does NOT zero-pad
   its source — if offset + size runs past the buffer's end
   (offset + size overflowing the word counts too, exactly as
   go-ethereum's opReturnDataCopy checks end = offset + size
   against the buffer length), the opcode HALTS exceptionally:
   the frame's remaining gas is consumed, nothing is copied
   and memory is unchanged, which this calculator reports as
   halted with no gas figure rather than inventing one. The
   check is unconditional — an exact fit (offset + size equal
   to the length, including a zero-size copy at offset equal
   to the length) succeeds, and a zero-size copy one byte
   further HALTS, it does not quietly touch nothing the way
   the other copies' zero-size cases do. Borrowing the
   zero-padding of CALLDATACOPY / CODECOPY here is exactly
   the bug Solidity's generated returndata checks exist to
   avoid. Gas: SIZE is a flat 2 (the Base tier), and a copy
   that stays in bounds pays the flat 3 plus 3 per word copied
   (the size rounded up to whole words) plus the
   memory-expansion increase on the hub's own cost curve for
   growing the destination — the same total the hub's
   copy-gas tool quotes for RETURNDATACOPY. Inputs are
   refused rather than wrapped: the offset, destination and
   size are single 256-bit words in decimal or 0x hex via
   parseWord256 (for SIZE none of the three is read); the
   return data and memory hex must be even-length; and the
   supplied return data, the supplied memory and a non-empty
   in-bounds copy's destination end are each capped at 4,096
   bytes so the byte strings stay displayable — display caps,
   stated as such. An out-of-bounds copy is reported halted
   before any destination cap is consulted, because no memory
   is materialised for it. */
const RDAT_MAX_BYTES = 4096;
const RDAT_BYTES = { returndatasize: "0x3d", returndatacopy: "0x3e" };
function rdCalc(opStr, offsetStr, destStr, sizeStr, returndataStr, memoryStr) {
  if (typeof opStr !== "string" || typeof returndataStr !== "string" || typeof memoryStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(RDAT_BYTES, op)) return null;
  const parseBytes = s => {
    let h = s.trim();
    if (/^0[xX]/.test(h)) h = h.slice(2);
    if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
    if (h.length / 2 > RDAT_MAX_BYTES) return null;
    const arr = [];
    for (let i = 0; i < h.length; i += 2) arr.push(parseInt(h.slice(i, i + 2), 16));
    return arr;
  };
  const rd = parseBytes(returndataStr);
  const before = parseBytes(memoryStr);
  if (rd === null || before === null) return null;
  const toHex = arr => "0x" + arr.map(b => b.toString(16).padStart(2, "0")).join("");
  const wordHex = v => v === null ? "" : "0x" + v.toString(16).padStart(64, "0");
  const wordsBefore = BigInt(Math.ceil(before.length / 32));
  if (op === "returndatasize") {
    const result = BigInt(rd.length);
    return {
      opcode: op, opcodeByte: RDAT_BYTES[op],
      returndataBytes: String(rd.length),
      offset: "", destOffset: "", copySize: "",
      result: result.toString(), resultHex: wordHex(result),
      copied: "",
      memoryBefore: toHex(before), memoryAfter: toHex(before),
      memoryBeforeBytes: String(before.length), memoryAfterBytes: String(before.length),
      msizeBefore: (wordsBefore * 32n).toString(), msizeAfter: (wordsBefore * 32n).toString(),
      wordGas: "", expansionGas: "", totalGas: "2", halted: "false"
    };
  }
  const offset = parseWord256(offsetStr);
  const dest = parseWord256(destStr);
  const size = parseWord256(sizeStr);
  if (offset === null || dest === null || size === null) return null;
  const base = {
    opcode: op, opcodeByte: RDAT_BYTES[op],
    returndataBytes: String(rd.length),
    offset: offset.toString(), destOffset: dest.toString(), copySize: size.toString(),
    result: "", resultHex: "",
    memoryBefore: toHex(before),
    memoryBeforeBytes: String(before.length),
    msizeBefore: (wordsBefore * 32n).toString()
  };
  if (offset + size > BigInt(rd.length)) {
    return { ...base, copied: "", memoryAfter: toHex(before),
      memoryAfterBytes: String(before.length), msizeAfter: (wordsBefore * 32n).toString(),
      wordGas: "", expansionGas: "", totalGas: "", halted: "true" };
  }
  if (size > 0n && (dest > BigInt(RDAT_MAX_BYTES) || dest + size > BigInt(RDAT_MAX_BYTES))) return null;
  const sz = Number(size), off = Number(offset);
  const copied = rd.slice(off, off + sz);
  const after = before.slice();
  if (sz > 0) {
    const d = Number(dest), end = d + sz;
    while (after.length < end) after.push(0);
    for (let i = 0; i < sz; i++) after[d + i] = copied[i];
  }
  const touchedEnd = size > 0n ? Number(dest) + sz : before.length;
  const wordsAfter = BigInt(Math.ceil(Math.max(before.length, touchedEnd) / 32));
  const expansion = wordsAfter > wordsBefore ? memTotalCost(wordsAfter) - memTotalCost(wordsBefore) : 0n;
  const wordGas = 3n * BigInt(Math.ceil(sz / 32));
  return { ...base, copied: toHex(copied), memoryAfter: toHex(after),
    memoryAfterBytes: String(after.length), msizeAfter: (wordsAfter * 32n).toString(),
    wordGas: wordGas.toString(), expansionGas: expansion.toString(),
    totalGas: (3n + wordGas + expansion).toString(), halted: "false" };
}

/* Code opcodes CODESIZE (0x38) / CODECOPY (0x39), both
   Frontier — what the executing account's own code yields.
   CODESIZE pushes the code's length in bytes; CODECOPY copies
   a range of it into memory. Two traps. First, the source is
   the code of the account whose code is executing — another
   account's code is EXTCODECOPY's job, and that opcode
   additionally pays the other account's EIP-2929 access cost,
   which this family's flat copy price does not include.
   Second, the copy ZERO-PADS its source: bytes past the
   code's end read as zero and those zeros are written into
   memory, so a copy starting at or past the end copies only
   zeros and never halts — borrowing RETURNDATACOPY's
   out-of-bounds halt here is exactly wrong, and constructor
   code relies on the padding when it copies the runtime code
   appended after the init code in the deployment bytecode.
   Gas: SIZE is a flat 2 (the Base tier), and a copy pays the
   flat 3 plus 3 per word copied (the size rounded up to whole
   words) plus the memory-expansion increase on the hub's own
   cost curve for growing the destination — the same total
   the hub's copy-gas tool quotes for CODECOPY; a zero-size
   copy touches no memory whatever its destination. Inputs
   are refused rather than wrapped: the offset, destination
   and size are single 256-bit words in decimal or 0x hex via
   parseWord256 (for SIZE none of the three is read); the
   code and memory hex must be even-length; and the supplied
   code, the supplied memory, the copy size and a non-empty
   copy's destination end are each capped at 4,096 bytes so
   the byte strings stay displayable — display caps, stated
   as such. */
const CODE_MAX_BYTES = 4096;
const CODE_BYTES = { codesize: "0x38", codecopy: "0x39" };
function codeCalc(opStr, offsetStr, destStr, sizeStr, codeStr, memoryStr) {
  if (typeof opStr !== "string" || typeof codeStr !== "string" || typeof memoryStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CODE_BYTES, op)) return null;
  const parseBytes = s => {
    let h = s.trim();
    if (/^0[xX]/.test(h)) h = h.slice(2);
    if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
    if (h.length / 2 > CODE_MAX_BYTES) return null;
    const arr = [];
    for (let i = 0; i < h.length; i += 2) arr.push(parseInt(h.slice(i, i + 2), 16));
    return arr;
  };
  const code = parseBytes(codeStr);
  const before = parseBytes(memoryStr);
  if (code === null || before === null) return null;
  const toHex = arr => "0x" + arr.map(b => b.toString(16).padStart(2, "0")).join("");
  const wordHex = v => v === null ? "" : "0x" + v.toString(16).padStart(64, "0");
  const wordsBefore = BigInt(Math.ceil(before.length / 32));
  if (op === "codesize") {
    const result = BigInt(code.length);
    return {
      opcode: op, opcodeByte: CODE_BYTES[op],
      codeBytes: String(code.length),
      offset: "", destOffset: "", copySize: "",
      result: result.toString(), resultHex: wordHex(result),
      copied: "",
      memoryBefore: toHex(before), memoryAfter: toHex(before),
      memoryBeforeBytes: String(before.length), memoryAfterBytes: String(before.length),
      msizeBefore: (wordsBefore * 32n).toString(), msizeAfter: (wordsBefore * 32n).toString(),
      wordGas: "", expansionGas: "", totalGas: "2"
    };
  }
  const offset = parseWord256(offsetStr);
  const dest = parseWord256(destStr);
  const size = parseWord256(sizeStr);
  if (offset === null || dest === null || size === null) return null;
  if (size > BigInt(CODE_MAX_BYTES)) return null;
  if (size > 0n && (dest > BigInt(CODE_MAX_BYTES) || dest + size > BigInt(CODE_MAX_BYTES))) return null;
  const sz = Number(size);
  const copied = [];
  for (let i = 0; i < sz; i++) {
    const idx = offset + BigInt(i);
    copied.push(idx < BigInt(code.length) ? code[Number(idx)] : 0);
  }
  const after = before.slice();
  if (sz > 0) {
    const d = Number(dest), end = d + sz;
    while (after.length < end) after.push(0);
    for (let i = 0; i < sz; i++) after[d + i] = copied[i];
  }
  const touchedEnd = size > 0n ? Number(dest) + sz : before.length;
  const wordsAfter = BigInt(Math.ceil(Math.max(before.length, touchedEnd) / 32));
  const expansion = wordsAfter > wordsBefore ? memTotalCost(wordsAfter) - memTotalCost(wordsBefore) : 0n;
  const wordGas = 3n * BigInt(Math.ceil(sz / 32));
  return {
    opcode: op, opcodeByte: CODE_BYTES[op],
    codeBytes: String(code.length),
    offset: offset.toString(), destOffset: dest.toString(), copySize: size.toString(),
    result: "", resultHex: "",
    copied: toHex(copied),
    memoryBefore: toHex(before), memoryAfter: toHex(after),
    memoryBeforeBytes: String(before.length), memoryAfterBytes: String(after.length),
    msizeBefore: (wordsBefore * 32n).toString(), msizeAfter: (wordsAfter * 32n).toString(),
    wordGas: wordGas.toString(), expansionGas: expansion.toString(),
    totalGas: (3n + wordGas + expansion).toString()
  };
}

/* Environment opcodes — ADDRESS (0x30), BALANCE (0x31), ORIGIN (0x32),
   CALLER (0x33), CALLVALUE (0x34), GASPRICE (0x3a), COINBASE (0x41),
   TIMESTAMP (0x42), NUMBER (0x43), PREVRANDAO (0x44), GASLIMIT (0x45),
   CHAINID (0x46), SELFBALANCE (0x47), BASEFEE (0x48), BLOBHASH (0x49)
   and BLOBBASEFEE (0x4a): each pushes one fact about the environment of
   the currently executing call frame, taken here from an environment
   YOU supply — this page executes nothing and reads no chain, so every
   field is an input, and each opcode reads only its own field(s); the
   rest are not consulted, exactly as the real opcode touches only its
   own piece of the frame.
   Gas is where the family splits, and the split is the lesson. Most
   members pay the flat Base tier 2. Two do not: SELFBALANCE pays 5
   (the Low tier — EIP-1884 set the price when it introduced the
   opcode in Istanbul, deliberately still cheaper than any BALANCE),
   and BLOBHASH pays 3 (Verylow). BALANCE has no flat price at all
   since Berlin: it pays the EIP-2929 account access cost for its
   target — 2,600 cold, 100 warm, the same total the hub's
   account-access gas tool quotes — because it reads ANOTHER
   account's state, while SELFBALANCE reads the executing account's
   own balance and never pays an access cost. An empty or
   nonexistent target still pays the cold 2,600: the access is
   charged for the touch, not for what is found.
   Three value traps. PREVRANDAO's byte 0x44 was DIFFICULTY until the
   Merge: EIP-4399 (Paris) repurposed the same opcode to push the
   beacon chain's randomness, so reading it as a difficulty is a
   category error, not a stale number. TIMESTAMP is in SECONDS (Unix
   time), not the milliseconds JavaScript's Date deals in — code that
   compares the two is off by a factor of 1,000. And BLOBHASH reads
   the TRANSACTION's list of blob versioned hashes (EIP-4844),
   pushing 0 when the index is past the list's end — it does NOT
   halt, the opposite failure mode from RETURNDATACOPY — and the
   list is empty in any transaction that carries no blobs.
   ORIGIN and CALLER are both "the sender", at different depths:
   ORIGIN pushes the transaction's signer in every frame, while
   CALLER pushes the immediate caller of THIS frame, so the two
   agree only in the outermost frame and diverge in nested calls.
   Inputs are refused rather than wrapped: addresses must be
   exactly 40 hex characters (0x prefix optional) and are pushed as
   the 160-bit word; value fields are single 256-bit words in
   decimal or 0x hex via parseWord256; BALANCE's warmth is a
   boolean, as in the hub's gas tools; the blob hash list is
   comma-separated 32-byte hashes (0x prefix optional per entry, an
   empty list allowed), capped at 32 entries so the list stays
   displayable — a display cap, stated as such. */
const ENV_BLOB_MAX = 32;
const ENV_OPS = {
  address:     { byte: "0x30", fork: "Frontier", gas: 2n },
  balance:     { byte: "0x31", fork: "Frontier; its gas is the EIP-2929 account access cost since Berlin", gas: null },
  origin:      { byte: "0x32", fork: "Frontier", gas: 2n },
  caller:      { byte: "0x33", fork: "Frontier", gas: 2n },
  callvalue:   { byte: "0x34", fork: "Frontier", gas: 2n },
  gasprice:    { byte: "0x3a", fork: "Frontier", gas: 2n },
  coinbase:    { byte: "0x41", fork: "Frontier", gas: 2n },
  timestamp:   { byte: "0x42", fork: "Frontier", gas: 2n },
  number:      { byte: "0x43", fork: "Frontier", gas: 2n },
  prevrandao:  { byte: "0x44", fork: "Paris (EIP-4399); this byte was DIFFICULTY before the Merge", gas: 2n },
  gaslimit:    { byte: "0x45", fork: "Frontier", gas: 2n },
  chainid:     { byte: "0x46", fork: "Istanbul (EIP-1344)", gas: 2n },
  selfbalance: { byte: "0x47", fork: "Istanbul (EIP-1884)", gas: 5n },
  basefee:     { byte: "0x48", fork: "London (EIP-3198)", gas: 2n },
  blobhash:    { byte: "0x49", fork: "Cancun (EIP-4844)", gas: 3n },
  blobbasefee: { byte: "0x4a", fork: "Cancun (EIP-7516)", gas: 2n }
};
function envCalc(opStr, addressStr, balanceAddrStr, balanceValueStr, balanceCold, selfBalanceStr, callerStr, callValueStr, originStr, gasPriceStr, coinbaseStr, timestampStr, numberStr, prevrandaoStr, gasLimitStr, chainIdStr, baseFeeStr, blobBaseFeeStr, blobIndexStr, blobHashesStr) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(ENV_OPS, op)) return null;
  const meta = ENV_OPS[op];
  const parseAddr = s => {
    if (typeof s !== "string") return null;
    let h = s.trim();
    if (/^0[xX]/.test(h)) h = h.slice(2);
    if (!/^[0-9a-fA-F]{40}$/.test(h)) return null;
    return h.toLowerCase();
  };
  const wordHex = v => "0x" + v.toString(16).padStart(64, "0");
  const base = { opcode: op, opcodeByte: meta.byte, fork: meta.fork,
    result: "", resultHex: "", resultAddress: "", accessGas: "", totalGas: "",
    blobIndex: "", blobCount: "", blobInRange: "" };
  const wordResult = (v, gas) => ({ ...base, result: v.toString(), resultHex: wordHex(v), totalGas: gas.toString() });
  const addrResult = (h, gas) => ({ ...wordResult(BigInt("0x" + h), gas), resultAddress: "0x" + h });
  switch (op) {
    case "address": { const a = parseAddr(addressStr); return a === null ? null : addrResult(a, meta.gas); }
    case "origin": { const a = parseAddr(originStr); return a === null ? null : addrResult(a, meta.gas); }
    case "caller": { const a = parseAddr(callerStr); return a === null ? null : addrResult(a, meta.gas); }
    case "coinbase": { const a = parseAddr(coinbaseStr); return a === null ? null : addrResult(a, meta.gas); }
    case "balance": {
      const a = parseAddr(balanceAddrStr);
      const v = parseWord256(balanceValueStr);
      if (a === null || v === null || typeof balanceCold !== "boolean") return null;
      const access = balanceCold ? 2600n : 100n;
      return { ...wordResult(v, access), resultAddress: "0x" + a, accessGas: access.toString() };
    }
    case "selfbalance": { const v = parseWord256(selfBalanceStr); return v === null ? null : wordResult(v, meta.gas); }
    case "blobhash": {
      const idx = parseWord256(blobIndexStr);
      if (idx === null || typeof blobHashesStr !== "string") return null;
      const hashes = [];
      if (blobHashesStr.trim() !== "") {
        for (const part of blobHashesStr.split(",")) {
          let h = part.trim();
          if (/^0[xX]/.test(h)) h = h.slice(2);
          if (!/^[0-9a-fA-F]{64}$/.test(h)) return null;
          hashes.push(h.toLowerCase());
        }
        if (hashes.length > ENV_BLOB_MAX) return null;
      }
      const inRange = idx < BigInt(hashes.length);
      const v = inRange ? BigInt("0x" + hashes[Number(idx)]) : 0n;
      return { ...wordResult(v, meta.gas), blobIndex: idx.toString(), blobCount: String(hashes.length), blobInRange: inRange ? "true" : "false" };
    }
    default: {
      const field = { callvalue: callValueStr, gasprice: gasPriceStr, timestamp: timestampStr,
        number: numberStr, prevrandao: prevrandaoStr, gaslimit: gasLimitStr,
        chainid: chainIdStr, basefee: baseFeeStr, blobbasefee: blobBaseFeeStr }[op];
      const v = parseWord256(field);
      return v === null ? null : wordResult(v, meta.gas);
    }
  }
}

/* BLOCKHASH (0x40, Frontier) — pushes the hash of one of the 256 most
   recent COMPLETE blocks, from a set of block hashes YOU supply as
   number:hash entries — this page executes nothing and reads no
   chain, so the chain history is an input, keyed by block number.
   The window rule is the whole semantics, and it is checked BEFORE
   the entries are ever consulted: the answer is the supplied hash
   exactly when target < current and current - target <= 256 — the
   current block itself is excluded (its hash is not yet known to the
   executing frame) and the far edge, exactly 256 back, is INCLUDED.
   Every other argument pushes 0: the current block, a future block,
   or a block 257 or more back. It does NOT halt, and it pushes 0
   even when a hash for that block sits in the supplied entries —
   supplying data does not extend the window, which is why the
   entries are parsed lazily, only for an in-window target: an
   out-of-window answer is 0 whatever the entries contain.
   Two further traps. The entries are a MAP keyed by block number,
   not a positional list like BLOBHASH's (0x49) — the order entries
   are written in is irrelevant, the number before the colon decides.
   And since Pectra, EIP-2935's history contract holds the last
   8,191 block hashes in state for direct contract reads — but the
   EIP states it has no impact on BLOCKHASH resolution, range or
   cost: the opcode's window stays 256, and confusing the contract's
   8,191 with the opcode's 256 is a category error.
   Gas is a flat 20 (G_blockhash) — an order above the flat 2 the
   neighbouring block opcodes (COINBASE / TIMESTAMP / NUMBER /
   PREVRANDAO / GASLIMIT) pay, and unchanged since Frontier.
   An in-window target with NO supplied hash is refused rather than
   answered 0: the real opcode would push that block's actual hash,
   and this page knows only the hashes it is given — inventing a 0
   would teach exactly the wrong lesson. Inputs are refused rather
   than wrapped: block numbers are single 256-bit words via
   parseWord256; each entry is number:hash with the hash exactly 32
   bytes (0x prefix optional); duplicate block numbers are ambiguous
   and refused; the entry list is capped at 256 entries — one full
   window — so it stays displayable, a display cap, stated as such. */
const BLOCKHASH_ENTRY_MAX = 256;
function blockhashCalc(currentStr, targetStr, entriesStr) {
  const current = parseWord256(currentStr);
  const target = parseWord256(targetStr);
  if (current === null || target === null || typeof entriesStr !== "string") return null;
  const depth = target <= current ? (current - target).toString() : "";
  const inWindow = target < current && (current - target) <= 256n;
  const base = { opcode: "blockhash", opcodeByte: "0x40", fork: "Frontier",
    current: current.toString(), target: target.toString(), depth,
    inWindow: inWindow ? "true" : "false", supplied: "",
    result: "0", resultHex: "0x" + "0".repeat(64), totalGas: "20" };
  if (!inWindow) return base;
  const entries = new Map();
  if (entriesStr.trim() !== "") {
    const parts = entriesStr.split(",");
    if (parts.length > BLOCKHASH_ENTRY_MAX) return null;
    for (const part of parts) {
      const pieces = part.split(":");
      if (pieces.length !== 2) return null;
      const n = parseWord256(pieces[0]);
      let h = pieces[1].trim();
      if (/^0[xX]/.test(h)) h = h.slice(2);
      if (n === null || !/^[0-9a-fA-F]{64}$/.test(h)) return null;
      const key = n.toString();
      if (entries.has(key)) return null;
      entries.set(key, h.toLowerCase());
    }
  }
  const h = entries.get(target.toString());
  if (h === undefined) return null;
  const v = BigInt("0x" + h);
  return { ...base, supplied: "true", result: v.toString(),
    resultHex: "0x" + v.toString(16).padStart(64, "0") };
}

/* Execution-state opcodes PC (0x58) / MSIZE (0x59) / GAS (0x5a),
   all Frontier, all a flat 2 (the Base tier) — what the executing
   frame itself reports: where it is, how much memory it holds,
   and how much gas it has left. This page executes nothing, so
   each piece of state is an input YOU supply, and each opcode
   reads only its own — the inputs are parsed lazily, inside each
   op's branch, because a real frame's PC executes fine whatever
   its gas counter holds.
   PC pushes the program counter of the PC instruction ITSELF —
   the byte offset at which the 0x58 sits in the executing code —
   not the offset of the next instruction: an implementation (or
   a mental model) pushing pc + 1 is off by one on every use, and
   in hand-written assembly that off-by-one is exactly a jump
   landing one byte early. PC takes no argument and reads no
   stack item; the value is fixed by where the opcode sits.
   MSIZE pushes the size in bytes of the ACTIVE memory: the
   highest memory end ever touched, rounded UP to a whole number
   of 32-byte words, because memory only ever grows in whole
   words — 0 for untouched memory, 32 after a single byte is
   touched, 64 once a 33rd byte is. The memory here is supplied
   as its byte contents, so the answer is the supplied length
   rounded up the same way the hub's memory opcode tool reports
   msizeAfter for a store.
   GAS pushes the frame's gas remaining AFTER the GAS opcode's
   own 2 is deducted: with G in hand when the frame reaches the
   GAS it pushes G − 2, never G — the quoted remainder is the
   gas the NEXT instruction can spend. With fewer than 2 in hand
   the GAS cannot pay for itself: an out-of-gas exceptional halt,
   the frame's gas consumed, nothing pushed, reported here as a
   halt with no result and no gas figure, exactly as the hub's
   other halts are reported. Two contrasts. GAS reports the
   frame's FULL remainder: the EIP-150 63/64 cap limits what a
   later CALL may forward, not what GAS reports. And GASLIMIT
   (0x45, in the environment calculator above) is a different
   quantity — the BLOCK's total gas limit, not this frame's
   remaining gas.
   Inputs are refused rather than wrapped: the pc and the gas in
   hand are single 256-bit words in decimal or 0x hex via
   parseWord256; the supplied memory hex must be even-length,
   and it is capped at 4,096 bytes so the byte string stays
   displayable — a display cap, stated as such, matching the
   hub's memory tools. */
const EXEC_STATE_BYTES = { pc: "0x58", msize: "0x59", gas: "0x5a" };
const EXEC_STATE_MEM_MAX = 4096;
function execCalc(opStr, pcStr, memoryStr, gasBeforeStr) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(EXEC_STATE_BYTES, op)) return null;
  const wordHex = v => "0x" + v.toString(16).padStart(64, "0");
  const base = { opcode: op, opcodeByte: EXEC_STATE_BYTES[op], fork: "Frontier",
    pc: "", memoryBytes: "", gasBefore: "", halted: "false",
    result: "", resultHex: "", totalGas: "2" };
  if (op === "pc") {
    const v = parseWord256(pcStr);
    if (v === null) return null;
    return { ...base, pc: v.toString(), result: v.toString(), resultHex: wordHex(v) };
  }
  if (op === "msize") {
    if (typeof memoryStr !== "string") return null;
    let h = memoryStr.trim();
    if (/^0[xX]/.test(h)) h = h.slice(2);
    if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
    if (h.length / 2 > EXEC_STATE_MEM_MAX) return null;
    const len = h.length / 2;
    const v = BigInt(Math.ceil(len / 32) * 32);
    return { ...base, memoryBytes: String(len), result: v.toString(), resultHex: wordHex(v) };
  }
  const before = parseWord256(gasBeforeStr);
  if (before === null) return null;
  if (before < 2n) {
    return { ...base, gasBefore: before.toString(), halted: "true", totalGas: "" };
  }
  const v = before - 2n;
  return { ...base, gasBefore: before.toString(), result: v.toString(), resultHex: wordHex(v) };
}

/* External code opcodes — EXTCODESIZE (0x3b, Frontier) and
   EXTCODEHASH (0x3f, Constantinople, EIP-1052): each pops one stack
   word and reads the account at its low 160 bits — ANOTHER account,
   where CODESIZE / CODECOPY above read the executing account's own
   code. The target here is supplied directly as that address
   (exactly 40 hex characters), together with the account state the
   answer turns on: its code, its balance and its nonce, all inputs
   YOU supply — this page executes nothing and reads no chain.
   EXTCODESIZE pushes the length in bytes of the target's code: 0
   for a non-existent account, and 0 for any account with no code,
   funded or not. It consults the code alone.
   EXTCODEHASH pushes the Keccak-256 of the target's code, with the
   EIP-1052 split that is the family's trap. A non-existent account,
   or an EMPTY one (EIP-161: nonce 0, balance 0, no code), pushes 0
   — NOT the hash of empty data. An account that exists and is not
   empty but has no code — a funded or transacted externally owned
   account — pushes keccak256("") = 0xc5d246…, the empty-data hash.
   An account with code pushes keccak256 of that code. So which of
   the two zero-ish answers appears turns on balance and nonce as
   well as code: emptiness is a three-field fact, and code that
   checks "hash == 0 means no contract" or "hash == c5d246… means
   the account does not exist" is wrong in one direction each.
   Gas is the other place the family changed: EIP-1052 priced
   EXTCODEHASH at a flat 400, but since Berlin both opcodes pay the
   EIP-2929 account access cost for their target and nothing else —
   2,600 cold, 100 warm, the same total the hub's account-access
   gas tool quotes for both — charged for the touch, not for what
   is found, so a cold read of a non-existent account costs the
   full 2,600.
   Inputs are parsed lazily, as on a real frame: EXTCODESIZE reads
   only the address, the code and the warmth, so a garbage balance
   or nonce cannot change its answer; EXTCODEHASH must read all
   three state fields to decide emptiness. Inputs are refused
   rather than wrapped: the address must be exactly 40 hex
   characters (0x prefix optional); balance and nonce are single
   256-bit words via parseWord256; the supplied code hex must be
   even-length and is capped at 4,096 bytes so the byte string
   stays displayable — a display cap, stated as such, matching the
   hub's code tools (real deployed code may run to the EIP-170
   limit of 24,576 bytes). */
const EXTCODE_OPS = {
  extcodesize: { byte: "0x3b", fork: "Frontier" },
  extcodehash: { byte: "0x3f", fork: "Constantinople (EIP-1052)" }
};
const EXTCODE_MAX_BYTES = 4096;
const EXTCODE_EMPTY_HASH = "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";
function extcodeCalc(opStr, addrStr, codeStr, balanceStr, nonceStr, cold) {
  if (typeof opStr !== "string" || typeof cold !== "boolean") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(EXTCODE_OPS, op)) return null;
  if (typeof addrStr !== "string" || typeof codeStr !== "string") return null;
  let addr = addrStr.trim();
  if (/^0[xX]/.test(addr)) addr = addr.slice(2);
  if (!/^[0-9a-fA-F]{40}$/.test(addr)) return null;
  let h = codeStr.trim();
  if (/^0[xX]/.test(h)) h = h.slice(2);
  if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
  if (h.length / 2 > EXTCODE_MAX_BYTES) return null;
  const code = [];
  for (let i = 0; i < h.length; i += 2) code.push(parseInt(h.slice(i, i + 2), 16));
  const meta = EXTCODE_OPS[op];
  const access = cold ? 2600n : 100n;
  const wordHex = v => "0x" + v.toString(16).padStart(64, "0");
  const base = { opcode: op, opcodeByte: meta.byte, fork: meta.fork,
    targetAddress: "0x" + addr.toLowerCase(), codeBytes: String(code.length),
    empty: "", result: "", resultHex: "",
    accessGas: access.toString(), totalGas: access.toString() };
  if (op === "extcodesize") {
    const v = BigInt(code.length);
    return { ...base, result: v.toString(), resultHex: wordHex(v) };
  }
  const balance = parseWord256(balanceStr);
  const nonce = parseWord256(nonceStr);
  if (balance === null || nonce === null) return null;
  const empty = balance === 0n && nonce === 0n && code.length === 0;
  const hash = empty ? "0".repeat(64)
    : code.length === 0 ? EXTCODE_EMPTY_HASH
    : keccak256Bytes(code);
  const v = BigInt("0x" + hash);
  return { ...base, empty: empty ? "true" : "false",
    result: v.toString(), resultHex: "0x" + hash };
}

/* EXTCODECOPY (0x3c, Frontier) — copies a range of ANOTHER account's
   code into the executing frame's memory: the target account (its
   address and its code), the code offset, the memory destination,
   the size and the memory before are all inputs YOU supply — this
   page executes nothing and reads no chain. It is the copy the
   code opcode calculator above deliberately splits off: CODECOPY
   copies the executing account's OWN code at a flat base, while
   this copy reads a different account, and that difference is
   priced. The copy itself behaves exactly like CODECOPY's: it
   ZERO-PADS its source, so bytes past the target code's end read
   as zero and those zeros are written into memory, a copy starting
   at or past the end copies only zeros, and it never halts —
   borrowing RETURNDATACOPY's out-of-bounds halt here is exactly
   wrong. A target with no code — an externally owned account, an
   empty account, a non-existent account — copies only zeros, at
   the full price below: the account is touched whether or not it
   holds code.
   Gas is where this copy differs from every other copy on the
   hub, and the difference is the lesson. There is NO flat base:
   since Berlin the total is the target's EIP-2929 account access
   cost (2,600 cold, 100 warm — the same term the hub's
   EXTCODECOPY gas tool quotes, and the tests cross-check the two
   tools against each other exactly) PLUS 3 per word copied (the
   size rounded up to whole words) PLUS the memory-expansion
   increase on the hub's own cost curve for growing the
   destination. So the hub's prefilled CODECOPY — 32 bytes of the
   same 7-byte code into fresh memory — costs 9 own-code (flat 3
   + 3 + 3), while the same copy here costs 2,606 cold and 106
   warm. A zero-size copy touches no memory whatever its
   destination, but it still pays the access cost in full — 2,600
   cold, 100 warm — because the account is touched even when
   nothing is copied; CODECOPY's zero-size copy, by contrast,
   costs its flat 3 alone.
   Inputs are refused rather than wrapped: the target address
   must be exactly 40 hex characters (0x prefix optional); the
   offset, destination and size are single 256-bit words in
   decimal or 0x hex via parseWord256; the target code and the
   memory hex must be even-length; the warmth is a boolean; and
   the supplied code, the supplied memory, the copy size and a
   non-empty copy's destination end are each capped at 4,096
   bytes so the byte strings stay displayable — display caps,
   stated as such (real deployed code may run to the EIP-170
   limit of 24,576 bytes). */
const EXTCODECOPY_MAX_BYTES = 4096;
function extcopyCalc(addrStr, offsetStr, destStr, sizeStr, codeStr, memoryStr, cold) {
  if (typeof cold !== "boolean") return null;
  if (typeof addrStr !== "string" || typeof codeStr !== "string" || typeof memoryStr !== "string") return null;
  let addr = addrStr.trim();
  if (/^0[xX]/.test(addr)) addr = addr.slice(2);
  if (!/^[0-9a-fA-F]{40}$/.test(addr)) return null;
  const parseBytes = s => {
    let h = s.trim();
    if (/^0[xX]/.test(h)) h = h.slice(2);
    if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
    if (h.length / 2 > EXTCODECOPY_MAX_BYTES) return null;
    const arr = [];
    for (let i = 0; i < h.length; i += 2) arr.push(parseInt(h.slice(i, i + 2), 16));
    return arr;
  };
  const code = parseBytes(codeStr);
  const before = parseBytes(memoryStr);
  if (code === null || before === null) return null;
  const offset = parseWord256(offsetStr);
  const dest = parseWord256(destStr);
  const size = parseWord256(sizeStr);
  if (offset === null || dest === null || size === null) return null;
  if (size > BigInt(EXTCODECOPY_MAX_BYTES)) return null;
  if (size > 0n && (dest > BigInt(EXTCODECOPY_MAX_BYTES) || dest + size > BigInt(EXTCODECOPY_MAX_BYTES))) return null;
  const toHex = arr => "0x" + arr.map(b => b.toString(16).padStart(2, "0")).join("");
  const sz = Number(size);
  const copied = [];
  for (let i = 0; i < sz; i++) {
    const idx = offset + BigInt(i);
    copied.push(idx < BigInt(code.length) ? code[Number(idx)] : 0);
  }
  const after = before.slice();
  if (sz > 0) {
    const d = Number(dest), end = d + sz;
    while (after.length < end) after.push(0);
    for (let i = 0; i < sz; i++) after[d + i] = copied[i];
  }
  const wordsBefore = BigInt(Math.ceil(before.length / 32));
  const touchedEnd = size > 0n ? Number(dest) + sz : before.length;
  const wordsAfter = BigInt(Math.ceil(Math.max(before.length, touchedEnd) / 32));
  const expansion = wordsAfter > wordsBefore ? memTotalCost(wordsAfter) - memTotalCost(wordsBefore) : 0n;
  const wordGas = 3n * BigInt(Math.ceil(sz / 32));
  const access = cold ? 2600n : 100n;
  return {
    opcode: "extcodecopy", opcodeByte: "0x3c", fork: "Frontier",
    targetAddress: "0x" + addr.toLowerCase(), codeBytes: String(code.length),
    offset: offset.toString(), destOffset: dest.toString(), copySize: size.toString(),
    copied: toHex(copied),
    memoryBefore: toHex(before), memoryAfter: toHex(after),
    memoryBeforeBytes: String(before.length), memoryAfterBytes: String(after.length),
    msizeBefore: (wordsBefore * 32n).toString(), msizeAfter: (wordsAfter * 32n).toString(),
    accessGas: access.toString(), wordGas: wordGas.toString(), expansionGas: expansion.toString(),
    totalGas: (access + wordGas + expansion).toString()
  };
}

/* JUMP (0x56) / JUMPI (0x57), both Frontier — the control-flow
   pair the JUMPDEST analyser and the disassembler above set up.
   jumpCalc(op, dest, cond, code) applies one jump opcode to the
   code YOU supply: the destination (and, for JUMPI, the condition)
   are the words the opcode pops, given directly — this page
   executes nothing and reads no chain, and the stack the words
   came from is the caller's, as on the hub's other opcode tools.
   Stack order for JUMPI matters when the words are produced: the
   destination sits on TOP of the stack and is popped first, the
   condition second.
   The destination is legal only when it is a valid jump
   destination under the Yellow Paper's own definition — an
   offset where the next-instruction walk from pc 0 (advance 1 per
   opcode, except PUSH1..PUSH32 advance 1 + n over their
   immediate data, and PUSH0 advances 1) lands on a 0x5b byte AS
   an instruction — the set the hub's JUMPDEST analyser computes,
   and the tests cross-check this tool's verdict against that
   analyser exactly on a spread. Every other destination — a
   non-JUMPDEST instruction, an offset at or past the code's end,
   or a 0x5b byte sitting inside PUSH immediate data (an impostor
   the analyser lists as a fake) — is an invalid jump
   destination: an exceptional halt that consumes the frame's
   gas, reported here as a halt with no gas figure, in the hub's
   existing halt shape.
   JUMPI's trap is WHEN the destination is checked. JUMPI jumps
   only when its condition is non-zero — any non-zero word, not
   just 1 — and the destination is validated only on that taken
   path. With a zero condition execution falls through to the
   next instruction and the destination is never consulted: a
   JUMPI to an impostor offset, or past the code's end, with a
   zero condition is NOT a halt. A model that validates the
   destination before reading the condition halts frames a real
   client runs fine. Symmetrically, JUMP is unconditional: it
   has no condition, and its condition input below is never read
   (parsed lazily, like the hub's other per-opcode fields).
   Gas is flat and has no other term: JUMP 8 (the Mid tier),
   JUMPI 10 (the High tier) — JUMPI pays its 10 on a fall-through
   too, because the opcode ran; only the invalid-destination halt
   has no single-opcode figure, since it consumes the frame.
   Inputs are refused rather than wrapped: the destination and
   (for JUMPI) the condition are single 256-bit words in decimal
   or 0x hex via parseWord256; the code hex must be even-length
   and is capped at 24,576 bytes, the EIP-170 limit on deployed
   code, matching the analyser above. On a fall-through the next
   program counter is the instruction after the JUMPI, whose own
   offset is not an input, so nextPc is reported empty there. */
const JUMP_OPS = {
  jump: { byte: "0x56", gas: 8n },
  jumpi: { byte: "0x57", gas: 10n }
};
const JUMP_MAX_BYTES = 24576;
function jumpCalc(opStr, destStr, condStr, codeStr) {
  if (typeof opStr !== "string" || typeof codeStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(JUMP_OPS, op)) return null;
  let h = codeStr.trim();
  if (/^0[xX]/.test(h)) h = h.slice(2);
  if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
  if (h.length / 2 > JUMP_MAX_BYTES) return null;
  const bytes = [];
  for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.slice(i, i + 2), 16));
  const dest = parseWord256(destStr);
  if (dest === null) return null;
  let cond = null;
  if (op === "jumpi") {
    cond = parseWord256(condStr);
    if (cond === null) return null;
  }
  const jumpdests = [], fakes = [];
  let pc = 0;
  while (pc < bytes.length) {
    const b = bytes[pc];
    if (b === 0x5b) {
      jumpdests.push(pc);
      pc += 1;
    } else if (b >= 0x60 && b <= 0x7f) {
      const width = b - 0x5f;
      for (let k = 1; k <= width; k++) {
        if (pc + k < bytes.length && bytes[pc + k] === 0x5b) fakes.push(pc + k);
      }
      pc += 1 + width;
    } else {
      pc += 1;
    }
  }
  const meta = JUMP_OPS[op];
  const valid = jumpdests.some(d => BigInt(d) === dest);
  const fake = fakes.some(f => BigInt(f) === dest);
  const base = { opcode: op, opcodeByte: meta.byte, fork: "Frontier",
    codeBytes: String(bytes.length), dest: dest.toString(),
    condition: op === "jumpi" ? cond.toString() : "",
    conditionZero: op === "jumpi" ? (cond === 0n ? "true" : "false") : "",
    destValid: valid ? "true" : "false", destFake: fake ? "true" : "false",
    validDests: jumpdests.map(String), validCount: String(jumpdests.length) };
  if (op === "jumpi" && cond === 0n) {
    return { ...base, outcome: "fallthrough", nextPc: "", halted: "false", totalGas: meta.gas.toString() };
  }
  if (valid) {
    return { ...base, outcome: "jump", nextPc: dest.toString(), halted: "false", totalGas: meta.gas.toString() };
  }
  return { ...base, outcome: "halt", nextPc: "", halted: "true", totalGas: "" };
}

/* Storage opcodes -- SLOAD (0x54) / SSTORE (0x55), both
   Frontier: the executing contract's own persistent storage,
   one 32-byte word per 256-bit slot. The hub already prices
   these opcodes in isolation (the SLOAD gas tool, the SSTORE
   gas & refund tool); this tool applies them: SLOAD pushes the
   slot's CURRENT word and changes nothing, SSTORE replaces the
   slot's word with the new value it pops (key on top of the
   stack, value second) and reports the word stored after.
   Original means the value the slot held when the transaction
   began, current the value it holds just before this opcode --
   the pair EIP-2200 meters against -- and both are read only
   by SSTORE: SLOAD consults the current word and the slot's
   warmth alone, so its original, new-value and gas fields are
   never parsed (lazily, like the hub's other per-opcode
   fields, and the tests carry garbage-field cases for it).
   Gas follows the current rules, restated here in my own
   words. SLOAD pays only the EIP-2929 slot access cost: 2,100
   cold (the slot's first touch in this transaction) or 100
   warm -- the same total the hub's SLOAD gas tool quotes, and
   the tests cross-check the two tools exactly. SSTORE is
   metered by EIP-2200 as amended by EIP-2929 and EIP-3529,
   implemented here independently and cross-checked in tests
   against the hub's SSTORE gas function exactly: a no-op
   (new == current) costs 100; a clean slot (current ==
   original) costs 20,000 to set from zero, or 2,900 to reset
   or clear, a clear earning a 4,800 refund-counter increase
   (EIP-3529's figure, down from 15,000); a dirty slot
   (current != original) costs 100 with refund-counter
   adjustments -- undoing an earlier clear in the same
   transaction subtracts 4,800, clearing adds 4,800, and
   restoring the original value adds 19,900 when the original
   was zero or 2,800 when it was not -- and a cold slot adds
   2,100 to any of these.
   SSTORE's trap is the EIP-2200 sentry, checked BEFORE any
   metering: if the frame's gas remaining is at or below the
   2,300 call stipend, SSTORE halts out of gas even when the
   write itself would cost only 100 -- that is what stops a
   stipend-funded fallback frame from changing state. A frame
   above the sentry but below the metered cost halts out of
   gas too; the two halts are reported with distinct reasons
   (sentry / insufficient), the storage is left unchanged,
   and no gas or refund figure applies, in the hub's halt
   shape. Gas exactly equal to the metered cost succeeds.
   SLOAD has no sentry and no gas input. Honest scope: an
   SSTORE inside a static context fails for a non-gas reason
   (write protection) not modelled here; the slot, values,
   warmth and gas remaining are user-supplied values, not
   execution state or live chain data this page reads; the
   refund figure is the refund-COUNTER change this one opcode
   makes, before the transaction-level cap (EIP-3529 caps the
   applied refund at a fifth of the gas used); and a frame
   revert undoes the frame's storage writes, which a single
   opcode application cannot show. All words are single
   256-bit values via the SSTORE gas tool's parser, refused
   rather than wrapped when wider. */
const STORAGE_OPS = {
  sload: { byte: "0x54" },
  sstore: { byte: "0x55" }
};
const SSTORE_SENTRY_GAS = 2300n;
function storageCalc(opStr, slotStr, originalStr, currentStr, newStr, gasStr, cold) {
  if (typeof opStr !== "string") return null;
  if (typeof cold !== "boolean") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(STORAGE_OPS, op)) return null;
  const slot = sstoreParseWord(slotStr);
  const current = sstoreParseWord(currentStr);
  if (slot === null || current === null) return null;
  const wordHex = v => "0x" + v.toString(16).padStart(64, "0");
  const base = { opcode: op, opcodeByte: STORAGE_OPS[op].byte, fork: "Frontier",
    slot: slot.toString(), slotHex: wordHex(slot),
    cold: cold ? "true" : "false" };
  if (op === "sload") {
    const gas = cold ? 2100n : 100n;
    return { ...base, original: "", current: current.toString(), newValue: "",
      pushed: current.toString(), storageAfter: current.toString(),
      storageAfterHex: wordHex(current), branch: "",
      totalGas: gas.toString(), refundDelta: "", gasBefore: "",
      halted: "false", haltReason: "", outcome: "load" };
  }
  const original = sstoreParseWord(originalStr);
  const fresh = sstoreParseWord(newStr);
  const gasBefore = sstoreParseWord(gasStr);
  if (original === null || fresh === null || gasBefore === null) return null;
  const full = { ...base, original: original.toString(),
    current: current.toString(), newValue: fresh.toString(), pushed: "",
    gasBefore: gasBefore.toString() };
  if (gasBefore <= SSTORE_SENTRY_GAS) {
    return { ...full, storageAfter: current.toString(),
      storageAfterHex: wordHex(current), branch: "", totalGas: "",
      refundDelta: "", halted: "true", haltReason: "sentry", outcome: "halt" };
  }
  let gas, refund = 0n, branch;
  if (fresh === current) {
    gas = 100n; branch = "no-op";
  } else if (current === original) {
    if (original === 0n) { gas = 20000n; branch = "clean-set"; }
    else if (fresh === 0n) { gas = 2900n; refund = 4800n; branch = "clean-clear"; }
    else { gas = 2900n; branch = "clean-reset"; }
  } else {
    gas = 100n; branch = "dirty";
    if (original !== 0n) {
      if (current === 0n) refund -= 4800n;
      if (fresh === 0n) refund += 4800n;
    }
    if (fresh === original) refund += original === 0n ? 19900n : 2800n;
  }
  if (cold) gas += 2100n;
  if (gasBefore < gas) {
    return { ...full, storageAfter: current.toString(),
      storageAfterHex: wordHex(current), branch: "", totalGas: "",
      refundDelta: "", halted: "true", haltReason: "insufficient", outcome: "halt" };
  }
  return { ...full, storageAfter: fresh.toString(),
    storageAfterHex: wordHex(fresh), branch, totalGas: gas.toString(),
    refundDelta: refund.toString(), halted: "false", haltReason: "", outcome: "store" };
}

/* Transient storage opcode calculator -- TLOAD (0x5c) /
   TSTORE (0x5d), Cancun, EIP-1153. The semantics sibling of
   the hub's transient storage GAS tool and the deliberate
   contrast to the persistent storageCalc above: transient
   storage is a per-contract word store that lives only for
   one transaction (reentrancy locks are the classic use),
   addressed exactly like SLOAD / SSTORE but discarded in
   full when the transaction ends. TLOAD pops a slot key and
   pushes that slot's current transient word -- 0 for a slot
   not yet written in this transaction -- changing nothing.
   TSTORE pops the key first (it sits on top of the stack)
   and the value second, and replaces the word; a frame's
   revert undoes that frame's transient writes, as with
   persistent storage. Both cost a FLAT 100, cross-checked in
   tests against the hub's transientGasCalc exactly: there is
   no EIP-2929 cold/warm split (transient slots never enter
   the accessed sets, so a first touch costs the same 100 as
   every later touch and an EIP-2930 access list cannot
   pre-warm one), no EIP-2200 metering tree (there is no
   transaction-original word to meter against, so setting,
   resetting, clearing and rewriting the same value all cost
   the same 100), and no refund ever (the store is discarded
   anyway, so clearing a word earns nothing where an SSTORE
   clear earns 4,800). The family's trap is the ABSENT
   sentry: TSTORE is exempt from SSTORE's EIP-2200 stipend
   guard, so a write runs whenever the frame's gas remaining
   covers the flat 100 -- at 2,300, where the same-priced
   SSTORE no-op halts on the sentry, at 150, and at exactly
   100 -- and halts out of gas only below 100, with the
   single reason insufficient, the storage left unchanged
   and no gas figure, in the hub's halt shape. TLOAD has no
   gas input and never halts here; its new-value and gas
   fields are parsed lazily (never read), like SLOAD's.
   Honest scope: a TSTORE inside a static context fails for
   a non-gas reason (write protection) not modelled here
   (TLOAD is allowed there); the whole store is discarded at
   the transaction's end, which a single opcode application
   cannot show; and the slot, values and gas remaining are
   user-supplied values, not execution state or live chain
   data this page reads. All words are single 256-bit values
   via the SSTORE gas tool's parser, refused rather than
   wrapped when wider. */
const TSTORAGE_OPS = {
  tload: { byte: "0x5c" },
  tstore: { byte: "0x5d" }
};
const TSTORAGE_GAS = 100n;
function tstorageCalc(opStr, slotStr, currentStr, newStr, gasStr) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(TSTORAGE_OPS, op)) return null;
  const slot = sstoreParseWord(slotStr);
  const current = sstoreParseWord(currentStr);
  if (slot === null || current === null) return null;
  const wordHex = v => "0x" + v.toString(16).padStart(64, "0");
  const base = { opcode: op, opcodeByte: TSTORAGE_OPS[op].byte, fork: "Cancun",
    slot: slot.toString(), slotHex: wordHex(slot),
    current: current.toString() };
  if (op === "tload") {
    return { ...base, newValue: "", pushed: current.toString(),
      storageAfter: current.toString(), storageAfterHex: wordHex(current),
      branch: "", totalGas: TSTORAGE_GAS.toString(), refundDelta: "0",
      gasBefore: "", halted: "false", haltReason: "", outcome: "load" };
  }
  const fresh = sstoreParseWord(newStr);
  const gasBefore = sstoreParseWord(gasStr);
  if (fresh === null || gasBefore === null) return null;
  const full = { ...base, newValue: fresh.toString(), pushed: "",
    gasBefore: gasBefore.toString() };
  if (gasBefore < TSTORAGE_GAS) {
    return { ...full, storageAfter: current.toString(),
      storageAfterHex: wordHex(current), branch: "", totalGas: "",
      refundDelta: "", halted: "true", haltReason: "insufficient", outcome: "halt" };
  }
  return { ...full, storageAfter: fresh.toString(),
    storageAfterHex: wordHex(fresh), branch: "",
    totalGas: TSTORAGE_GAS.toString(), refundDelta: "0",
    halted: "false", haltReason: "", outcome: "store" };
}

/* Call opcode calculator -- CALL (0xf1) / CALLCODE (0xf2),
   Frontier; DELEGATECALL (0xf4), Homestead (EIP-7);
   STATICCALL (0xfa), Byzantium (EIP-214) -- the semantics
   sibling of the hub's two CALL-family GAS tools, whose base
   cost, forwarding cap, stipend and callee gas this function
   takes from callGasCalc / otherCallGasCalc exactly (tests
   cross-check the fields): EIP-2929 access 2,600 cold / 100
   warm, +9,000 when CALL or CALLCODE carries value, +25,000
   more when a value-carrying CALL funds an empty target, and
   memory expansion for the input and output regions together.
   The child frame's execution is the one thing not modelled:
   its outcome is a value you SUPPLY -- whether it has code at
   all, whether it succeeds, reverts or halts, how much of its
   allowance it uses, and what it returns -- and this function
   applies everything around that execution. If the frame's
   gas is below the base cost the CALLER halts exceptionally
   (no word pushed, no gas figure, in the hub's halt shape).
   Three failures are SOFT instead -- the opcode pushes 0,
   forwards nothing, and only the base cost is gone, checked
   in the client's order: the depth is at the 1,024 limit; a
   value-carrying CALL or CALLCODE inside a static frame; the
   caller's balance is below the value. A target with no code
   succeeds immediately at that point (a CALL's value still
   moves; the outcome, gas-used and return-data fields are
   never read on that path), forwarding nothing net. That is
   also the only path the 25,000 new-account charge can ever
   coincide with: an empty account has no code by definition,
   so an input claiming both an empty target and target code
   is refused as inconsistent. An
   executed child that succeeds or reverts returns its unused
   allowance -- INCLUDING any unused stipend, which the caller
   never paid, so a value call whose child uses nothing nets
   the caller 2,300 less than its base cost. REVERT still sets
   the returndata buffer to the child's full return and still
   copies min(return length, output size) bytes into the
   output region, but rolls the value transfer back; a child
   that halts exceptionally consumes its whole allowance
   (forwarded plus stipend), sets an EMPTY returndata buffer
   and copies nothing, and its gas-used and return-data fields
   are never read. The contexts are the family's other trap:
   CALL runs the target's code at the target with sender =
   caller and the call's value; CALLCODE runs the target's
   code AT the caller (sender = caller, the value credited to
   the caller's own account, so no balance ever moves, no
   new-account charge can apply, and the balance check is
   against the caller's own balance); DELEGATECALL runs the
   target's code at the caller keeping the INHERITED sender
   and value -- its own value field does not exist and is
   never read -- and is allowed inside a static frame;
   STATICCALL runs the target's code at the target with the
   value forced to 0 in a static frame, so its value field is
   never read either. A self-call (caller = target) nets to
   zero. Honest scope: the callee's own execution, storage and
   logs are not modelled; precompiles are treated as the
   no-code accounts they appear to be; warmth, emptiness,
   balances, depth and the static flag are user-supplied
   values, not execution state or live chain data. Memory,
   return data and any non-empty input/output region end are
   capped at 4,096 bytes as stated display caps; all words are
   single 256-bit values refused rather than wrapped. */
const CALLOP_BYTES = { call: "0xf1", callcode: "0xf2", delegatecall: "0xf4", staticcall: "0xfa" };
const CALLOP_FORKS = { call: "Frontier", callcode: "Frontier", delegatecall: "Homestead", staticcall: "Byzantium" };
const CALLOP_MAX_BYTES = 4096;
function callCalc(opStr, gasAvailStr, gasReqStr, valueStr, callerStr, targetStr, senderStr, callValueStr,
    callerBalStr, targetBalStr, depthStr, outcomeStr, calleeGasUsedStr, retDataStr,
    memoryStr, inOffStr, inSizeStr, outOffStr, outSizeStr, cold, targetEmpty, targetHasCode, inStatic) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CALLOP_BYTES, op)) return null;
  if (typeof cold !== "boolean" || typeof targetEmpty !== "boolean" ||
      typeof targetHasCode !== "boolean" || typeof inStatic !== "boolean") return null;
  if (typeof memoryStr !== "string") return null;
  const parseAddr = s => {
    if (typeof s !== "string") return null;
    let h = s.trim();
    if (/^0[xX]/.test(h)) h = h.slice(2);
    if (!/^[0-9a-fA-F]{40}$/.test(h)) return null;
    return "0x" + h.toLowerCase();
  };
  const parseBytes = s => {
    let h = s.trim();
    if (/^0[xX]/.test(h)) h = h.slice(2);
    if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
    if (h.length / 2 > CALLOP_MAX_BYTES) return null;
    const arr = [];
    for (let i = 0; i < h.length; i += 2) arr.push(parseInt(h.slice(i, i + 2), 16));
    return arr;
  };
  const gasAvail = sstoreParseWord(gasAvailStr);
  const gasReq = sstoreParseWord(gasReqStr);
  const caller = parseAddr(callerStr);
  const target = parseAddr(targetStr);
  const callerBal = sstoreParseWord(callerBalStr);
  const targetBal = sstoreParseWord(targetBalStr);
  const depth = sstoreParseWord(depthStr);
  const memory = parseBytes(memoryStr);
  const inOff = sstoreParseWord(inOffStr), inSize = sstoreParseWord(inSizeStr);
  const outOff = sstoreParseWord(outOffStr), outSize = sstoreParseWord(outSizeStr);
  if (gasAvail === null || gasReq === null || callerBal === null || targetBal === null ||
      depth === null || inOff === null || inSize === null || outOff === null || outSize === null ||
      caller === null || target === null || memory === null) return null;
  if (inSize > 0n && inOff + inSize > BigInt(CALLOP_MAX_BYTES)) return null;
  if (outSize > 0n && outOff + outSize > BigInt(CALLOP_MAX_BYTES)) return null;
  let effValue = 0n, sender = null, callValue = 0n;
  if (op === "call" || op === "callcode") {
    effValue = sstoreParseWord(valueStr);
    if (effValue === null) return null;
  } else if (op === "delegatecall") {
    sender = parseAddr(senderStr);
    callValue = sstoreParseWord(callValueStr);
    if (sender === null || callValue === null) return null;
  }
  if (op === "call" && targetEmpty && (targetBal !== 0n || targetHasCode)) return null;
  const inOffG = inSize === 0n ? "0" : inOff.toString();
  const outOffG = outSize === 0n ? "0" : outOff.toString();
  const curMem = String(memory.length);
  const g = op === "call"
    ? callGasCalc(gasAvail.toString(), gasReq.toString(), effValue.toString(), cold, targetEmpty,
        curMem, inOffG, inSize.toString(), outOffG, outSize.toString())
    : otherCallGasCalc(op.toUpperCase(), gasAvail.toString(), gasReq.toString(),
        op === "callcode" ? effValue.toString() : "0", cold,
        curMem, inOffG, inSize.toString(), outOffG, outSize.toString());
  if (g === null) return null;
  const base = BigInt(g.baseGas);
  let childAddress, childSender, childValue;
  if (op === "call") { childAddress = target; childSender = caller; childValue = effValue; }
  else if (op === "callcode") { childAddress = caller; childSender = caller; childValue = effValue; }
  else if (op === "delegatecall") { childAddress = caller; childSender = sender; childValue = callValue; }
  else { childAddress = target; childSender = caller; childValue = 0n; }
  const head = { opcode: op, opcodeByte: CALLOP_BYTES[op], fork: CALLOP_FORKS[op],
    childAddress, childSender, childValue: childValue.toString(),
    childStatic: (inStatic || op === "staticcall") ? "true" : "false" };
  const toHex = arr => "0x" + arr.map(b => b.toString(16).padStart(2, "0")).join("");
  const newMem = Number(BigInt(g.newMemBytes));
  const expanded = memory.slice();
  while (expanded.length < newMem) expanded.push(0);
  const unchanged = { callerAfter: callerBal.toString(), targetAfter: targetBal.toString() };
  const moved = op === "call" && effValue > 0n;
  const movedBals = caller === target ? unchanged
    : { callerAfter: (callerBal - effValue).toString(), targetAfter: (targetBal + effValue).toString() };
  if (g.outOfGas) {
    return { ...head, pushed: "", outcome: "halt", failReason: "",
      baseGas: g.baseGas, forwardedGas: "0", stipend: "0", calleeGas: "0",
      calleeGasUsed: "", gasUsed: "", gasAfter: "", ...unchanged, transferred: "false",
      returndata: "0x", returndataBytes: "0",
      memoryAfter: toHex(memory), memoryAfterBytes: String(memory.length), halted: "true" };
  }
  const forwarded = BigInt(g.forwardedGas);
  let fail = "";
  if (depth >= 1024n) fail = "depth";
  else if (inStatic && effValue > 0n) fail = "static";
  else if ((op === "call" || op === "callcode") && callerBal < effValue) fail = "balance";
  if (fail) {
    return { ...head, pushed: "0", outcome: "failed", failReason: fail,
      baseGas: g.baseGas, forwardedGas: "0", stipend: "0", calleeGas: "0",
      calleeGasUsed: "0", gasUsed: base.toString(), gasAfter: (gasAvail - base).toString(),
      ...unchanged, transferred: "false", returndata: "0x", returndataBytes: "0",
      memoryAfter: toHex(expanded), memoryAfterBytes: String(expanded.length), halted: "false" };
  }
  if (!targetHasCode) {
    return { ...head, pushed: "1", outcome: "empty", failReason: "",
      baseGas: g.baseGas, forwardedGas: g.forwardedGas, stipend: g.stipend, calleeGas: g.calleeGas,
      calleeGasUsed: "0", gasUsed: base.toString(), gasAfter: (gasAvail - base).toString(),
      ...(moved ? movedBals : unchanged), transferred: moved ? "true" : "false",
      returndata: "0x", returndataBytes: "0",
      memoryAfter: toHex(expanded), memoryAfterBytes: String(expanded.length), halted: "false" };
  }
  if (typeof outcomeStr !== "string") return null;
  const outcome = outcomeStr.trim().toLowerCase();
  if (!["success", "revert", "halt"].includes(outcome)) return null;
  if (outcome === "halt") {
    return { ...head, pushed: "0", outcome: "callee-halt", failReason: "",
      baseGas: g.baseGas, forwardedGas: g.forwardedGas, stipend: g.stipend, calleeGas: g.calleeGas,
      calleeGasUsed: g.calleeGas, gasUsed: (base + forwarded).toString(),
      gasAfter: (gasAvail - base - forwarded).toString(),
      ...unchanged, transferred: "false", returndata: "0x", returndataBytes: "0",
      memoryAfter: toHex(expanded), memoryAfterBytes: String(expanded.length), halted: "false" };
  }
  const used = sstoreParseWord(calleeGasUsedStr);
  if (used === null || used > BigInt(g.calleeGas)) return null;
  if (typeof retDataStr !== "string") return null;
  const retdata = parseBytes(retDataStr);
  if (retdata === null) return null;
  const gasAfter = gasAvail - base - forwarded + (BigInt(g.calleeGas) - used);
  const after = expanded.slice();
  const nCopy = Math.min(retdata.length, Number(outSize));
  for (let i = 0; i < nCopy; i++) after[Number(outOff) + i] = retdata[i];
  const done = { baseGas: g.baseGas, forwardedGas: g.forwardedGas, stipend: g.stipend,
    calleeGas: g.calleeGas, calleeGasUsed: used.toString(),
    gasUsed: (gasAvail - gasAfter).toString(), gasAfter: gasAfter.toString(),
    returndata: toHex(retdata), returndataBytes: String(retdata.length),
    memoryAfter: toHex(after), memoryAfterBytes: String(after.length), halted: "false" };
  if (outcome === "success") {
    return { ...head, pushed: "1", outcome: "success", failReason: "", ...done,
      ...(moved ? movedBals : unchanged), transferred: moved ? "true" : "false" };
  }
  return { ...head, pushed: "0", outcome: "revert", failReason: "", ...done,
    ...unchanged, transferred: "false" };
}

/* SHA3 opcode (0x20, Frontier) — pushes Keccak-256 of a region
   of the frame's memory the user supplies. Three traps live
   here. First, the NAME: the opcode's "SHA3" is Ethereum's
   Keccak-256 (original Keccak padding), NOT NIST SHA3-256 —
   the two differ on every input ("abc" hashes to 0x4e0365…
   here, 0x3a985d… under NIST SHA3-256), and libraries that
   return the NIST digest silently disagree with the chain.
   Second, the region is MEMORY, which is zero-initialised: a
   region running past the supplied memory's end reads zeros
   there (and expands memory, zero-filled, to the region end),
   so hashing 32 bytes at offset 64 of empty memory pushes
   keccak256 of 32 zero bytes, 0x290dec…, not a halt — and
   reading is not free, the expansion to the region end is
   charged even though nothing is written. Third, a ZERO-size
   region touches no memory whatever its offset — an offset of
   2^255 with size 0 pushes keccak256("") = 0xc5d246… and costs
   the flat 30 alone — because no allocation depends on the
   offset when nothing is read. Gas is the hub's SHA3 gas
   tool's price, cross-checked against it exactly in tests:
   30 flat + 6 per 32-byte word of the region (the size rounds
   up — 33 bytes pay for 2 words) + the memory-expansion
   increase on the hub's cost curve. Inputs are refused rather
   than wrapped: offset and size are single 256-bit words via
   parseWord256; the memory hex must be even-length; the
   supplied memory, the size and a non-empty region's end are
   each capped at 4,096 bytes as stated display caps — the
   offset itself is NOT capped, since a zero size reads
   nothing and a non-empty region's end cap bounds it. */
const SHA3OP_MAX_BYTES = 4096;
function sha3Calc(offsetStr, sizeStr, memoryStr) {
  if (typeof memoryStr !== "string") return null;
  const offset = parseWord256(offsetStr);
  const size = parseWord256(sizeStr);
  if (offset === null || size === null) return null;
  if (size > BigInt(SHA3OP_MAX_BYTES)) return null;
  let h = memoryStr.trim();
  if (/^0[xX]/.test(h)) h = h.slice(2);
  if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
  if (h.length / 2 > SHA3OP_MAX_BYTES) return null;
  const before = [];
  for (let i = 0; i < h.length; i += 2) before.push(parseInt(h.slice(i, i + 2), 16));
  const regionEnd = size === 0n ? 0n : offset + size;
  if (size > 0n && regionEnd > BigInt(SHA3OP_MAX_BYTES)) return null;
  const off = Number(offset), sz = Number(size);
  const region = [];
  for (let i = 0; i < sz; i++) region.push(off + i < before.length ? before[off + i] : 0);
  const digestHex = keccak256Bytes(region);
  const after = before.slice();
  const endNum = Number(regionEnd);
  while (after.length < endNum) after.push(0);
  const wordsBefore = BigInt(Math.ceil(before.length / 32));
  const wordsAfter = BigInt(Math.ceil(Math.max(before.length, endNum) / 32));
  const expansion = wordsAfter > wordsBefore ? memTotalCost(wordsAfter) - memTotalCost(wordsBefore) : 0n;
  const words = (size + 31n) / 32n;
  const wordGas = 6n * words;
  const toHex = arr => "0x" + arr.map(b => b.toString(16).padStart(2, "0")).join("");
  const resultHex = "0x" + digestHex;
  return {
    opcode: "sha3", opcodeByte: "0x20",
    offset: offset.toString(), size: size.toString(),
    result: BigInt(resultHex).toString(), resultHex,
    hashedData: toHex(region),
    memoryBefore: toHex(before), memoryAfter: toHex(after),
    memoryBeforeBytes: String(before.length), memoryAfterBytes: String(after.length),
    msizeBefore: (wordsBefore * 32n).toString(), msizeAfter: (wordsAfter * 32n).toString(),
    baseGas: "30", wordGas: wordGas.toString(), words: words.toString(),
    expansionGas: expansion.toString(), totalGas: (30n + wordGas + expansion).toString()
  };
}

/* CREATE (0xf0, Frontier) / CREATE2 (0xf5, Constantinople,
   EIP-1014) — applies a contract creation to the state the user
   supplies: the creator and its nonce and balance, the value
   (endowment), the initcode region of the frame's memory, CREATE2's
   salt, the depth and static flag, the derived account's existing
   nonce / balance / code flag, and the initcode outcome the user
   supplies (whether it succeeds, reverts or halts, the gas it uses,
   the code it returns, the data it reverts with). The address is
   derived BEFORE the creator's nonce increments — CREATE from
   keccak256(rlp([creator, nonce])), CREATE2 from
   keccak256(0xff ++ creator ++ salt ++ keccak256(initcode)) — and
   both derivations are the hub's own address tools, cross-checked
   against them exactly in tests. Gas is the hub's CREATE gas tool's
   price, cross-checked against it exactly in tests: an upfront
   32,000 + 2 per initcode word (EIP-3860; CREATE2 pays 8 per word,
   the extra 6 being the Keccak hashing of the initcode) + the
   memory-expansion increase, then all-but-one-64th of the remainder
   (EIP-150) is forwarded to the initcode. Four failures are soft —
   depth at the 1,024 limit, a value-carrying creation inside a
   static frame, a creator balance below the value, and a COLLISION
   (the derived account already has a non-zero nonce or any code) —
   checked in the client's order; each pushes 0, forwards nothing
   and consumes the upfront alone, and the creator's nonce does NOT
   move. Once the initcode runs, the creator's nonce HAS incremented
   by one and stays incremented on revert, halt and deposit failure
   alike. A reverting initcode returns its unused gas and sets the
   returndata buffer; a halting one consumes its whole allowance and
   empties it. On success the returned code is deposited at 200 per
   byte charged against the SAME forwarded allowance: if the
   initcode's use plus the deposit exceeds the allowance the deposit
   runs out of gas and the whole allowance is consumed (the classic
   trap — a creation can fail at the deposit step after flawless
   initcode), and returned code over the EIP-170 cap of 24,576 bytes
   fails the same way. A successful creation leaves the new account
   at nonce 1 with the deployed code and the endowment added to any
   balance it already carried (a funded, nonce-0, code-less account
   is creatable — collision needs a nonce or code, not a balance).
   Inputs are refused rather than wrapped: words are single 256-bit
   words; the supplied memory, the initcode size and a non-empty
   region's end are capped at 4,096 bytes as stated display caps;
   the deployed code is capped at 24,577 bytes so the EIP-170 edge
   stays reachable; CREATE's salt field and the unused outcome
   fields are never read (lazily parsed; garbage-field tests). */
const CREATEOP_MAX_BYTES = 4096;
const CREATEOP_MAX_DEPLOYED = 24577;
function createCalc(opStr, gasAvailStr, valueStr, creatorStr, nonceStr, saltStr,
    creatorBalStr, depthStr, outcomeStr, initGasUsedStr, deployedStr, retDataStr,
    memoryStr, initOffStr, initSizeStr, targetNonceStr, targetBalStr,
    targetHasCode, inStatic) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  if (op !== "create" && op !== "create2") return null;
  if (typeof targetHasCode !== "boolean" || typeof inStatic !== "boolean") return null;
  if (typeof memoryStr !== "string") return null;
  const parseAddr = s => {
    if (typeof s !== "string") return null;
    let h = s.trim();
    if (/^0[xX]/.test(h)) h = h.slice(2);
    if (!/^[0-9a-fA-F]{40}$/.test(h)) return null;
    return "0x" + h.toLowerCase();
  };
  const parseBytes = (s, cap) => {
    if (typeof s !== "string") return null;
    let h = s.trim();
    if (/^0[xX]/.test(h)) h = h.slice(2);
    if (h !== "" && (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0)) return null;
    if (h.length / 2 > cap) return null;
    const arr = [];
    for (let i = 0; i < h.length; i += 2) arr.push(parseInt(h.slice(i, i + 2), 16));
    return arr;
  };
  const gasAvail = sstoreParseWord(gasAvailStr);
  const value = sstoreParseWord(valueStr);
  const creator = parseAddr(creatorStr);
  const nonce = sstoreParseWord(nonceStr);
  const creatorBal = sstoreParseWord(creatorBalStr);
  const depth = sstoreParseWord(depthStr);
  const targetNonce = sstoreParseWord(targetNonceStr);
  const targetBal = sstoreParseWord(targetBalStr);
  const memory = parseBytes(memoryStr, CREATEOP_MAX_BYTES);
  const initOff = sstoreParseWord(initOffStr), initSize = sstoreParseWord(initSizeStr);
  if (gasAvail === null || value === null || creator === null || nonce === null ||
      creatorBal === null || depth === null || targetNonce === null || targetBal === null ||
      memory === null || initOff === null || initSize === null) return null;
  if (nonce >= (1n << 256n) - 1n) return null;
  if (initSize > BigInt(CREATEOP_MAX_BYTES)) return null;
  const regionEnd = initSize === 0n ? 0n : initOff + initSize;
  if (initSize > 0n && regionEnd > BigInt(CREATEOP_MAX_BYTES)) return null;
  const sz = Number(initSize), off = Number(initOff);
  const initcode = [];
  for (let i = 0; i < sz; i++) initcode.push(off + i < memory.length ? memory[off + i] : 0);
  const toHex = arr => "0x" + arr.map(b => b.toString(16).padStart(2, "0")).join("");
  const initcodeHex = toHex(initcode);
  let targetAddress;
  if (op === "create2") {
    const salt = parseBytes(saltStr, 32);
    if (salt === null || salt.length !== 32) return null;
    targetAddress = create2Address(creator, toHex(salt), initcodeHex);
  } else {
    targetAddress = createAddress(creator, nonce.toString());
  }
  if (targetAddress === null) return null;
  const g = createGasCalc(gasAvail.toString(), op, initSize.toString(),
    initSize === 0n ? "0" : initOff.toString(), String(memory.length), "0");
  if (g === null) return null;
  const upfront = BigInt(g.upfrontGas);
  const expanded = memory.slice();
  while (expanded.length < Number(regionEnd)) expanded.push(0);
  const head = { opcode: op, opcodeByte: op === "create" ? "0xf0" : "0xf5",
    fork: op === "create" ? "Frontier" : "Constantinople",
    targetAddress, initcode: initcodeHex, initcodeBytes: initSize.toString(),
    upfrontGas: g.upfrontGas, wordGas: g.wordGas, initcodeWords: g.initcodeWords,
    memoryGas: g.memoryGas };
  const unchanged = { creatorAfter: creatorBal.toString(), targetAfter: targetBal.toString() };
  if (g.outOfGas) {
    return { ...head, pushed: "", outcome: "halt", failReason: "",
      forwardedGas: "0", creatorRetained: "0", initGasUsed: "", depositGas: "0",
      gasUsed: "", gasAfter: "", ...unchanged, transferred: "false",
      creatorNonceAfter: nonce.toString(), targetNonceAfter: targetNonce.toString(),
      deployedCode: "0x", deployedCodeBytes: "0", returndata: "0x", returndataBytes: "0",
      memoryAfter: toHex(memory), memoryAfterBytes: String(memory.length), halted: "true" };
  }
  const forwarded = BigInt(g.forwardedGas);
  let fail = "";
  if (depth >= 1024n) fail = "depth";
  else if (inStatic && value > 0n) fail = "static";
  else if (creatorBal < value) fail = "balance";
  else if (targetNonce !== 0n || targetHasCode) fail = "collision";
  if (fail) {
    return { ...head, pushed: "0", outcome: "failed", failReason: fail,
      forwardedGas: "0", creatorRetained: g.creatorRetained, initGasUsed: "0",
      depositGas: "0", gasUsed: upfront.toString(), gasAfter: (gasAvail - upfront).toString(),
      ...unchanged, transferred: "false",
      creatorNonceAfter: nonce.toString(), targetNonceAfter: targetNonce.toString(),
      deployedCode: "0x", deployedCodeBytes: "0", returndata: "0x", returndataBytes: "0",
      memoryAfter: toHex(expanded), memoryAfterBytes: String(expanded.length), halted: "false" };
  }
  if (typeof outcomeStr !== "string") return null;
  const outcome = outcomeStr.trim().toLowerCase();
  if (!["success", "revert", "halt"].includes(outcome)) return null;
  const base = { ...head, forwardedGas: g.forwardedGas, creatorRetained: g.creatorRetained,
    creatorNonceAfter: (nonce + 1n).toString(),
    memoryAfter: toHex(expanded), memoryAfterBytes: String(expanded.length), halted: "false" };
  if (outcome === "halt") {
    return { ...base, pushed: "0", outcome: "callee-halt", failReason: "",
      initGasUsed: forwarded.toString(), depositGas: "0",
      gasUsed: (upfront + forwarded).toString(), gasAfter: (gasAvail - upfront - forwarded).toString(),
      ...unchanged, transferred: "false", targetNonceAfter: targetNonce.toString(),
      deployedCode: "0x", deployedCodeBytes: "0", returndata: "0x", returndataBytes: "0" };
  }
  if (outcome === "revert") {
    const used = sstoreParseWord(initGasUsedStr);
    const retdata = parseBytes(retDataStr, CREATEOP_MAX_BYTES);
    if (used === null || retdata === null || used > forwarded) return null;
    return { ...base, pushed: "0", outcome: "revert", failReason: "",
      initGasUsed: used.toString(), depositGas: "0",
      gasUsed: (upfront + used).toString(), gasAfter: (gasAvail - upfront - used).toString(),
      ...unchanged, transferred: "false", targetNonceAfter: targetNonce.toString(),
      deployedCode: "0x", deployedCodeBytes: "0",
      returndata: toHex(retdata), returndataBytes: String(retdata.length) };
  }
  const used = sstoreParseWord(initGasUsedStr);
  const deployed = parseBytes(deployedStr, CREATEOP_MAX_DEPLOYED);
  if (used === null || deployed === null || used > forwarded) return null;
  if (deployed.length > 24576) {
    return { ...base, pushed: "0", outcome: "code-too-large", failReason: "",
      initGasUsed: forwarded.toString(), depositGas: "0",
      gasUsed: (upfront + forwarded).toString(), gasAfter: (gasAvail - upfront - forwarded).toString(),
      ...unchanged, transferred: "false", targetNonceAfter: targetNonce.toString(),
      deployedCode: "0x", deployedCodeBytes: "0", returndata: "0x", returndataBytes: "0" };
  }
  const deposit = 200n * BigInt(deployed.length);
  if (used + deposit > forwarded) {
    return { ...base, pushed: "0", outcome: "deposit-oog", failReason: "",
      initGasUsed: used.toString(), depositGas: deposit.toString(),
      gasUsed: (upfront + forwarded).toString(), gasAfter: (gasAvail - upfront - forwarded).toString(),
      ...unchanged, transferred: "false", targetNonceAfter: targetNonce.toString(),
      deployedCode: "0x", deployedCodeBytes: "0", returndata: "0x", returndataBytes: "0" };
  }
  return { ...base, pushed: targetAddress, outcome: "success", failReason: "",
    initGasUsed: used.toString(), depositGas: deposit.toString(),
    gasUsed: (upfront + used + deposit).toString(),
    gasAfter: (gasAvail - upfront - used - deposit).toString(),
    creatorAfter: (creatorBal - value).toString(), targetAfter: (targetBal + value).toString(),
    transferred: value > 0n ? "true" : "false", targetNonceAfter: "1",
    deployedCode: toHex(deployed), deployedCodeBytes: String(deployed.length),
    returndata: "0x", returndataBytes: "0" };
}

/* SELFDESTRUCT opcode calculator -- SELFDESTRUCT (0xff,
   Frontier), the semantics sibling of the hub's SELFDESTRUCT
   GAS tool above and the last opcode family that had a gas
   tool but no execution application. The opcode pops a
   beneficiary address and TERMINATES the executing frame
   successfully (nothing is pushed; execution does not continue
   past it in this frame), moving the executing account's WHOLE
   balance to the beneficiary. Gas is the gas tool's price,
   cross-checked against selfdestructGasCalc exactly in tests:
   5,000 base + 2,600 if the beneficiary is cold (EIP-2929) +
   25,000 only when the beneficiary is EMPTY -- balance 0,
   nonce 0 and no code, derived here from the beneficiary state
   you supply rather than taken as a flag -- AND the balance
   moved is positive; the refund is 0 since EIP-3529 removed
   the old 24,000. Two failures are EXCEPTIONAL halts, not soft
   failures: the frame cannot pay the gas cost (reason oog,
   checked first -- the charge precedes execution), and the
   frame is static (reason static -- the opcode moves value,
   so a static frame may not run it at all, where a value CALL
   in a static frame merely fails softly). Each consumes the
   frame's whole remaining gas and changes nothing. The
   family's trap is EIP-6780 (Cancun): what the opcode DOES
   split on whether the executing account was created in the
   SAME transaction. Created in this transaction, the account
   is deleted at the transaction's END -- code, storage and
   nonce cleared then, not at the opcode, so the code stays
   callable for the rest of the transaction. NOT created in
   this transaction, nothing is deleted at all: only the
   balance moves and the account survives intact. A beneficiary
   that is the account ITSELF splits the same way: with
   deletion the balance is BURNED (sent to an account that is
   then removed, leaving circulation); without deletion the
   transfer is a NO-OP and the balance stays exactly where it
   was. A self-beneficiary is by construction warm (the frame's
   own account is accessed), existing (it is executing code,
   so it has code) and carrying the account's own balance --
   an input claiming otherwise is inconsistent and refused.
   For a distinct beneficiary, receiving the balance changes
   neither its nonce nor its code; for a deleted
   self-beneficiary both are reported cleared with the account.
   Honest scope: the state is supplied, not read -- this page
   executes nothing and queries no chain; whether the account
   was created in this transaction is a fact of the transaction
   you supply as a flag, and a later call to a not-deleted
   account within the same transaction is a new application of
   this same tool, not state this one tracks. All words are
   single 256-bit values via the SSTORE gas tool's parser,
   refused rather than wrapped when wider. */
function selfdestructCalc(gasAvailStr, selfAddrStr, selfBalStr, beneficiaryStr,
    beneficiaryBalStr, beneficiaryNonceStr, beneficiaryHasCode,
    beneficiaryCold, createdInSameTx, inStatic) {
  if (typeof beneficiaryHasCode !== "boolean" || typeof beneficiaryCold !== "boolean" ||
      typeof createdInSameTx !== "boolean" || typeof inStatic !== "boolean") return null;
  const parseAddr = s => {
    if (typeof s !== "string") return null;
    let h = s.trim();
    if (/^0[xX]/.test(h)) h = h.slice(2);
    if (!/^[0-9a-fA-F]{40}$/.test(h)) return null;
    return "0x" + h.toLowerCase();
  };
  const gasAvail = sstoreParseWord(gasAvailStr);
  const selfAddr = parseAddr(selfAddrStr);
  const selfBal = sstoreParseWord(selfBalStr);
  const beneficiary = parseAddr(beneficiaryStr);
  const beneficiaryBal = sstoreParseWord(beneficiaryBalStr);
  const beneficiaryNonce = sstoreParseWord(beneficiaryNonceStr);
  if (gasAvail === null || selfAddr === null || selfBal === null ||
      beneficiary === null || beneficiaryBal === null || beneficiaryNonce === null) return null;
  const isSelf = selfAddr === beneficiary;
  if (isSelf && (beneficiaryBal !== selfBal || !beneficiaryHasCode || beneficiaryCold)) return null;
  const beneficiaryEmpty = beneficiaryBal === 0n && beneficiaryNonce === 0n && !beneficiaryHasCode;
  const g = selfdestructGasCalc(beneficiaryCold, beneficiaryEmpty, selfBal.toString());
  if (g === null) return null;
  const total = BigInt(g.totalGas);
  const head = { opcode: "selfdestruct", opcodeByte: "0xff", fork: "Frontier",
    selfAddress: toChecksumAddress(selfAddr), beneficiary: toChecksumAddress(beneficiary),
    isSelfBeneficiary: isSelf ? "true" : "false",
    beneficiaryEmpty: beneficiaryEmpty ? "true" : "false",
    baseGas: g.baseGas, accessGas: g.accessGas, newAccountGas: g.newAccountGas,
    refund: g.refund, totalGas: g.totalGas };
  const unchanged = { selfAfter: selfBal.toString(), beneficiaryAfter: beneficiaryBal.toString(),
    transferred: "false", burned: "0", deleted: "false",
    beneficiaryNonceAfter: beneficiaryNonce.toString(),
    beneficiaryHasCodeAfter: beneficiaryHasCode ? "true" : "false" };
  if (gasAvail < total) {
    return { ...head, outcome: "halt", haltReason: "oog",
      gasUsed: gasAvail.toString(), gasAfter: "0", ...unchanged, halted: "true" };
  }
  if (inStatic) {
    return { ...head, outcome: "halt", haltReason: "static",
      gasUsed: gasAvail.toString(), gasAfter: "0", ...unchanged, halted: "true" };
  }
  const deleted = createdInSameTx;
  let selfAfter, beneficiaryAfter, burned, transferred;
  if (isSelf) {
    if (deleted) { selfAfter = 0n; beneficiaryAfter = 0n; burned = selfBal; }
    else { selfAfter = selfBal; beneficiaryAfter = selfBal; burned = 0n; }
    transferred = false;
  } else {
    selfAfter = 0n; beneficiaryAfter = beneficiaryBal + selfBal; burned = 0n;
    transferred = selfBal > 0n;
  }
  const beneNonceAfter = isSelf && deleted ? 0n : beneficiaryNonce;
  const beneCodeAfter = isSelf && deleted ? false : beneficiaryHasCode;
  return { ...head, outcome: "terminated", haltReason: "",
    gasUsed: total.toString(), gasAfter: (gasAvail - total).toString(),
    selfAfter: selfAfter.toString(), beneficiaryAfter: beneficiaryAfter.toString(),
    transferred: transferred ? "true" : "false", burned: burned.toString(),
    deleted: deleted ? "true" : "false",
    beneficiaryNonceAfter: beneNonceAfter.toString(),
    beneficiaryHasCodeAfter: beneCodeAfter ? "true" : "false", halted: "false" };
}

/* LOG opcode calculator -- LOG0 (0xa0) through LOG4 (0xa4),
   all Frontier, the semantics sibling of the hub's LOG gas
   tool above and the last opcode family that had a gas tool
   but no execution application. The opcode pops an offset, a
   size and n topics (n is the opcode's digit) and appends ONE
   log record to the transaction's receipt: the EXECUTING
   account's address (the contract whose code is running --
   for an ERC-20 Transfer that is the token contract, not the
   sender), the n topics in the order they were popped, and
   the data read from the frame's memory region
   [offset, offset+size). Nothing is pushed. Memory is
   zero-initialised: a region running past the supplied
   memory's end reads zeros there and expands memory
   (zero-filled) to the region end, while a zero-size region
   touches no memory whatever its offset -- an offset of
   2^255 with size 0 logs empty data at the flat base. Gas is
   the hub's LOG gas tool's price, cross-checked against
   logGasCalc exactly in tests: 375 base + 375 per topic +
   8 per data BYTE + the memory-expansion increase. The
   per-byte data term is the family's quiet trap: unlike
   SHA3's 6 per WORD (which rounds 33 bytes up to 2 words),
   log data is metered by the byte, so 33 bytes pay 264 of
   data gas, never a rounded word price. Two failures are
   EXCEPTIONAL halts, not soft failures: the frame cannot
   pay the gas cost (reason oog, checked first -- the charge
   precedes execution), and the frame is static (reason
   static -- a log record is a state write, so write
   protection forbids the opcode outright, where a
   zero-value CALL in a static frame merely fails softly).
   Each consumes the frame's whole remaining gas, appends
   no record and leaves memory unchanged. Topic fields
   beyond the opcode's own count are never read (lazily
   parsed; garbage-field tests). One honest divergence from
   the gas tool: that tool's byte-count parser refuses an
   offset it cannot hold as a byte count, while this tool
   accepts any 256-bit offset when the size is 0, because no
   memory is touched and the price is the flat base either
   way. Honest scope: the state is supplied, not read --
   this page executes nothing and queries no chain; the
   record built here is the record the opcode would append,
   and whether the surrounding transaction later reverts
   (discarding the record) is a transaction-level fact this
   single application does not track. All words are single
   256-bit values, refused rather than wrapped; the supplied
   memory, the size and a non-empty region's end are capped
   at 4,096 bytes as stated display caps. */
const LOGOP_MAX_BYTES = 4096;
function logCalc(opStr, gasAvailStr, selfAddrStr, offsetStr, sizeStr,
    topic0Str, topic1Str, topic2Str, topic3Str, memoryStr, inStatic) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  const OPS = { log0: 0, log1: 1, log2: 2, log3: 3, log4: 4 };
  if (!(op in OPS)) return null;
  if (typeof inStatic !== "boolean") return null;
  if (typeof memoryStr !== "string") return null;
  const n = OPS[op];
  const parseAddr = s => {
    if (typeof s !== "string") return null;
    let h = s.trim();
    if (/^0[xX]/.test(h)) h = h.slice(2);
    if (!/^[0-9a-fA-F]{40}$/.test(h)) return null;
    return "0x" + h.toLowerCase();
  };
  const gasAvail = sstoreParseWord(gasAvailStr);
  const selfAddr = parseAddr(selfAddrStr);
  const offset = sstoreParseWord(offsetStr);
  const size = sstoreParseWord(sizeStr);
  if (gasAvail === null || selfAddr === null || offset === null || size === null) return null;
  if (size > BigInt(LOGOP_MAX_BYTES)) return null;
  let mh = memoryStr.trim();
  if (/^0[xX]/.test(mh)) mh = mh.slice(2);
  if (mh !== "" && (!/^[0-9a-fA-F]+$/.test(mh) || mh.length % 2 !== 0)) return null;
  if (mh.length / 2 > LOGOP_MAX_BYTES) return null;
  const before = [];
  for (let i = 0; i < mh.length; i += 2) before.push(parseInt(mh.slice(i, i + 2), 16));
  const regionEnd = size === 0n ? 0n : offset + size;
  if (size > 0n && regionEnd > BigInt(LOGOP_MAX_BYTES)) return null;
  const topicStrs = [topic0Str, topic1Str, topic2Str, topic3Str];
  const topics = [];
  for (let i = 0; i < n; i++) {
    const v = parseWord256(topicStrs[i]);
    if (v === null) return null;
    topics.push("0x" + v.toString(16).padStart(64, "0"));
  }
  const wordsBefore = BigInt(Math.ceil(before.length / 32));
  const endNum = Number(regionEnd);
  const wordsAfter = BigInt(Math.ceil(Math.max(before.length, endNum) / 32));
  const expansion = wordsAfter > wordsBefore ? memTotalCost(wordsAfter) - memTotalCost(wordsBefore) : 0n;
  const baseGas = 375n, topicGas = 375n * BigInt(n), dataGas = 8n * size;
  const total = baseGas + topicGas + dataGas + expansion;
  const toHex = arr => "0x" + arr.map(b => b.toString(16).padStart(2, "0")).join("");
  const head = { opcode: op, opcodeByte: "0x" + (0xa0 + n).toString(16),
    address: toChecksumAddress(selfAddr), topicCount: String(n),
    baseGas: baseGas.toString(), topicGas: topicGas.toString(),
    dataGas: dataGas.toString(), memoryGas: expansion.toString(), totalGas: total.toString() };
  const unchanged = { topics: "", data: "0x", dataBytes: "0",
    memoryBefore: toHex(before), memoryAfter: toHex(before),
    memoryBeforeBytes: String(before.length), memoryAfterBytes: String(before.length),
    msizeBefore: (wordsBefore * 32n).toString(), msizeAfter: (wordsBefore * 32n).toString(),
    logged: "false", halted: "true" };
  if (gasAvail < total) {
    return { ...head, outcome: "halt", haltReason: "oog",
      gasUsed: gasAvail.toString(), gasAfter: "0", ...unchanged };
  }
  if (inStatic) {
    return { ...head, outcome: "halt", haltReason: "static",
      gasUsed: gasAvail.toString(), gasAfter: "0", ...unchanged };
  }
  const off = Number(offset), sz = Number(size);
  const region = [];
  for (let i = 0; i < sz; i++) region.push(off + i < before.length ? before[off + i] : 0);
  const after = before.slice();
  while (after.length < endNum) after.push(0);
  return { ...head, topics: topics.join(","), outcome: "logged", haltReason: "",
    gasUsed: total.toString(), gasAfter: (gasAvail - total).toString(),
    data: toHex(region), dataBytes: size.toString(),
    memoryBefore: toHex(before), memoryAfter: toHex(after),
    memoryBeforeBytes: String(before.length), memoryAfterBytes: String(after.length),
    msizeBefore: (wordsBefore * 32n).toString(), msizeAfter: (wordsAfter * 32n).toString(),
    logged: "true", halted: "false" };
}

/* Halting opcode calculator -- STOP (0x00) / RETURN (0xf3),
   Frontier; REVERT (0xfd), Byzantium (EIP-140); INVALID (0xfe),
   Frontier -- the four ways a frame ends by opcode, and the
   only opcode family that had NO hub tool at all (every other
   family has a gas tool, an execution application, or both).
   The four split on three axes, and the splits are the lesson.
   STATE: STOP and RETURN end the frame successfully, so the
   frame's changes are KEPT; REVERT rolls them back; an
   exceptional halt (INVALID, or RETURN/REVERT out of gas) rolls
   them back too. DATA: RETURN and REVERT both hand the caller
   the memory region [offset, offset+size) -- for REVERT that is
   the revert data the caller reads from its returndata buffer --
   while STOP and INVALID return nothing. GAS: STOP has no cost
   at all, and RETURN/REVERT have NO flat cost either -- their
   only charge is the memory-expansion increase for the region,
   on the hub's cost curve, cross-checked against the hub's
   memoryGas tool exactly in tests -- so RETURN of a region
   memory already covers costs 0. A successful REVERT returns
   its unused gas to the caller; an exceptional halt never does:
   INVALID consumes the frame's WHOLE remaining gas by design,
   and a RETURN/REVERT whose expansion exceeds the remaining
   gas halts exceptionally (reason oog) consuming all of it,
   returning no data and leaving memory unchanged. STOP and
   INVALID pop nothing and read nothing -- their offset, size
   and memory fields are never read (lazily parsed; garbage-
   field tests) -- while RETURN/REVERT read theirs like the
   other memory families: memory is zero-initialised, a region
   past the supplied end reads zeros and expands memory to the
   region end, and a zero-size region touches no memory
   whatever its offset (offset 2^255 with size 0 returns empty
   at 0 gas). None of the four writes state, so none is barred
   from a static frame -- REVERT is precisely how a static frame
   reports an error. Honest scope: the gas and memory are values
   you supply -- this page executes nothing and reads no chain;
   what an enclosing call does with the outcome (a caller's
   CALL copies RETURN/REVERT data into its own returndata
   buffer; a top-level frame's RETURN data is the transaction's
   output) is a caller-level fact this single application does
   not track. All words are single 256-bit values, refused
   rather than wrapped; the supplied memory, the size and a
   non-empty region's end are capped at 4,096 bytes as stated
   display caps. */
const HALTOP_MAX_BYTES = 4096;
function haltCalc(opStr, gasAvailStr, offsetStr, sizeStr, memoryStr) {
  if (typeof opStr !== "string") return null;
  const op = opStr.trim().toLowerCase();
  const META = { stop: ["0x00", "Frontier"], return: ["0xf3", "Frontier"],
    revert: ["0xfd", "Byzantium"], invalid: ["0xfe", "Frontier"] };
  if (!(op in META)) return null;
  const gasAvail = sstoreParseWord(gasAvailStr);
  if (gasAvail === null) return null;
  const opcodeByte = META[op][0], fork = META[op][1];
  if (op === "stop") {
    return { opcode: op, opcodeByte, fork, offset: "", size: "",
      expansionGas: "0", totalGas: "0", outcome: "stopped", haltReason: "",
      gasUsed: "0", gasAfter: gasAvail.toString(),
      returnedData: "0x", returnedBytes: "0", stateKept: "true",
      memoryBefore: "", memoryAfter: "",
      memoryBeforeBytes: "", memoryAfterBytes: "",
      msizeBefore: "", msizeAfter: "", halted: "false" };
  }
  if (op === "invalid") {
    return { opcode: op, opcodeByte, fork, offset: "", size: "",
      expansionGas: "", totalGas: gasAvail.toString(),
      outcome: "halt", haltReason: "invalid",
      gasUsed: gasAvail.toString(), gasAfter: "0",
      returnedData: "0x", returnedBytes: "0", stateKept: "false",
      memoryBefore: "", memoryAfter: "",
      memoryBeforeBytes: "", memoryAfterBytes: "",
      msizeBefore: "", msizeAfter: "", halted: "true" };
  }
  if (typeof memoryStr !== "string") return null;
  const offset = sstoreParseWord(offsetStr);
  const size = sstoreParseWord(sizeStr);
  if (offset === null || size === null) return null;
  if (size > BigInt(HALTOP_MAX_BYTES)) return null;
  let mh = memoryStr.trim();
  if (/^0[xX]/.test(mh)) mh = mh.slice(2);
  if (mh !== "" && (!/^[0-9a-fA-F]+$/.test(mh) || mh.length % 2 !== 0)) return null;
  if (mh.length / 2 > HALTOP_MAX_BYTES) return null;
  const before = [];
  for (let i = 0; i < mh.length; i += 2) before.push(parseInt(mh.slice(i, i + 2), 16));
  const regionEnd = size === 0n ? 0n : offset + size;
  if (size > 0n && regionEnd > BigInt(HALTOP_MAX_BYTES)) return null;
  const wordsBefore = BigInt(Math.ceil(before.length / 32));
  const endNum = Number(regionEnd);
  const wordsAfter = BigInt(Math.ceil(Math.max(before.length, endNum) / 32));
  const expansion = wordsAfter > wordsBefore ? memTotalCost(wordsAfter) - memTotalCost(wordsBefore) : 0n;
  const toHex = arr => "0x" + arr.map(b => b.toString(16).padStart(2, "0")).join("");
  const head = { opcode: op, opcodeByte, fork,
    offset: offset.toString(), size: size.toString(),
    expansionGas: expansion.toString(), totalGas: expansion.toString(),
    memoryBefore: toHex(before), memoryBeforeBytes: String(before.length),
    msizeBefore: (wordsBefore * 32n).toString() };
  if (gasAvail < expansion) {
    return { ...head, outcome: "halt", haltReason: "oog",
      gasUsed: gasAvail.toString(), gasAfter: "0",
      returnedData: "0x", returnedBytes: "0", stateKept: "false",
      memoryAfter: toHex(before), memoryAfterBytes: String(before.length),
      msizeAfter: (wordsBefore * 32n).toString(), halted: "true" };
  }
  const off = Number(offset), sz = Number(size);
  const region = [];
  for (let i = 0; i < sz; i++) region.push(off + i < before.length ? before[off + i] : 0);
  const after = before.slice();
  while (after.length < endNum) after.push(0);
  return { ...head, outcome: op === "return" ? "returned" : "reverted", haltReason: "",
    gasUsed: expansion.toString(), gasAfter: (gasAvail - expansion).toString(),
    returnedData: toHex(region), returnedBytes: size.toString(),
    stateKept: op === "return" ? "true" : "false",
    memoryAfter: toHex(after), memoryAfterBytes: String(after.length),
    msizeAfter: (wordsAfter * 32n).toString(), halted: "false" };
}

/* MCOPY opcode (EIP-5656, Cancun, 0x5e) -- the copy itself
   applied. The hub already prices MCOPY in its MCOPY gas tool;
   this applies it: the bytes at [src, src+size) of the frame's
   memory are copied to [dst, dst+size) of the SAME memory, as
   if through an intermediate buffer (the EIP's memmove
   semantics), so overlapping regions copy the ORIGINAL bytes --
   a forward overlap (dst inside the source region) does not
   smear the first byte across the destination the way a naive
   byte-at-a-time forward copy would; paired tests pin both
   overlap directions against exactly that smear. Gas is the
   hub MCOPY gas tool's price -- 3 base + 3 per 32-byte word
   copied (size rounds up) + the memory-expansion increase --
   cross-checked against mcopyGasCalc exactly in tests on every
   row that tool's byte-count parser can price. Expansion is
   priced on the LARGER of the two region ends, max(dst, src)
   + size, because both regions are memory (the one pricing
   difference from CALLDATACOPY/CODECOPY/RETURNDATACOPY, whose
   sources are not memory). Memory is zero-initialised: either
   region past the supplied end reads zeros, and memory expands
   to the larger end even when only the SOURCE reaches it. A
   zero-size copy touches no memory whatever its offsets --
   offsets of 2^255 with size 0 copy nothing at the flat 3 --
   and the one divergence from the gas tool is pinned too: its
   parser refuses a 2^255 offset while this tool prices the
   zero-size copy at 3. If the frame cannot pay the total it
   halts exceptionally (reason oog), consuming the whole
   remaining gas and leaving memory unchanged -- MCOPY writes
   memory, not state, so it is not barred from a static frame
   (unlike SSTORE or a log); it pops three words and pushes
   nothing. Honest scope: the gas and memory are values you
   supply -- this page executes nothing and reads no chain.
   All words are single 256-bit values, refused rather than
   wrapped; the supplied memory, the size and a non-empty
   copy's larger region end are capped at 4,096 bytes as
   stated display caps. */
const MCOPYOP_MAX_BYTES = 4096;
function mcopyCalc(gasAvailStr, dstStr, srcStr, sizeStr, memoryStr) {
  if (typeof memoryStr !== "string") return null;
  const gasAvail = sstoreParseWord(gasAvailStr);
  const dst = sstoreParseWord(dstStr);
  const src = sstoreParseWord(srcStr);
  const size = sstoreParseWord(sizeStr);
  if (gasAvail === null || dst === null || src === null || size === null) return null;
  if (size > BigInt(MCOPYOP_MAX_BYTES)) return null;
  let mh = memoryStr.trim();
  if (/^0[xX]/.test(mh)) mh = mh.slice(2);
  if (mh !== "" && (!/^[0-9a-fA-F]+$/.test(mh) || mh.length % 2 !== 0)) return null;
  if (mh.length / 2 > MCOPYOP_MAX_BYTES) return null;
  const before = [];
  for (let i = 0; i < mh.length; i += 2) before.push(parseInt(mh.slice(i, i + 2), 16));
  const maxEnd = size === 0n ? 0n : (dst > src ? dst : src) + size;
  if (size > 0n && maxEnd > BigInt(MCOPYOP_MAX_BYTES)) return null;
  const wordsBefore = BigInt(Math.ceil(before.length / 32));
  const endNum = Number(maxEnd);
  const wordsAfter = BigInt(Math.ceil(Math.max(before.length, endNum) / 32));
  const expansion = wordsAfter > wordsBefore ? memTotalCost(wordsAfter) - memTotalCost(wordsBefore) : 0n;
  const baseGas = 3n;
  const wordGas = 3n * ((size + 31n) / 32n);
  const total = baseGas + wordGas + expansion;
  const toHex = arr => "0x" + arr.map(b => b.toString(16).padStart(2, "0")).join("");
  const head = { dst: dst.toString(), src: src.toString(), size: size.toString(),
    baseGas: baseGas.toString(), wordGas: wordGas.toString(),
    expansionGas: expansion.toString(), totalGas: total.toString(),
    memoryBefore: toHex(before), memoryBeforeBytes: String(before.length),
    msizeBefore: (wordsBefore * 32n).toString() };
  if (gasAvail < total) {
    return { ...head, outcome: "halt", haltReason: "oog",
      gasUsed: gasAvail.toString(), gasAfter: "0",
      copiedData: "0x", copiedBytes: "0",
      memoryAfter: toHex(before), memoryAfterBytes: String(before.length),
      msizeAfter: (wordsBefore * 32n).toString(), halted: "true" };
  }
  const ext = before.slice();
  while (ext.length < endNum) ext.push(0);
  const d = Number(dst), s = Number(src), sz = Number(size);
  const copied = ext.slice(s, s + sz);
  const after = ext.slice();
  for (let i = 0; i < sz; i++) after[d + i] = copied[i];
  return { ...head, outcome: "copied", haltReason: "",
    gasUsed: total.toString(), gasAfter: (gasAvail - total).toString(),
    copiedData: toHex(copied), copiedBytes: size.toString(),
    memoryAfter: toHex(after), memoryAfterBytes: String(after.length),
    msizeAfter: (wordsAfter * 32n).toString(), halted: "false" };
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

    /* Uniswap V2 pair / V3 pool address calculator */
    const poolProto = document.getElementById("pool-protocol");
    if (poolProto) poolProto.addEventListener("change", () => {
      /* Keep the canonical factory/init-hash defaults paired with the
         protocol: swap a field only while it still holds one of the
         two canonical mainnet values, never over a user's own entry. */
      const factoryEl = document.getElementById("pool-factory");
      const initEl = document.getElementById("pool-init");
      const isV3 = poolProto.value === "v3";
      if ([UNISWAP_V2_FACTORY.toLowerCase(), UNISWAP_V3_FACTORY.toLowerCase()].includes(factoryEl.value.trim().toLowerCase()))
        factoryEl.value = isV3 ? UNISWAP_V3_FACTORY : UNISWAP_V2_FACTORY;
      if ([UNISWAP_V2_INIT_CODE_HASH, UNISWAP_V3_INIT_CODE_HASH].includes(initEl.value.trim().toLowerCase()))
        initEl.value = isV3 ? UNISWAP_V3_INIT_CODE_HASH : UNISWAP_V2_INIT_CODE_HASH;
    });
    const poolBtn = document.getElementById("pool-btn");
    if (poolBtn) poolBtn.addEventListener("click", () => {
      const protocol = document.getElementById("pool-protocol").value;
      const r = uniswapPoolAddress(
        protocol,
        document.getElementById("pool-factory").value,
        document.getElementById("pool-token-a").value,
        document.getElementById("pool-token-b").value,
        document.getElementById("pool-fee").value,
        document.getElementById("pool-init").value
      );
      const el = document.getElementById("pool-out");
      if (r === null) {
        el.textContent = "Check the inputs: factory and both tokens must be 20-byte addresses (0x + 40 hex), the two tokens must differ and neither may be the zero address, the init code hash must be 32 bytes (0x + 64 hex), and a V3 fee must be a whole number from 1 to 16777215 — the tier must also be enabled on that factory.";
        return;
      }
      el.textContent = `Uniswap ${protocol === "v3" ? "V3 pool" : "V2 pair"} address: ${r.address} · token0 ${r.token0} · token1 ${r.token1} · salt ${r.salt}. Derived locally with CREATE2 from the factory, the sorted tokens and the init code hash you gave. Whether a ${protocol === "v3" ? "pool" : "pair"} actually exists at this address is a chain query (the factory's ${protocol === "v3" ? "getPool" : "getPair"}) that this page does not make — nothing deployed, no chain queried.`;
    });

    /* Uniswap V2 swap quote calculator */
    const v2qBtn = document.getElementById("v2q-btn");
    if (v2qBtn) v2qBtn.addEventListener("click", () => {
      const r = uniswapV2Quote(
        document.getElementById("v2q-mode").value,
        document.getElementById("v2q-reserve-in").value,
        document.getElementById("v2q-reserve-out").value,
        document.getElementById("v2q-amount").value
      );
      const el = document.getElementById("v2q-out");
      if (r === null) {
        el.textContent = "Check the inputs: both reserves and the amount must be whole numbers of 1 or more in the tokens' base units, each reserve below 2^112 (the pair stores reserves as uint112), an exact-output amount must be less than the output reserve, and an exact-input amount must be large enough to buy at least 1 base unit of the output token.";
        return;
      }
      if (r.mode === "quote") {
        el.textContent = `Spot quote: ${r.amountIn} base units of the input token ≡ ${r.amountOut} base units of the output token at the reserve ratio ${document.getElementById("v2q-reserve-in").value.trim()} : ${document.getElementById("v2q-reserve-out").value.trim()} — no fee taken and no price moved, so this is the ratio a trade is priced against, not what a trade of that size returns. Computed locally from the reserves you gave — not live pool data.`;
        return;
      }
      el.textContent = r.mode === "out"
        ? `Swap quote: ${r.amountIn} base units in → ${r.amountOut} base units out · Price impact vs the pre-trade reserve ratio (includes the 0.3% fee): ${r.impactPercent}% · Reserves after this swap: ${r.newReserveIn} in / ${r.newReserveOut} out (the product grows by the fee kept in the pair). Computed locally with UniswapV2Library's formula from the reserves you gave — a formula applied to supplied values, not live pool data: read a real pair's reserves from its getReserves before quoting a real trade.`
        : `Swap quote: to receive exactly ${r.amountOut} base units out you must send ${r.amountIn} base units in (rounded up by 1, as the library rounds, so the pair's invariant check passes) · Price impact vs the pre-trade reserve ratio (includes the 0.3% fee): ${r.impactPercent}% · Reserves after this swap: ${r.newReserveIn} in / ${r.newReserveOut} out. Computed locally with UniswapV2Library's formula from the reserves you gave — not live pool data.`;
    });

    /* Uniswap V2 liquidity mint & burn calculator */
    const v2lMintBtn = document.getElementById("v2l-mint-btn");
    if (v2lMintBtn) v2lMintBtn.addEventListener("click", () => {
      const r = uniswapV2Mint(
        document.getElementById("v2l-m-reserve0").value,
        document.getElementById("v2l-m-reserve1").value,
        document.getElementById("v2l-m-supply").value,
        document.getElementById("v2l-m-amount0").value,
        document.getElementById("v2l-m-amount1").value
      );
      const el = document.getElementById("v2l-mint-out");
      if (r === null) {
        el.textContent = "Check the inputs: reserves, total supply and both deposited amounts must be whole numbers in base units, both deposited amounts at least 1, and no reserve plus its deposit may exceed 2^112 − 1 (the pair stores reserves as uint112). For a first deposit the reserves and total supply must all be 0 and the product of the amounts must have a square root above 1000; for an existing pair the reserves must be non-zero and the deposit large enough to mint at least 1 LP unit.";
        return;
      }
      el.textContent = r.first
        ? `First deposit: you mint ${r.liquidity} LP units and ${r.locked} LP units are locked forever at the zero address (the pair's MINIMUM_LIQUIDITY) — sqrt(${document.getElementById("v2l-m-amount0").value.trim()} × ${document.getElementById("v2l-m-amount1").value.trim()}) = ${r.rootK}, so the pair's total supply becomes ${r.newTotalSupply} and your share is ${r.sharePercent}%. Reserves after the deposit: ${r.newReserve0} / ${r.newReserve1}. Computed locally with UniswapV2Pair's mint math from the values you gave — not live pool data: a real pair's reserves and total supply are chain state, and the pair's optional protocol-fee mint is not modelled. Not financial advice.`
        : `Mint: depositing ${document.getElementById("v2l-m-amount0").value.trim()} / ${document.getElementById("v2l-m-amount1").value.trim()} mints ${r.liquidity} LP units (the smaller of the two sides' pro-rata amounts governs; any excess of the other side stays in the pair). Total supply becomes ${r.newTotalSupply}, your share of the pair is ${r.sharePercent}%, and reserves after the deposit are ${r.newReserve0} / ${r.newReserve1}. Computed locally with UniswapV2Pair's mint math from the values you gave — not live pool data: a real pair's reserves and total supply are chain state, and the pair's optional protocol-fee mint is not modelled. Not financial advice.`;
    });
    const v2lBurnBtn = document.getElementById("v2l-burn-btn");
    if (v2lBurnBtn) v2lBurnBtn.addEventListener("click", () => {
      const r = uniswapV2Burn(
        document.getElementById("v2l-b-balance0").value,
        document.getElementById("v2l-b-balance1").value,
        document.getElementById("v2l-b-supply").value,
        document.getElementById("v2l-b-liquidity").value
      );
      const el = document.getElementById("v2l-burn-out");
      if (r === null) {
        el.textContent = "Check the inputs: both pair balances, the total supply and the LP amount to burn must be whole numbers in base units, each balance at most 2^112 − 1, the burn at least 1 and no more than the total supply, and the burn must pay out at least 1 base unit of each token (the pair reverts otherwise).";
        return;
      }
      el.textContent = `Burn: ${document.getElementById("v2l-b-liquidity").value.trim()} LP units pay out ${r.amount0} base units of token0 and ${r.amount1} base units of token1 — pro-rata from the pair's balances, each division floored. Total supply becomes ${r.newTotalSupply} and the pair's balances after the burn are ${r.newBalance0} / ${r.newBalance1}. Computed locally with UniswapV2Pair's burn math from the values you gave — not live pool data: a real pair's balances and total supply are chain state, and the pair's optional protocol-fee mint is not modelled. Not financial advice.`;
    });

    /* Uniswap V3 tick ⇄ sqrtPriceX96 converter */
    const v3tBtn = document.getElementById("v3t-btn");
    if (v3tBtn) v3tBtn.addEventListener("click", () => {
      const mode = document.getElementById("v3t-mode").value;
      const r = uniswapV3Tick(mode, document.getElementById("v3t-value").value);
      const el = document.getElementById("v3t-out");
      if (r === null) {
        el.textContent = "Check the input: a tick must be a whole number from −887272 to 887272; a sqrtPriceX96 must be a whole number (decimal or 0x hex) from 4295128739 up to but not including 1461446703485210103287273052203988822378723970342 — the maximum tick's own ratio is refused in the reverse direction, as TickMath requires, because a pool price can never reach it.";
        return;
      }
      el.textContent = `Tick ${r.tick} · sqrtPriceX96 ${r.sqrtPriceX96} · raw price (token1 per token0) ${r.price}. Converted locally with TickMath's exact integer math from the value you gave — not live pool data: a real pool's tick and sqrtPriceX96 are its slot0. The raw price ignores token decimals; scale by 10^(decimals of token0 − decimals of token1) for a human price.`;
    });

    /* Uniswap V3 liquidity amounts calculator */
    const v3lBtn = document.getElementById("v3l-btn");
    if (v3lBtn) v3lBtn.addEventListener("click", () => {
      const mode = document.getElementById("v3l-mode").value;
      const r = uniswapV3Liquidity(
        mode,
        document.getElementById("v3l-lower").value,
        document.getElementById("v3l-upper").value,
        document.getElementById("v3l-current").value,
        document.getElementById("v3l-liquidity").value,
        document.getElementById("v3l-amount0").value,
        document.getElementById("v3l-amount1").value
      );
      const el = document.getElementById("v3l-out");
      if (r === null) {
        el.textContent = "Check the inputs: ticks must be whole numbers from −887272 to 887272 with the lower tick below the upper tick; in amounts mode the liquidity must be a whole number from 1 to below 2^128; in liquidity mode the desired amounts must be whole numbers of 0 or more in base units (the side of the range the current price sits on must be non-zero), must mint a liquidity of at least 1 and below 2^128, and each must be below 2^256.";
        return;
      }
      el.textContent = r.mode === "amounts"
        ? `Position amounts: liquidity ${r.liquidity} between ticks ${r.tickLower} and ${r.tickUpper} at current tick ${r.tickCurrent} holds ${r.amount0} base units of token0 and ${r.amount1} base units of token1 (amounts rounded down, as LiquidityAmounts computes them; a side that is 0 means the current price is at or beyond that end of the range, or the amount floors to 0 at this liquidity). Computed locally with LiquidityAmounts / SqrtPriceMath from the values you gave — not live pool data: a real position's ticks and liquidity and the pool's current tick are chain state.`
        : `Liquidity: depositing at most ${r.desiredAmount0} base units of token0 and ${r.desiredAmount1} base units of token1 between ticks ${r.tickLower} and ${r.tickUpper} at current tick ${r.tickCurrent} mints liquidity ${r.liquidity}, which actually uses ${r.amount0} base units of token0 and ${r.amount1} base units of token1 — the desired amount on the non-limiting side is only partly used, and even the limiting side can leave a few base units of rounding dust. Computed locally with LiquidityAmounts / SqrtPriceMath from the values you gave — not live pool data and not financial advice.`;
    });

    /* Uniswap V3 swap step calculator */
    const v3sBtn = document.getElementById("v3s-btn");
    if (v3sBtn) v3sBtn.addEventListener("click", () => {
      const mode = document.getElementById("v3s-mode").value;
      const r = uniswapV3SwapStep(
        mode,
        document.getElementById("v3s-current").value,
        document.getElementById("v3s-target").value,
        document.getElementById("v3s-liquidity").value,
        document.getElementById("v3s-amount").value,
        document.getElementById("v3s-fee").value
      );
      const el = document.getElementById("v3s-out");
      if (r === null) {
        el.textContent = "Check the inputs: the current and target ticks must be different whole numbers from −887272 to 887272; the liquidity must be a whole number from 1 to below 2^128; the specified amount must be a whole number of at least 1 base unit and below 2^256; the fee must be a whole number from 0 to 999999 hundredths of a bip.";
        return;
      }
      const inToken = r.zeroForOne ? "token0" : "token1";
      const outToken = r.zeroForOne ? "token1" : "token0";
      el.textContent = `Swap step ${inToken} → ${outToken}: at liquidity ${r.liquidity} the price moves from tick ${r.tickCurrent} (sqrtPriceX96 ${r.sqrtCurrent}) to tick ${r.tickNext} (sqrtPriceX96 ${r.sqrtNext}) — ${r.reachedTarget ? `it reaches the target tick ${r.tickTarget}` : `it stops before the target tick ${r.tickTarget}`}. You send ${r.amountIn} base units of ${inToken} plus a fee of ${r.feeAmount} (total input ${r.totalInput}) and receive ${r.amountOut} base units of ${outToken}; ${r.remaining} base units of the specified amount ${r.mode === "in" ? "remain unspent" : "remain unfilled"} — in a real pool the swap loop would continue into the next tick range with them, while here the step simply stops at the target. Computed locally with SwapMath / SqrtPriceMath from the values you gave — not live pool data: a real pool's price, liquidity and fee tier are chain state, a full swap crosses initialized ticks and later steps see changed liquidity, and none of that is modelled here. Not financial advice.`;
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

    /* EIP-2612 permit digest */
    const permitBtn = document.getElementById("permit-btn");
    if (permitBtn) permitBtn.addEventListener("click", () => {
      const r = permitDigest(
        document.getElementById("permit-name").value,
        document.getElementById("permit-version").value,
        document.getElementById("permit-chain").value,
        document.getElementById("permit-token").value,
        document.getElementById("permit-owner").value,
        document.getElementById("permit-spender").value,
        document.getElementById("permit-value").value,
        document.getElementById("permit-nonce").value,
        document.getElementById("permit-deadline").value
      );
      const el = document.getElementById("permit-out");
      el.textContent = r === null
        ? "Check the inputs: token name and EIP-712 version must be non-empty, chain ID a whole number of 1 or more, token / owner / spender 20-byte addresses (0x + 40 hex), and value, nonce and deadline whole numbers below 2^256."
        : `Permit digest (what the owner signs): ${r.digest} · Domain separator: ${r.domainSeparator} · Permit struct hash: ${r.structHash} · Permit type hash: ${r.permitTypeHash}. The token's permit() accepts a signature over this digest only while the nonce is the owner's current permit nonce and the deadline has not passed — both are chain state this page does not read. Computed locally — nothing is signed, no key is used or asked for, and no chain is queried.`;
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

    /* Raw transaction decoder */
    const rlpEncBtn = document.getElementById("rlp-enc-btn");
    if (rlpEncBtn) rlpEncBtn.addEventListener("click", () => {
      const input = document.getElementById("rlp-enc-input").value;
      const r = rlpEncodeInput(input);
      const el = document.getElementById("rlp-enc-out");
      el.textContent = r === null
        ? "That value could not be encoded — use a \"quoted string\", a bare word, a 0x hex value, a decimal integer, or a [list, of, values] with balanced brackets, and exactly one top-level value."
        : `RLP encoding (${(r.length - 2) / 2} bytes): ${r}. Encoded locally — nothing is sent and no chain is queried.`;
    });
    const rlpDecBtn = document.getElementById("rlp-dec-btn");
    if (rlpDecBtn) rlpDecBtn.addEventListener("click", () => {
      const input = document.getElementById("rlp-dec-input").value;
      const r = rlpDecodeInput(input);
      const el = document.getElementById("rlp-dec-out");
      el.textContent = r === null
        ? "That hex does not strictly decode as one canonical RLP value — check it is complete (no truncation), canonical (no 0x81-prefixed small byte, no long length form for a short payload, no leading-zero lengths), and has no trailing bytes after the value."
        : `Decoded value: ${r}. Byte strings are shown as 0x hex, with their text alongside when every byte is printable ASCII. Decoded locally — nothing is sent and no chain is queried.`;
    });
    const txdBtn = document.getElementById("txd-btn");
    if (txdBtn) txdBtn.addEventListener("click", () => {
      const r = decodeRawTransaction(document.getElementById("txd-raw").value);
      const el = document.getElementById("txd-out");
      if (r === null) {
        el.textContent = "That does not strictly decode as a legacy, EIP-2930 (type 1), EIP-1559 (type 2), EIP-4844 (type 3), or EIP-7702 (type 4) transaction — check the hex is complete and canonical RLP (no trailing bytes, no leading-zero integers or lengths, no long form for short payloads), the field count matches the type, `to` is empty or 20 bytes, and v is 27/28 or an EIP-155 value (legacy) or 0/1 (typed). A type 4 transaction additionally needs a destination (no contract creation) and a non-empty authorization list with in-bounds tuples. A type 3 transaction additionally needs a destination (no contract creation) and a non-empty list of 32-byte blob versioned hashes, each starting with 0x01, in the execution-payload form — the pooled network wrapper that carries the blobs themselves is a different shape and is not decoded.";
        return;
      }
      const typeName = { legacy: "legacy", eip2930: "EIP-2930 (type 1)", eip1559: "EIP-1559 (type 2)", eip4844: "EIP-4844 (type 3)", eip7702: "EIP-7702 (type 4)" }[r.type];
      const fees = r.type === "eip1559" || r.type === "eip4844" || r.type === "eip7702"
        ? `max priority fee ${r.maxPriorityFeePerGas} wei · max fee ${r.maxFeePerGas} wei`
        : `gas price ${r.gasPrice} wei`;
      let msg = `${typeName} transaction${r.signed ? " (signed)" : " (unsigned)"} · chain ID: ${r.chainId === null ? "none in the transaction (pre-EIP-155 legacy)" : r.chainId} · nonce ${r.nonce} · ${fees} · gas limit ${r.gasLimit} · to: ${r.to === null ? "contract creation (empty)" : r.to} · value ${r.value} wei · data ${r.data}`;
      if (r.accessList !== null) msg += ` · access list: ${r.accessList.length === 0 ? "empty" : JSON.stringify(r.accessList)}`;
      if (r.blobVersionedHashes !== null) msg += ` · max fee per blob gas ${r.maxFeePerBlobGas} wei · blob versioned hashes: ${JSON.stringify(r.blobVersionedHashes)}`;
      if (r.authorizationList !== null) msg += ` · authorization list: ${JSON.stringify(r.authorizationList)}`;
      if (r.signed) msg += ` · v ${r.v} (y-parity ${r.yParity}) · r ${r.r} · s ${r.s}`;
      msg += ` · Signing hash: ${r.signingHash} · Transaction hash: ${r.txHash}. Decoded locally from the RLP alone — the signature is decoded, not verified, no sender is recovered, and no chain is queried. The same decoding applies on Ethereum, Base, Unichain and Robinhood Chain.`;
      el.textContent = msg;
    });

    /* Raw transaction encoder */
    const txeBtn = document.getElementById("txe-btn");
    if (txeBtn) txeBtn.addEventListener("click", () => {
      const el = document.getElementById("txe-out");
      const val = id => document.getElementById(id).value;
      const parseAccess = text => {
        const out = [];
        for (const line of text.split("\n")) {
          const t = line.trim();
          if (t === "") continue;
          const colon = t.indexOf(":");
          const address = (colon === -1 ? t : t.slice(0, colon)).trim();
          const keys = colon === -1 ? [] : t.slice(colon + 1).split(/[\s,]+/).filter(x => x !== "");
          out.push({ address, storageKeys: keys });
        }
        return out;
      };
      const parseAuth = text => {
        const out = [];
        for (const line of text.split("\n")) {
          const t = line.trim();
          if (t === "") continue;
          const parts = t.split(",").map(x => x.trim());
          if (parts.length !== 6) return null;
          out.push({ chainId: parts[0], address: parts[1], nonce: parts[2], yParity: parts[3], r: parts[4], s: parts[5] });
        }
        return out;
      };
      const sigFields = [val("txe-yparity"), val("txe-r"), val("txe-s")];
      const signature = sigFields.every(x => x.trim() === "") ? null
        : { yParity: sigFields[0].trim(), r: sigFields[1].trim(), s: sigFields[2].trim() };
      const r = encodeRawTransaction({
        type: val("txe-type"),
        chainId: val("txe-chainid"),
        nonce: val("txe-nonce"),
        gasPrice: val("txe-gasprice"),
        maxPriorityFeePerGas: val("txe-maxprio"),
        maxFeePerGas: val("txe-maxfee"),
        gasLimit: val("txe-gaslimit"),
        to: val("txe-to"),
        value: val("txe-value"),
        data: val("txe-data"),
        accessList: parseAccess(val("txe-access")),
        maxFeePerBlobGas: val("txe-blobfee"),
        blobVersionedHashes: val("txe-blobhashes").split(/[\s,]+/).filter(x => x !== ""),
        authorizationList: parseAuth(val("txe-auth")),
        signature
      });
      if (r === null) {
        el.textContent = "That could not be encoded — check the fields this type reads: every amount is a plain decimal integer below 2^256, the destination is empty (contract creation, legacy / type 1 / type 2 only) or a full 20-byte address, the data is even-length hex, each access-list line is an address optionally followed by ': key, key', and the signature is either all three fields (y-parity 0 or 1, r, s as hex) or all blank. A type 3 transaction additionally needs a destination, a max fee per blob gas, and at least one 32-byte blob versioned hash starting with 0x01. A type 4 transaction additionally needs a destination and at least one authorization line 'chainId, address, nonce, yParity, r, s' with a nonce below 2^64.";
        return;
      }
      const typeName = { legacy: "legacy", eip2930: "EIP-2930 (type 1)", eip1559: "EIP-1559 (type 2)", eip4844: "EIP-4844 (type 3)", eip7702: "EIP-7702 (type 4)" }[r.type];
      if (r.signed) {
        el.textContent = `Signed ${typeName} transaction · v ${r.v} · Raw transaction (${(r.raw.length - 2) / 2} bytes): ${r.raw} · Signing hash: ${r.signingHash} · Transaction hash: ${r.txHash}. Encoded locally from the fields alone — the signature was assembled, not produced: no key was used and nothing was signed here. Check it in the decoder above, which reads exactly these bytes. The same encoding applies on Ethereum, Base, Unichain and Robinhood Chain.`;
      } else if (r.raw !== null) {
        el.textContent = `Unsigned ${typeName} transaction · Raw unsigned encoding (${(r.raw.length - 2) / 2} bytes): ${r.raw} · Signing payload: ${r.signingPayload} · Signing hash (what the signer signs): ${r.signingHash}. Sign that hash with the sender's key elsewhere, then fill in y-parity, r and s to assemble the signed transaction. Encoded locally — no key was used, nothing was signed, and no chain was queried.`;
      } else {
        el.textContent = `Unsigned legacy (EIP-155) transaction · Signing payload (${(r.signingPayload.length - 2) / 2} bytes): ${r.signingPayload} · Signing hash (what the signer signs): ${r.signingHash}. An unsigned EIP-155 transaction has no standalone raw form: this payload — the fields followed by chain ID ${r.chainId}, 0, 0 — is exactly what gets hashed, and it becomes a transaction only when v, r and s replace the placeholders, so sign the hash elsewhere, then fill in y-parity, r and s. Encoded locally — no key was used, nothing was signed, and no chain was queried.`;
      }
    });

    /* Signature recovery (ecrecover) */
    const recBtn = document.getElementById("rec-btn");
    if (recBtn) recBtn.addEventListener("click", () => {
      const el = document.getElementById("rec-out");
      const addr = recoverAddress(
        document.getElementById("rec-hash").value,
        document.getElementById("rec-v").value,
        document.getElementById("rec-r").value,
        document.getElementById("rec-s").value
      );
      el.textContent = addr === null
        ? "That does not recover — check the digest and r / s are complete 32-byte hex values, r and s are between 1 and the curve order − 1, s is in the lower half of the order (the canonical EIP-2 form), and v is 0/1, 27/28, or an EIP-155 value (35 or more)."
        : `Signer address: ${addr}. Recovered locally from the digest and signature alone — no private key involved, nothing signed, and no chain queried. The same recovery applies on Ethereum, Base, Unichain and Robinhood Chain.`;
    });

    /* EIP-191 personal_sign digest calculator */
    const pdigBtn = document.getElementById("pdig-btn");
    if (pdigBtn) pdigBtn.addEventListener("click", () => {
      const el = document.getElementById("pdig-out");
      const message = document.getElementById("pdig-message").value;
      const r = personalDigestCalc(message);
      if (r === null) {
        el.textContent = "That message could not be read — the field should hold the message text exactly as it will be signed.";
        return;
      }
      const byteLen = utf8Bytes(message).length;
      el.textContent = `EIP-191 digest (what the wallet signs): ${r.digest} · Payload hashed: ${r.payload} — 0x19, the words "Ethereum Signed Message:", a newline, the message length in bytes as decimal text, then the message itself. Your message is ${byteLen} byte${byteLen === 1 ? "" : "s"}${message.length !== byteLen ? ` but only ${message.length} character${message.length === 1 ? "" : "s"} — the length in the payload counts bytes, so multibyte characters count more than once` : ""}. Sign this digest with your key (a wallet's personal_sign does exactly this), then check the result with the verification tool below. Computed locally — nothing is signed, no key is used or asked for, and no chain is queried.`;
    });

    /* Signed message verification (EIP-191 personal_sign) */
    const msgBtn = document.getElementById("msg-btn");
    if (msgBtn) msgBtn.addEventListener("click", () => {
      const el = document.getElementById("msg-out");
      const r = verifyPersonalSignature(
        document.getElementById("msg-message").value,
        document.getElementById("msg-sig").value
      );
      if (r === null) {
        el.textContent = "That does not verify — check the signature is the complete 65-byte hex value a wallet returns (0x + 130 hex characters: r, s, then v), with s in the lower half of the curve order, and that the message is exactly what was signed, character for character (whitespace and line breaks count).";
        return;
      }
      let msg = `Signer: ${r.signer} · EIP-191 digest signed: ${r.digest}.`;
      const expectRaw = document.getElementById("msg-expect").value.trim();
      if (expectRaw !== "") {
        const exp = inspectAddress(expectRaw);
        if (!exp.valid) msg += " The expected address you gave is not a well-formed address, so no comparison was made.";
        else if (exp.checksum === r.signer) msg += ` ✓ Matches the expected address${exp.checksumValid === false ? " (but the expected address's own checksum is wrong — compare with care)" : ""}.`;
        else msg += ` ✗ Does NOT match the expected address ${exp.checksum} — this signature was made by a different account, or over a different message.`;
      }
      msg += " Verified locally — no key involved, nothing signed, and no chain queried.";
      el.textContent = msg;
    });

    /* EIP-712 typed-data verification (Ether Mail schema) */
    const v712Btn = document.getElementById("v712-btn");
    if (v712Btn) v712Btn.addEventListener("click", () => {
      const el = document.getElementById("v712-out");
      const r = verify712MailSignature(
        document.getElementById("v712-dname").value,
        document.getElementById("v712-dversion").value,
        document.getElementById("v712-dchain").value,
        document.getElementById("v712-dcontract").value,
        document.getElementById("v712-from-name").value,
        document.getElementById("v712-from-wallet").value,
        document.getElementById("v712-to-name").value,
        document.getElementById("v712-to-wallet").value,
        document.getElementById("v712-contents").value,
        document.getElementById("v712-sig").value
      );
      if (r === null) {
        el.textContent = "That does not verify — check the domain and Mail fields are exactly what was signed (names non-empty, chain ID a whole number of 1 or more, every contract/wallet a 20-byte address) and the signature is the complete 65-byte hex value a wallet returns (0x + 130 hex characters: r, s, then v), with s in the lower half of the curve order.";
        return;
      }
      let msg = `Signer: ${r.signer} · EIP-712 digest signed: ${r.digest} · Domain separator: ${r.domainSeparator} · hashStruct(Mail): ${r.structHash}.`;
      const expectRaw = document.getElementById("v712-expect").value.trim();
      if (expectRaw !== "") {
        const exp = inspectAddress(expectRaw);
        if (!exp.valid) msg += " The expected signer you gave is not a well-formed address, so no comparison was made.";
        else if (exp.checksum === r.signer) msg += ` ✓ Matches the expected signer${exp.checksumValid === false ? " (but the expected address's own checksum is wrong — compare with care)" : ""}.`;
        else msg += ` ✗ Does NOT match the expected signer ${exp.checksum} — this signature was made by a different account, or over different typed data.`;
      }
      msg += " Verified locally — no key involved, nothing signed, and no chain queried.";
      el.textContent = msg;
    });

    /* EIP-2612 permit signature verification */
    const pverBtn = document.getElementById("pver-btn");
    if (pverBtn) pverBtn.addEventListener("click", () => {
      const el = document.getElementById("pver-out");
      const ownerRaw = document.getElementById("pver-owner").value;
      const r = verifyPermitSignature(
        document.getElementById("pver-name").value,
        document.getElementById("pver-version").value,
        document.getElementById("pver-chain").value,
        document.getElementById("pver-token").value,
        ownerRaw,
        document.getElementById("pver-spender").value,
        document.getElementById("pver-value").value,
        document.getElementById("pver-nonce").value,
        document.getElementById("pver-deadline").value,
        document.getElementById("pver-sig").value
      );
      if (r === null) {
        el.textContent = "That does not verify — check the token domain and Permit fields are exactly what was signed (token name and EIP-712 version non-empty, chain ID a whole number of 1 or more, token / owner / spender 20-byte addresses, value, nonce and deadline whole numbers below 2^256) and the signature is the complete 65-byte hex value a wallet returns (0x + 130 hex characters: r, s, then v), with s in the lower half of the curve order.";
        return;
      }
      let msg = `Signer: ${r.signer} · Permit digest signed: ${r.digest} · Domain separator: ${r.domainSeparator} · hashStruct(Permit): ${r.structHash}.`;
      const exp = inspectAddress(ownerRaw);
      if (exp.checksum === r.signer) msg += ` ✓ Recovers to the owner — the signer check in the token's permit() passes for this signature${exp.checksumValid === false ? " (but the owner address's own checksum is wrong — compare with care)" : ""}.`;
      else msg += ` ✗ Does NOT recover to the owner ${exp.checksum} — the token's permit() would reject this signature: it was made by a different account, or over different permit fields or a different token domain.`;
      msg += " The token also requires the nonce to be the owner's current permit nonce and the deadline to not have passed — both are chain state this page does not read. Verified locally — no key involved, nothing signed, and no chain queried.";
      el.textContent = msg;
    });

    /* EIP-7702 authorization signature verification */
    const a7702Btn = document.getElementById("a7702-btn");
    if (a7702Btn) a7702Btn.addEventListener("click", () => {
      const el = document.getElementById("a7702-out");
      const chainRaw = document.getElementById("a7702-chain").value.trim();
      const r = verify7702Authorization(
        chainRaw,
        document.getElementById("a7702-addr").value,
        document.getElementById("a7702-nonce").value,
        document.getElementById("a7702-sig").value
      );
      if (r === null) {
        el.textContent = "That does not verify — check the authorization fields are exactly what was signed (chain ID and nonce whole numbers of 0 or more, delegate a 20-byte address) and the signature is the complete 65-byte hex value (0x + 130 hex characters: r, s, then v), with v the y-parity 0 or 1 (or 27 / 28 as wallets return it — an EIP-155-style v is not an authorization v) and s in the lower half of the curve order.";
        return;
      }
      el.textContent = `Authority: ${r.authority} · Authorization digest signed: ${r.digest}. This account delegated its code to the address in the tuple${chainRaw === "0" ? ", and because the tuple's chain ID is 0 the authorization is valid on any chain" : `, on chain ID ${chainRaw} only`}. A client also requires the tuple nonce to equal the authority's current nonce before applying it — chain state this page does not read. Verified locally — no key involved, nothing signed, and no chain queried.`;
    });

    /* EIP-7702 authorization digest calculator */
    const adigBtn = document.getElementById("adig-btn");
    if (adigBtn) adigBtn.addEventListener("click", () => {
      const el = document.getElementById("adig-out");
      const chainRaw = document.getElementById("adig-chain").value.trim();
      const r = authorizationDigestCalc(
        chainRaw,
        document.getElementById("adig-addr").value,
        document.getElementById("adig-nonce").value
      );
      if (r === null) {
        el.textContent = "Check the inputs: chain ID and nonce must be whole numbers of 0 or more, and the delegate a 20-byte address (0x + 40 hex).";
        return;
      }
      el.textContent = `Authorization digest (what the authority signs): ${r.digest} · Payload hashed: ${r.payload} — the 0x05 magic byte followed by rlp([chain_id, address, nonce]).${chainRaw === "0" ? " Because the chain ID is 0, this authorization is valid on any chain." : ""} Sign this digest with the authority's key to build the tuple, then check the result with the verification tool below. Computed locally — nothing is signed, no key is used or asked for, and no chain is queried.`;
    });

    /* Transaction sender recovery */
    const txsBtn = document.getElementById("txs-btn");
    if (txsBtn) txsBtn.addEventListener("click", () => {
      const r = recoverTransactionSender(document.getElementById("txs-raw").value);
      const el = document.getElementById("txs-out");
      if (r === null) {
        el.textContent = "That does not recover a sender — check the hex is a complete, canonical signed transaction (legacy, EIP-2930 type 1, EIP-1559 type 2, EIP-4844 type 3, or EIP-7702 type 4; unsigned transactions have no sender), with r and s in range and s in the lower half of the curve order (the canonical EIP-2 form).";
        return;
      }
      const typeName = { legacy: "legacy", eip2930: "EIP-2930 (type 1)", eip1559: "EIP-1559 (type 2)", eip4844: "EIP-4844 (type 3)", eip7702: "EIP-7702 (type 4)" }[r.type];
      let msg = `Sender: ${r.sender} · ${typeName} transaction · chain ID: ${r.chainId === null ? "none in the transaction (pre-EIP-155 legacy)" : r.chainId} · Signing hash: ${r.signingHash} · Transaction hash: ${r.txHash}.`;
      if (r.authorizations !== null) msg += ` Authorizations: ${r.authorizations.map(a => a.authority === null ? `an unrecoverable signature (delegate ${a.address}, chain ID ${a.chainId}, nonce ${a.nonce}) — a client would skip this tuple` : `${a.authority} delegates to ${a.address} (authorization chain ID ${a.chainId}, nonce ${a.nonce})`).join(" · ")}.`;
      msg += " Recovered locally from the transaction's own signatures — no private key involved, nothing signed, and no chain queried. The same recovery applies on Ethereum, Base, Unichain and Robinhood Chain.";
      el.textContent = msg;
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

    /* EIP-1559 next-block base fee */
    const baseFeeBtn = document.getElementById("basefee-btn");
    if (baseFeeBtn) baseFeeBtn.addEventListener("click", () => {
      const r = nextBaseFee(
        document.getElementById("basefee-parent").value,
        document.getElementById("basefee-used").value,
        document.getElementById("basefee-limit").value
      );
      const el = document.getElementById("basefee-out");
      if (r === null) {
        el.textContent = "Check the inputs: parent base fee in gwei (up to 9 decimals), and parent gas used / gas limit as whole numbers with gas used no more than the gas limit and a gas limit of at least 2.";
        return;
      }
      const move = r.direction === "unchanged"
        ? "the parent sat exactly on its gas target, so the fee is unchanged"
        : `the fee moves ${r.direction} by ${r.deltaWei} wei (${r.deltaGwei} gwei)`;
      el.textContent = `Parent gas target (limit ÷ 2): ${r.gasTarget}. Next block's base fee: ${r.nextBaseFeeWei} wei (${r.nextBaseFeeGwei} gwei) — ${move}. Computed locally with EIP-1559's own update rule from the parent values you gave — this is the protocol's formula, not live network data.`;
    });

    /* EIP-4844 blob gas & base fee */
    const blobBtn = document.getElementById("blob-btn");
    if (blobBtn) blobBtn.addEventListener("click", () => {
      const r = blobFeeCalc(
        document.getElementById("blob-excess").value,
        document.getElementById("blob-used").value,
        document.getElementById("blob-count").value,
        document.getElementById("blob-schedule").value
      );
      const el = document.getElementById("blob-out");
      if (r === null) {
        el.textContent = "Check the inputs: parent excess blob gas and parent blob gas used are whole numbers (parent excess up to 999,999,999; a parent block cannot have used more blob gas than the schedule's maximum — 786,432 for Cancun, 1,179,648 for Prague), and the blob count is a whole number of 1 or more.";
        return;
      }
      const schedName = r.schedule === "prague" ? "Prague (EIP-7691)" : "Cancun (EIP-4844)";
      el.textContent = `Under the ${schedName} schedule: excess blob gas for this block: ${r.excessBlobGas} · Base fee per blob gas: ${r.baseFeeWei} wei (${r.baseFeeGwei} gwei) · Blob gas for ${document.getElementById("blob-count").value.trim()} blob(s): ${r.blobGas} · Total blob fee at this base fee: ${r.totalFeeWei} wei (${r.totalFeeEth} ETH). Computed locally from the parent values you gave, with the EIPs' own formulas — this is the protocol's pricing rule, not live network data: read a real block's excess_blob_gas from your own node or explorer to price the current fee.`;
    });

    /* Intrinsic gas (minimum gas limit) */
    const igBtn = document.getElementById("ig-btn");
    if (igBtn) igBtn.addEventListener("click", () => {
      const r = intrinsicGas(
        document.getElementById("ig-data").value,
        document.getElementById("ig-kind").value,
        document.getElementById("ig-addrs").value,
        document.getElementById("ig-keys").value,
        document.getElementById("ig-auths").value
      );
      const el = document.getElementById("ig-out");
      if (r === null) {
        el.textContent = "Check the inputs: the data must be hex (0x for none), the counts must be whole numbers of 0 or more (at most 1,000,000 each), a creation transaction's initcode may not exceed 49,152 bytes, and an EIP-7702 authorization count only applies to a call — a set-code transaction must have a destination, so it cannot also create a contract.";
        return;
      }
      el.textContent = `Data: ${r.byteLength} byte(s) — ${r.zeroBytes} zero, ${r.nonzeroBytes} non-zero (${r.tokens} calldata token(s), costing ${r.dataCost} gas at the standard rate) · Access list: ${r.accessCost} gas · Creation: ${r.createCost} gas · Authorizations: ${r.authCost} gas · Standard intrinsic cost: ${r.standard} gas · EIP-7623 calldata floor: ${r.floor} gas · Minimum gas limit: ${r.minimum} gas${r.floorBinds ? " — the calldata floor binds, because this transaction is data-heavy relative to its other intrinsic costs" : ""}. This is the minimum before execution, not a prediction of total gas used: execution costs more, and L2s add their own fees. Computed locally from the values you gave — not live network data.`;
    });

    /* ERC-4626 vault conversion */
    const vaultBtn = document.getElementById("vault-btn");
    if (vaultBtn) vaultBtn.addEventListener("click", () => {
      const mode = document.getElementById("vault-mode").value;
      const r = erc4626Convert(mode,
        document.getElementById("vault-assets").value,
        document.getElementById("vault-supply").value,
        document.getElementById("vault-amount").value,
        document.getElementById("vault-offset").value);
      const el = document.getElementById("vault-out");
      if (r === null) {
        el.textContent = "Check the inputs: total assets, total supply and amount are whole numbers in base units (up to 78 digits), the decimals offset is a whole number from 0 to 255, and the result must fit in a uint256.";
        return;
      }
      el.textContent = `${r.fn}: ${document.getElementById("vault-amount").value.trim()} ${r.inputUnit} → ${r.result} ${r.outputUnit} (rounded ${r.rounding}, in the vault's favour; virtual shares ${r.virtualShares}, virtual assets 1). Computed locally with the ERC-4626 conversion math on the totals you gave — a real vault's totals are chain state this page does not read, and its deposit/withdrawal limits are not modelled. Not financial advice.`;
    });

    /* Compound cToken exchange rate & mint/redeem */
    const compBtn = document.getElementById("comp-btn");
    if (compBtn) compBtn.addEventListener("click", () => {
      const mode = document.getElementById("comp-mode").value;
      const r = compoundCToken(mode,
        document.getElementById("comp-cash").value,
        document.getElementById("comp-borrows").value,
        document.getElementById("comp-reserves").value,
        document.getElementById("comp-supply").value,
        document.getElementById("comp-initial").value,
        document.getElementById("comp-amount").value);
      const el = document.getElementById("comp-out");
      if (r === null) {
        el.textContent = "Check the inputs: cash, borrows, reserves, supply, initial rate and amount are whole numbers in base units (up to 78 digits), reserves do not exceed cash + borrows, the initial exchange rate is positive, and no rate or result exceeds the uint256 maximum.";
        return;
      }
      el.textContent = mode === "rate"
        ? `exchangeRateStored: ${r.result} (the exchange rate mantissa, scaled by 1e18). Computed locally with CToken's stored-rate formula on the totals you gave — a real market's totals are chain state this page does not read, and interest accrual to the current block is not performed. Not financial advice.`
        : `${r.fn}: ${document.getElementById("comp-amount").value.trim()} ${r.inputUnit} → ${r.result} ${r.outputUnit} (exchange rate mantissa ${r.exchangeRate}, truncated exactly as CToken truncates). Computed locally on the totals you gave — a real market's totals are chain state this page does not read, and Comptroller checks are not modelled. Not financial advice.`;
    });

    /* Compound interest accrual */
    const caccBtn = document.getElementById("cacc-btn");
    if (caccBtn) caccBtn.addEventListener("click", () => {
      const r = compoundAccrue(
        document.getElementById("cacc-rate").value,
        document.getElementById("cacc-blocks").value,
        document.getElementById("cacc-borrows").value,
        document.getElementById("cacc-reserves").value,
        document.getElementById("cacc-factor").value,
        document.getElementById("cacc-index").value);
      const el = document.getElementById("cacc-out");
      if (r === null) {
        el.textContent = "Check the inputs: rate, blocks, borrows, reserves, reserve factor and borrow index are whole numbers (up to 78 digits), the borrow rate per block does not exceed the contract's maximum mantissa of 5000000000000, the reserve factor does not exceed 1e18, and no product or total exceeds the uint256 maximum.";
        return;
      }
      el.textContent = `accrueInterest over ${document.getElementById("cacc-blocks").value.trim()} blocks: simple interest factor ${r.factor} (mantissa), interest accumulated ${r.interest} underlying, new total borrows ${r.borrows}, new total reserves ${r.reserves}, new borrow index ${r.index}. Computed locally with CToken's accrual formula at the rate you gave held constant over the gap — a real market's totals, index and rate are chain state this page does not read. Not financial advice.`;
    });

    /* Compound account snapshot */
    const csnapBtn = document.getElementById("csnap-btn");
    if (csnapBtn) csnapBtn.addEventListener("click", () => {
      const r = compoundSnapshot(
        document.getElementById("csnap-principal").value,
        document.getElementById("csnap-snap-index").value,
        document.getElementById("csnap-market-index").value,
        document.getElementById("csnap-tokens").value,
        document.getElementById("csnap-rate").value);
      const el = document.getElementById("csnap-out");
      if (r === null) {
        el.textContent = "Check the inputs: principal, both borrow indexes, cToken balance and exchange rate are whole numbers (up to 78 digits), the snapshot borrow index is positive whenever a borrow principal exists, and no product exceeds the uint256 maximum.";
        return;
      }
      el.textContent = `getAccountSnapshot: borrow balance ${r.borrow} underlying, cToken balance ${r.tokens}, underlying balance ${r.underlying} (at the stored exchange rate you gave). Computed locally with CToken's stored-snapshot formulas on the values you gave — a real account's snapshot, indexes and rate are chain state this page does not read, and no interest accrual is performed. Not financial advice.`;
    });

    /* Compound interest rate model */
    const cirmBtn = document.getElementById("cirm-btn");
    if (cirmBtn) cirmBtn.addEventListener("click", () => {
      const r = compoundRateModel(
        document.getElementById("cirm-cash").value,
        document.getElementById("cirm-borrows").value,
        document.getElementById("cirm-reserves").value,
        document.getElementById("cirm-base").value,
        document.getElementById("cirm-mult").value,
        document.getElementById("cirm-jump").value,
        document.getElementById("cirm-kink").value,
        document.getElementById("cirm-factor").value);
      const el = document.getElementById("cirm-out");
      if (r === null) {
        el.textContent = "Check the inputs: cash, borrows, reserves, the three per-block rate parameters, the kink and the reserve factor are whole numbers (up to 78 digits), reserves do not exceed cash + borrows while borrows are non-zero, the reserve factor does not exceed 1e18, and no product exceeds the uint256 maximum.";
        return;
      }
      el.textContent = `JumpRateModelV2: utilization ${r.utilization} (mantissa, ${r.regime}), borrow rate per block ${r.borrowRate} (mantissa), supply rate per block ${r.supplyRate} (mantissa, after the reserve factor). Computed locally with the rate model's formulas on the totals and parameters you gave — a real market's totals and model parameters are chain state this page does not read. Not financial advice.`;
    });

    /* Compound liquidation seize tokens */
    const cseizeBtn = document.getElementById("cseize-btn");
    if (cseizeBtn) cseizeBtn.addEventListener("click", () => {
      const r = compoundSeizeTokens(
        document.getElementById("cseize-repay").value,
        document.getElementById("cseize-incentive").value,
        document.getElementById("cseize-price-borrowed").value,
        document.getElementById("cseize-price-collateral").value,
        document.getElementById("cseize-rate").value);
      const el = document.getElementById("cseize-out");
      if (r === null) {
        el.textContent = "Check the inputs: repay amount, liquidation incentive, both oracle prices and the collateral exchange rate are whole numbers (up to 78 digits), both oracle prices are non-zero, the collateral price times the exchange rate does not truncate to zero, and no product exceeds the uint256 maximum.";
        return;
      }
      el.textContent = `liquidateCalculateSeizeTokens: seizing ${r.seizeTokens} collateral cTokens for the repay (ratio ${r.ratio}, mantissa), worth ${r.seizeUnderlying} collateral underlying at the stored exchange rate you gave. Computed locally with the Comptroller's Exp-step formulas on the values you gave — a real liquidation's prices, incentive and rate are oracle and chain state this page does not read, and whether the account is liquidatable at all is a separate check. Not financial advice.`;
    });

    /* Compound hypothetical account liquidity */
    const cliqBtn = document.getElementById("cliq-btn");
    if (cliqBtn) cliqBtn.addEventListener("click", () => {
      const r = compoundLiquidity(
        document.getElementById("cliq-balance").value,
        document.getElementById("cliq-borrow-balance").value,
        document.getElementById("cliq-factor").value,
        document.getElementById("cliq-rate").value,
        document.getElementById("cliq-price").value,
        document.getElementById("cliq-redeem").value,
        document.getElementById("cliq-borrow-amt").value);
      const el = document.getElementById("cliq-out");
      if (r === null) {
        el.textContent = "Check the inputs: cToken balance, borrow balance, collateral factor, exchange rate, oracle price, hypothetical redeem and hypothetical borrow are whole numbers (up to 78 digits), the oracle price is non-zero, and no product or sum exceeds the uint256 maximum.";
        return;
      }
      el.textContent = `getHypotheticalAccountLiquidity (one market): tokens-to-denom factor ${r.tokensToDenom} (mantissa) · collateral value ${r.collateral} · borrows plus hypothetical effects ${r.borrowPlusEffects} · liquidity ${r.liquidity} · shortfall ${r.shortfall} (all in the oracle's normalised price units). Computed locally with the Comptroller's Exp-step formulas on the values you gave — a real account's balances, factor, rate and price are chain state this page does not read, and an account in more markets sums the same per-market terms across all of them. Not financial advice.`;
    });

    /* Compound liquidation allowed / max repay */
    const clqaBtn = document.getElementById("clqa-btn");
    if (clqaBtn) clqaBtn.addEventListener("click", () => {
      const r = compoundLiquidateAllowed(
        document.getElementById("clqa-borrow-balance").value,
        document.getElementById("clqa-close-factor").value,
        document.getElementById("clqa-shortfall").value,
        document.getElementById("clqa-repay").value,
        document.getElementById("clqa-deprecated").value === "yes");
      const el = document.getElementById("clqa-out");
      if (r === null) {
        el.textContent = "Check the inputs: borrow balance, close factor, shortfall and repay amount are whole numbers (up to 78 digits), and the close factor times the borrow balance does not exceed the uint256 maximum.";
        return;
      }
      const detail = r.verdict === "allowed"
        ? (r.maxClose === null
          ? "the deprecated-market path places no close-factor cap on the repay, only the borrow balance itself"
          : `the repay is at or under the maximum close amount of ${r.maxClose}`)
        : r.verdict === "insufficient-shortfall"
          ? "the account has no shortfall, so it is not liquidatable at all — the close-factor cap is never reached"
          : r.verdict === "too-much-repay"
            ? `the repay exceeds the maximum close amount of ${r.maxClose} (close factor × borrow balance, truncated)`
            : "a deprecated market's repay cannot exceed the total borrow balance";
      el.textContent = `liquidateBorrowAllowed: ${r.allowed ? "ALLOWED" : "NOT ALLOWED"} — ${detail}. Computed locally with the Comptroller's formula on the values you gave — a real account's borrow balance, shortfall and the market's close factor are chain state this page does not read, and the market-listing and cToken-side checks are separate. Not financial advice.`;
    });

    /* Compound borrow allowed */
    const cbqaBtn = document.getElementById("cbqa-btn");
    if (cbqaBtn) cbqaBtn.addEventListener("click", () => {
      const r = compoundBorrowAllowed(
        document.getElementById("cbqa-balance").value,
        document.getElementById("cbqa-borrow-balance").value,
        document.getElementById("cbqa-factor").value,
        document.getElementById("cbqa-rate").value,
        document.getElementById("cbqa-price").value,
        document.getElementById("cbqa-borrow-amt").value,
        document.getElementById("cbqa-total-borrows").value,
        document.getElementById("cbqa-borrow-cap").value);
      const el = document.getElementById("cbqa-out");
      if (r === null) {
        el.textContent = "Check the inputs: cToken balance, borrow balance, collateral factor, exchange rate, oracle price, borrow amount, market total borrows and borrow cap are whole numbers (up to 78 digits), and — on a path that reaches it — no cap addition, product or sum exceeds the uint256 maximum.";
        return;
      }
      const detail = r.verdict === "allowed"
        ? (r.nextTotalBorrows === null
          ? `the market borrow cap is unlimited (0), and after the borrow the account holds liquidity ${r.liquidity} with no shortfall`
          : `the market's total borrows would rise to ${r.nextTotalBorrows}, under its borrow cap, and after the borrow the account holds liquidity ${r.liquidity} with no shortfall`)
        : r.verdict === "price-error"
          ? "the borrowed market's oracle price is zero, so the check stops there — the borrow cap and the liquidity check are never reached"
          : r.verdict === "borrow-cap-reached"
            ? `the market's total borrows would reach ${r.nextTotalBorrows}, and the contract requires the total after a borrow to stay strictly below the borrow cap — the liquidity check is never reached`
            : `after the borrow the account would hold a shortfall of ${r.shortfall} (the liquidity calculator's hypothetical check with this borrow applied)`;
      el.textContent = `borrowAllowed: ${r.allowed ? "ALLOWED" : "NOT ALLOWED"} — ${detail}. Computed locally with the Comptroller's check on the values you gave — a real account's balances, factor, rate and price and the market's totals and cap are chain state this page does not read, and the market-listing, pause and membership steps are separate. Not financial advice.`;
    });

    /* Compound redeem allowed */
    const crqaBtn = document.getElementById("crqa-btn");
    if (crqaBtn) crqaBtn.addEventListener("click", () => {
      const r = compoundRedeemAllowed(
        document.getElementById("crqa-balance").value,
        document.getElementById("crqa-borrow-balance").value,
        document.getElementById("crqa-factor").value,
        document.getElementById("crqa-rate").value,
        document.getElementById("crqa-price").value,
        document.getElementById("crqa-redeem").value,
        document.getElementById("crqa-member").value === "yes");
      const el = document.getElementById("crqa-out");
      if (r === null) {
        el.textContent = "Check the inputs: cToken balance, borrow balance, collateral factor, exchange rate, oracle price and redeem amount are whole numbers (up to 78 digits), and — on the member path that reaches it — the oracle price is non-zero and no product or sum exceeds the uint256 maximum.";
        return;
      }
      const detail = r.verdict === "not-in-market-bypass"
        ? "the account has not entered this market, so the Comptroller bypasses the liquidity check entirely — no liquidity is computed and the redeem amount is not weighed by this gate"
        : r.verdict === "allowed"
          ? `after the redeem the account holds liquidity ${r.liquidity} with no shortfall`
          : `after the redeem the account would hold a shortfall of ${r.shortfall} (the liquidity calculator's hypothetical check with this redeem applied)`;
      el.textContent = `redeemAllowed: ${r.allowed ? "ALLOWED" : "NOT ALLOWED"} — ${detail}. Computed locally with the Comptroller's check on the values you gave — a real account's balances, factor, rate, price and membership are chain state this page does not read, and the market-listing check and the cToken-side steps are separate. Not financial advice.`;
    });

    /* Compound transfer allowed */
    const ctqaBtn = document.getElementById("ctqa-btn");
    if (ctqaBtn) ctqaBtn.addEventListener("click", () => {
      const r = compoundTransferAllowed(
        document.getElementById("ctqa-balance").value,
        document.getElementById("ctqa-borrow-balance").value,
        document.getElementById("ctqa-factor").value,
        document.getElementById("ctqa-rate").value,
        document.getElementById("ctqa-price").value,
        document.getElementById("ctqa-transfer").value,
        document.getElementById("ctqa-member").value === "yes");
      const el = document.getElementById("ctqa-out");
      if (r === null) {
        el.textContent = "Check the inputs: source cToken balance, borrow balance, collateral factor, exchange rate, oracle price and transfer amount are whole numbers (up to 78 digits), and — on the member path that reaches it — the oracle price is non-zero and no product or sum exceeds the uint256 maximum.";
        return;
      }
      const detail = r.verdict === "not-in-market-bypass"
        ? "the source account has not entered this market, so the Comptroller bypasses the liquidity check entirely — no liquidity is computed and the transfer amount is not weighed by this gate"
        : r.verdict === "allowed"
          ? `after the transfer the source account holds liquidity ${r.liquidity} with no shortfall`
          : `after the transfer the source account would hold a shortfall of ${r.shortfall} (the liquidity calculator's hypothetical check with this transfer applied as a redeem)`;
      el.textContent = `transferAllowed: ${r.allowed ? "ALLOWED" : "NOT ALLOWED"} — ${detail}. The destination account is never read by this gate. Computed locally with the Comptroller's check on the values you gave — a real account's balances, factor, rate, price and membership are chain state this page does not read, and the market-listing check, the transfer pause guardian and the cToken-side steps are separate. Not financial advice.`;
    });

    /* Compound exit market */
    const cxqaBtn = document.getElementById("cxqa-btn");
    if (cxqaBtn) cxqaBtn.addEventListener("click", () => {
      const r = compoundExitMarket(
        document.getElementById("cxqa-balance").value,
        document.getElementById("cxqa-owed").value,
        document.getElementById("cxqa-factor").value,
        document.getElementById("cxqa-rate").value,
        document.getElementById("cxqa-price").value,
        document.getElementById("cxqa-member").value === "yes");
      const el = document.getElementById("cxqa-out");
      if (r === null) {
        el.textContent = "Check the inputs: cToken balance, amount owed, collateral factor, exchange rate and oracle price are whole numbers (up to 78 digits), and — on the member path that reaches it — the oracle price is non-zero and no product or sum exceeds the uint256 maximum.";
        return;
      }
      const detail = r.verdict === "nonzero-borrow-balance"
        ? "the account still owes underlying in this market, and the Comptroller refuses the exit at that first step — the liquidity check is never reached"
        : r.verdict === "not-in-market-bypass"
          ? "the account has not entered this market and owes nothing in it, so the Comptroller bypasses the liquidity check entirely — no liquidity is computed and there is no membership to remove"
          : `the liquidity check runs with the full balance as the redeem amount, so its collateral and redeem terms cancel exactly — the check completes with liquidity ${r.liquidity} and shortfall ${r.shortfall}`;
      el.textContent = `exitMarket: ${r.allowed ? "ALLOWED" : "NOT ALLOWED"} — ${detail}. Computed locally with the Comptroller's check on the values you gave — a real account's balances, factor, rate, price and membership are chain state this page does not read, and the market-listing check and the snapshot read are separate. Not financial advice.`;
    });

    /* Aave V3 account data */
    const aaveBtn = document.getElementById("aave-btn");
    if (aaveBtn) aaveBtn.addEventListener("click", () => {
      const r = aaveAccountCalc(
        document.getElementById("aave-collateral").value,
        document.getElementById("aave-debt").value,
        document.getElementById("aave-ltv").value,
        document.getElementById("aave-threshold").value);
      const el = document.getElementById("aave-out");
      if (r === null) {
        el.textContent = "Check the inputs: total collateral and total debt are whole numbers in the oracle base currency's base units (up to 78 digits), the average LTV and average liquidation threshold are whole numbers from 0 to 10000 (basis points), and no intermediate exceeds the uint256 maximum, as the Aave libraries revert there.";
        return;
      }
      const hf = r.totalDebtBase === "0"
        ? "the uint256 maximum — the account has no debt, so there is no health factor to cross (front ends display this as ∞)"
        : `${r.healthFactor} (scaled by 1e18)`;
      el.textContent = `getUserAccountData: total collateral ${r.totalCollateralBase} base units · total debt ${r.totalDebtBase} · available borrows ${r.availableBorrowsBase} base units · average LTV ${r.ltv} bps · average liquidation threshold ${r.currentLiquidationThreshold} bps · health factor ${hf}. ${r.liquidatable === "true" ? "The health factor is below 1, so the account can be liquidated." : "The account is not liquidatable at these totals."} Computed locally with Aave V3's GenericLogic / PercentageMath / WadRayMath formulas on the totals you gave — a real account's totals and weighted averages are chain state this page does not read, and the per-reserve walk and eMode categories are not modelled. Not financial advice.`;
    });

    /* Aave V3 interest accrual */
    const aaveintBtn = document.getElementById("aaveint-btn");
    if (aaveintBtn) aaveintBtn.addEventListener("click", () => {
      const r = aaveInterestCalc(
        document.getElementById("aaveint-rate").value,
        document.getElementById("aaveint-elapsed").value,
        document.getElementById("aaveint-index").value);
      const el = document.getElementById("aaveint-out");
      if (r === null) {
        el.textContent = "Check the inputs: the rate and the current index are whole numbers in ray (up to 78 digits) and the elapsed time is a whole number of seconds, and no intermediate exceeds the uint256 maximum, as MathUtils and WadRayMath revert there — including rayMul(rate, rate) inside the compounded factor, which is computed even for a one-second accrual, and the checked exp × (exp − 1) × basePowerTwo product, which a very long elapsed time overflows.";
        return;
      }
      el.textContent = `MathUtils accrual: linear factor ${r.linearFactor} · compounded factor ${r.compoundedFactor} (both in ray) — applied to the index you gave, the liquidity index becomes ${r.newLiquidityIndex} and the variable borrow index becomes ${r.newVariableBorrowIndex}. ${r.compoundedFactor === r.linearFactor ? "The two factors are equal here — over no time, over one second, or at a zero rate there is nothing for the compounding terms to add." : "The compounded factor is the larger here: its binomial terms add interest on interest — and still slightly understate true compounding, by the approximation's design."} Computed locally with Aave V3's MathUtils / WadRayMath formulas on the values you gave — a real reserve's rates, last-update timestamp and stored index are chain state this page does not read. Not financial advice.`;
    });

    /* Aave V3 liquidation */
    const aaveliqBtn = document.getElementById("aaveliq-btn");
    if (aaveliqBtn) aaveliqBtn.addEventListener("click", () => {
      const r = aaveLiquidationCalc(
        document.getElementById("aaveliq-hf").value,
        document.getElementById("aaveliq-debt").value,
        document.getElementById("aaveliq-cover").value,
        document.getElementById("aaveliq-balance").value,
        document.getElementById("aaveliq-collateral-price").value,
        document.getElementById("aaveliq-debt-price").value,
        document.getElementById("aaveliq-collateral-decimals").value,
        document.getElementById("aaveliq-debt-decimals").value,
        document.getElementById("aaveliq-bonus").value,
        document.getElementById("aaveliq-fee").value);
      const el = document.getElementById("aaveliq-out");
      if (r === null) {
        el.textContent = "Check the inputs: every value is a whole number (the health factor at 10^18 scale, prices in the oracle's base currency, percentages in basis points), the liquidation bonus is at least 10000 and the protocol fee percentage at most 10000, neither price is zero, the decimals are at most 77, and no intermediate exceeds the uint256 maximum, as LiquidationLogic's checked products and PercentageMath's percentMul / percentDiv revert there.";
        return;
      }
      if (r.liquidatable === "false") {
        el.textContent = "Not liquidatable: the health factor you gave is not below 1000000000000000000 (1.0), so ValidationLogic would revert a liquidation call against this account and no debt can be covered and no collateral seized — every amount is zero, whatever the other values are. Computed locally with Aave V3's LiquidationLogic formulas on the values you gave — a real account's health factor, balances, prices and reserve configuration are chain state this page does not read. Not financial advice.";
        return;
      }
      el.textContent = `Liquidation: close factor ${r.closeFactor} basis points caps the cover at ${r.maxLiquidatableDebt} of debt (debt-asset base units); this call covers ${r.debtCovered} and seizes ${r.collateralSeized} of collateral (collateral-asset base units)${r.cappedByCollateral === "true" ? " — the whole collateral balance, which is less than the bonus-priced amount, so the debt covered was recomputed backward from the balance and is below the close-factor cap" : ""}. ${r.protocolFee === "0" ? "The liquidation protocol fee is zero here, so the liquidator receives the full seized amount" : `The protocol takes ${r.protocolFee} of the bonus part as its liquidation fee, so the liquidator receives ${r.collateralToLiquidator}`}. Computed locally with Aave V3's LiquidationLogic / PercentageMath formulas on the values you gave — a real account's health factor, balances, prices and reserve configuration are chain state this page does not read. Not financial advice.`;
    });

    /* ModExp precompile gas */
    const mxgBtn = document.getElementById("mxg-btn");
    if (mxgBtn) mxgBtn.addEventListener("click", () => {
      const r = modexpGas(
        document.getElementById("mxg-base-len").value,
        document.getElementById("mxg-exp-len").value,
        document.getElementById("mxg-mod-len").value,
        document.getElementById("mxg-exp-head").value);
      const el = document.getElementById("mxg-out");
      if (r === null) {
        el.textContent = "Check the inputs: the three lengths are whole numbers of bytes, and the exponent head is hex of exactly the first min(exponent length, 32) bytes of the exponent — the whole exponent when it is at most 32 bytes, and 0x alone when its length is 0.";
        return;
      }
      el.textContent = r.capped7823
        ? `ModExp gas — under EIP-2565 (Berlin–Pectra): ${r.gas2565} gas (multiplication complexity ${r.complexity2565}, iteration count ${r.iteration2565}). Under the Fusaka schedule (EIP-7883 with EIP-7823, the current mainnet schedule): no gas price — at least one of the three lengths exceeds EIP-7823's cap of 1,024 bytes per length, so the precompile stops, returns an error and consumes all gas forwarded to it. The old schedule had no such cap, which is why its price is still shown. Computed locally from the lengths and exponent head you gave — which schedule applies is the chain's fork state, and no chain is queried.`
        : `ModExp gas — under EIP-2565 (Berlin–Pectra): ${r.gas2565} gas (multiplication complexity ${r.complexity2565}, iteration count ${r.iteration2565}). Under EIP-7883 (Fusaka, the current mainnet schedule): ${r.gas7883} gas (complexity ${r.complexity7883}, iteration count ${r.iteration7883}). Every length is within EIP-7823's Fusaka cap of 1,024 bytes per length. Computed locally from the lengths and exponent head you gave — which schedule applies is the chain's fork state, and no chain is queried.`;
    });

    /* MODEXP precompile calculator */
    const mxcBtn = document.getElementById("mxc-btn");
    if (mxcBtn) mxcBtn.addEventListener("click", () => {
      const r = modexpCalc(
        document.getElementById("mxc-base").value,
        document.getElementById("mxc-exp").value,
        document.getElementById("mxc-mod").value);
      const el = document.getElementById("mxc-out");
      if (r === null) {
        el.textContent = "Check the inputs: the base, exponent and modulus are each hex byte strings (0x prefix optional, an even number of hex digits, at most 1,024 bytes each — the bound EIP-7823 sets; 0x alone is a zero-length operand).";
        return;
      }
      const gasText = `Gas: ${r.gas2565} under EIP-2565 (Berlin–Pectra), ${r.gas7883} under EIP-7883 (Fusaka, the current mainnet schedule) — the gas tool above, fed these operands' lengths (${r.baseLen} / ${r.expLen} / ${r.modLen} bytes) and the exponent's head; every operand this tool accepts is within EIP-7823's cap, so both prices always exist.`;
      el.textContent = `MODEXP result: ${r.result} — decimal ${r.resultDecimal}, returned as exactly ${r.modLen} byte(s), the modulus operand's width, left-padded with zeros as the precompile returns it. ${gasText} Computed locally from the operands you gave — no call is made and no chain is queried. The same precompile runs on Ethereum, Base, Unichain and Robinhood Chain.`;
    });

    /* SSTORE gas */
    const sstBtn = document.getElementById("sst-btn");
    if (sstBtn) sstBtn.addEventListener("click", () => {
      const r = sstoreGas(
        document.getElementById("sst-original").value,
        document.getElementById("sst-current").value,
        document.getElementById("sst-new").value,
        document.getElementById("sst-access").value === "cold");
      const el = document.getElementById("sst-out");
      if (r === null) {
        el.textContent = "Check the inputs: the original, current and new values are each a uint256 word — a whole number in decimal or 0x hex, at most 2^256 − 1.";
        return;
      }
      const branchText = {
        "no-op": "a no-op — the new value equals the current value, so only the warm read cost is charged",
        "clean-set": "a clean set — the slot is untouched in this transaction and rises from zero",
        "clean-clear": "a clean clear — the slot is untouched in this transaction and is cleared to zero",
        "clean-reset": "a clean reset — the slot is untouched in this transaction and changes between non-zero values",
        "dirty": "a dirty write — the slot was already changed earlier in this transaction, so only the warm cost is charged and the refund counter absorbs the difference"
      }[r.branch];
      const refundText = r.refundDelta === "0"
        ? "the refund counter does not change"
        : `the refund counter ${r.refundDelta.startsWith("-") ? "falls" : "rises"} by ${r.refundDelta.replace("-", "")}`;
      el.textContent = `SSTORE gas: ${r.gas} — ${branchText}, and ${refundText}. Computed locally with the net-metering branch table on the values you gave — a real write's values are chain and transaction state this page does not read, and the transaction-level refund cap (a fifth of gas used) is applied at the end of a transaction, not to this one write.`;
    });

    /* Memory expansion gas */
    const memBtn = document.getElementById("mem-btn");
    if (memBtn) memBtn.addEventListener("click", () => {
      const r = memoryGas(
        document.getElementById("mem-current").value,
        document.getElementById("mem-new").value);
      const el = document.getElementById("mem-out");
      if (r === null) {
        el.textContent = "Check the inputs: both sizes are whole numbers of bytes, at most 137,438,953,440 (0x1FFFFFFFE0) — the largest size whose gas the client can compute without overflowing.";
        return;
      }
      el.textContent = r.expansionGas === "0"
        ? `No expansion charge: memory already holds ${r.currentWords} word(s) (${r.currentBytes} bytes requested) and the new size needs ${r.newWords} word(s), so nothing grows. Computed locally — this is the expansion charge only, not any operation's own cost.`
        : `Memory expansion gas: ${r.expansionGas} — memory grows from ${r.currentWords} word(s) (total cost ${r.totalBefore}) to ${r.newWords} word(s) (total cost ${r.totalAfter}), and only the difference is charged. Computed locally — this is the expansion charge only; the operation that touches the memory charges its own static and per-word costs on top.`;
    });

    /* CALL gas */
    const callBtn = document.getElementById("call-btn");
    if (callBtn) callBtn.addEventListener("click", () => {
      const r = callGasCalc(
        document.getElementById("call-available").value,
        document.getElementById("call-requested").value,
        document.getElementById("call-value").value,
        document.getElementById("call-access").value === "cold",
        document.getElementById("call-target").value === "empty",
        document.getElementById("call-mem").value,
        document.getElementById("call-in-off").value,
        document.getElementById("call-in-size").value,
        document.getElementById("call-out-off").value,
        document.getElementById("call-out-size").value);
      const el = document.getElementById("call-out");
      if (r === null) {
        el.textContent = "Check the inputs: available and requested gas are whole numbers below 2^256, the value is a uint256 word in wei (decimal or 0x hex), and the memory sizes and offsets are whole numbers of bytes at most 137,438,953,440 with no region reaching past that bound.";
        return;
      }
      if (r.outOfGas) {
        el.textContent = `Out of gas before the call begins: the call's own cost is ${r.baseGas} gas (access ${r.accessGas} + value transfer ${r.transferGas} + new account ${r.newAccountGas} + memory expansion ${r.memoryGas}), which is more than the gas available — the CALL fails and nothing is forwarded. Computed locally — no call is made and no chain is queried.`;
        return;
      }
      el.textContent = `CALL gas: the call's own cost is ${r.baseGas} (access ${r.accessGas} + value transfer ${r.transferGas} + new account ${r.newAccountGas} + memory expansion ${r.memoryGas}), leaving ${r.remaining}; at most ${r.capGas} of that can be forwarded (the all-but-one-64th cap), so the callee receives ${r.calleeGas} — ${r.forwardedGas} forwarded${r.stipend === "0" ? "" : ` plus the ${r.stipend} value stipend, which is not deducted from the caller`} — and the caller keeps ${r.callerRetained} for itself at the moment of the call (gas the callee does not use returns afterwards). Computed locally from the values you gave — a real call's warmth, target and memory are execution state this page does not read; no call is made and no chain is queried.`;
    });

    /* CREATE / CREATE2 gas */
    const createGasBtn = document.getElementById("crg-btn");
    if (createGasBtn) createGasBtn.addEventListener("click", () => {
      const r = createGasCalc(
        document.getElementById("crg-available").value,
        document.getElementById("crg-opcode").value,
        document.getElementById("crg-init-size").value,
        document.getElementById("crg-init-off").value,
        document.getElementById("crg-mem").value,
        document.getElementById("crg-deployed").value);
      const el = document.getElementById("crg-out");
      if (r === null) {
        el.textContent = "Check the inputs: the gas available is a whole number below 2^256, and the initcode size and offset, current memory size and deployed code size are whole numbers of bytes at most 137,438,953,440 with the initcode region not reaching past that bound.";
        return;
      }
      const opName = document.getElementById("crg-opcode").value === "create2" ? "CREATE2" : "CREATE";
      if (r.initcodeTooLarge) {
        el.textContent = `Creation fails before it starts: the initcode is over EIP-3860's 49,152-byte maximum, which the client's gas calculation itself refuses — nothing is charged and no gas is forwarded. Computed locally — no creation is made and no chain is queried.`;
        return;
      }
      if (r.outOfGas) {
        el.textContent = `Out of gas before the initcode runs: the ${opName} upfront cost is ${r.upfrontGas} gas (32,000 for the operation + ${r.wordGas} of initcode word charges + ${r.memoryGas} of memory expansion), which is more than the gas available — the creation fails and nothing is forwarded. Computed locally — no creation is made and no chain is queried.`;
        return;
      }
      const depositText = r.codeTooLarge
        ? `the initcode would return more than EIP-170's 24,576-byte maximum code size, so the creation fails at the deposit step and no deposit is charged`
        : `storing the returned code then costs a ${r.depositGas} code deposit (200 per byte), charged from the gas remaining when the initcode finishes — the fixed charges come to ${r.fixedGas} in all, before the initcode's own execution`;
      el.textContent = `${opName} gas: the upfront cost is ${r.upfrontGas} (32,000 for the operation + ${r.wordGas} of initcode word charges over ${r.initcodeWords} word(s) + ${r.memoryGas} of memory expansion), leaving ${r.remaining}; the initcode receives ${r.forwardedGas} of that (the all-but-one-64th rule) and the creator keeps ${r.creatorRetained} at the moment of creation (gas the initcode does not use returns afterwards); ${depositText}. Computed locally from the values you gave — the initcode's own execution is not modelled, and sizes and memory are values you supply, not execution state this page reads; no creation is made and no chain is queried.`;
    });

    /* LOG0-LOG4 gas */
    const logBtn = document.getElementById("log-btn");
    if (logBtn) logBtn.addEventListener("click", () => {
      const r = logGasCalc(
        document.getElementById("log-topics").value,
        document.getElementById("log-off").value,
        document.getElementById("log-size").value,
        document.getElementById("log-mem").value);
      const el = document.getElementById("log-out");
      if (r === null) {
        el.textContent = "Check the inputs: the topic count is a whole number from 0 to 4, and the data offset, data size and current memory size are whole numbers of bytes at most 137,438,953,440 with the data region not reaching past that bound.";
        return;
      }
      el.textContent = `LOG${r.topics} gas: ${r.totalGas} — 375 for the operation + ${r.topicGas} for its ${r.topics} topic(s) + ${r.dataGas} for the data bytes + ${r.memoryGas} of memory expansion. Computed locally from the values you gave — the topic values and data contents are not read and move no term; no log is emitted and no chain is queried.`;
    });

    /* SHA3 gas */
    const sha3Btn = document.getElementById("sha3-btn");
    if (sha3Btn) sha3Btn.addEventListener("click", () => {
      const r = sha3GasCalc(
        document.getElementById("sha3-off").value,
        document.getElementById("sha3-size").value,
        document.getElementById("sha3-mem").value);
      const el = document.getElementById("sha3-out");
      if (r === null) {
        el.textContent = "Check the inputs: the data offset, data size and current memory size are whole numbers of bytes at most 137,438,953,440 with the hashed region not reaching past that bound.";
        return;
      }
      el.textContent = `SHA3 gas: ${r.totalGas} — 30 for the operation + ${r.wordGas} for its ${r.words} word(s) + ${r.memoryGas} of memory expansion. Computed locally from the values you gave — the data contents are not read and move no term; no hash is computed here and no chain is queried.`;
    });

    /* CALLDATACOPY / CODECOPY / RETURNDATACOPY gas */
    const copyBtn = document.getElementById("copy-btn");
    if (copyBtn) copyBtn.addEventListener("click", () => {
      const r = copyGasCalc(
        document.getElementById("copy-op").value,
        document.getElementById("copy-dest").value,
        document.getElementById("copy-size").value,
        document.getElementById("copy-mem").value);
      const el = document.getElementById("copy-out");
      if (r === null) {
        el.textContent = "Check the inputs: the destination offset, copy size and current memory size are whole numbers of bytes at most 137,438,953,440 with the destination region not reaching past that bound.";
        return;
      }
      el.textContent = `${r.opcode} gas: ${r.totalGas} — 3 for the operation + ${r.wordGas} for its ${r.words} word(s) + ${r.memoryGas} of memory expansion. Computed locally from the values you gave — the source offset and the data contents are not read and move no term; nothing is copied and no chain is queried.`;
    });

    /* MCOPY gas (EIP-5656) */
    const mcopyBtn = document.getElementById("mcopy-btn");
    if (mcopyBtn) mcopyBtn.addEventListener("click", () => {
      const r = mcopyGasCalc(
        document.getElementById("mcopy-dst").value,
        document.getElementById("mcopy-src").value,
        document.getElementById("mcopy-size").value,
        document.getElementById("mcopy-mem").value);
      const el = document.getElementById("mcopy-out");
      if (r === null) {
        el.textContent = "Check the inputs: the destination offset, source offset, copy size and current memory size are whole numbers of bytes at most 137,438,953,440 with neither region reaching past that bound.";
        return;
      }
      el.textContent = `MCOPY gas: ${r.totalGas} — 3 for the operation + ${r.wordGas} for its ${r.words} word(s) + ${r.memoryGas} of memory expansion. Computed locally from the values you gave — expansion is priced on the larger of the source and destination ends because both regions are memory; the data contents are not read and move no term; nothing is copied and no chain is queried.`;
    });

    /* EXTCODECOPY gas */
    const extCopyBtn = document.getElementById("ext-copy-btn");
    if (extCopyBtn) extCopyBtn.addEventListener("click", () => {
      const r = extCodeCopyGasCalc(
        document.getElementById("ext-copy-access").value === "cold",
        document.getElementById("ext-copy-dest").value,
        document.getElementById("ext-copy-size").value,
        document.getElementById("ext-copy-mem").value);
      const el = document.getElementById("ext-copy-out");
      if (r === null) {
        el.textContent = "Check the inputs: the destination offset, copy size and current memory size are whole numbers of bytes at most 137,438,953,440 with the destination region not reaching past that bound.";
        return;
      }
      el.textContent = `EXTCODECOPY gas: ${r.totalGas} — ${r.accessGas} for accessing the target account + ${r.wordGas} for its ${r.words} word(s) + ${r.memoryGas} of memory expansion. Computed locally from the values you gave — the source offset in the target's code and the code contents are not read and move no term; nothing is copied and no chain is queried.`;
    });

    /* BALANCE / EXTCODESIZE / EXTCODEHASH account-access gas */
    const acctBtn = document.getElementById("acct-btn");
    if (acctBtn) acctBtn.addEventListener("click", () => {
      const r = accountAccessGasCalc(
        document.getElementById("acct-op").value,
        document.getElementById("acct-access").value === "cold");
      const el = document.getElementById("acct-out");
      if (r === null) {
        el.textContent = "Check the inputs: choose one of BALANCE, EXTCODESIZE or EXTCODEHASH and whether the target address is cold or warm in this transaction.";
        return;
      }
      el.textContent = `${r.opcode} gas: ${r.totalGas} — the whole cost is the ${r.accessGas} account-access charge; the value returned is a stack word, so no memory expansion or other term applies. Computed locally from the warmth you gave — the account's balance, code and code hash are not read and move no term; no chain is queried.`;
    });

    /* SLOAD gas */
    const sloadBtn = document.getElementById("sload-btn");
    if (sloadBtn) sloadBtn.addEventListener("click", () => {
      const r = sloadGasCalc(
        document.getElementById("sload-access").value === "cold");
      const el = document.getElementById("sload-out");
      if (r === null) {
        el.textContent = "Check the input: choose whether the (contract, slot) pair is cold or warm in this transaction.";
        return;
      }
      el.textContent = `SLOAD gas: ${r.totalGas} — the whole cost is the ${r.accessGas} slot-access charge; the value read is a stack word, so no memory expansion or other term applies. Computed locally from the warmth you gave — the slot's value is not read and moves no term; no chain is queried.`;
    });

    /* TLOAD / TSTORE transient storage gas */
    const transBtn = document.getElementById("trans-btn");
    if (transBtn) transBtn.addEventListener("click", () => {
      const r = transientGasCalc(
        document.getElementById("trans-op").value);
      const el = document.getElementById("trans-out");
      if (r === null) {
        el.textContent = "Check the input: choose TLOAD or TSTORE.";
        return;
      }
      el.textContent = `${r.opcode} gas: ${r.totalGas} — a flat charge with no cold price and no other term; the value moved is a stack word, so no memory expansion applies, and no refund is ever earned. Computed locally — transient storage is not read or written and no chain is queried.`;
    });

    /* CALLCODE / DELEGATECALL / STATICCALL gas */
    const ocallBtn = document.getElementById("ocall-btn");
    if (ocallBtn) ocallBtn.addEventListener("click", () => {
      const r = otherCallGasCalc(
        document.getElementById("ocall-op").value,
        document.getElementById("ocall-available").value,
        document.getElementById("ocall-requested").value,
        document.getElementById("ocall-value").value,
        document.getElementById("ocall-access").value === "cold",
        document.getElementById("ocall-mem").value,
        document.getElementById("ocall-in-off").value,
        document.getElementById("ocall-in-size").value,
        document.getElementById("ocall-out-off").value,
        document.getElementById("ocall-out-size").value);
      const el = document.getElementById("ocall-out");
      if (r === null) {
        el.textContent = "Check the inputs: gas and memory values are non-negative decimal integers, and the value (CALLCODE only) is a wei amount in decimal or 0x hex.";
        return;
      }
      if (r.outOfGas) {
        el.textContent = `${r.opcode} runs out of gas: its own cost is ${r.baseGas} (access ${r.accessGas} + value transfer ${r.transferGas} + new account ${r.newAccountGas} + memory expansion ${r.memoryGas}), more than the available gas — nothing is forwarded. Computed locally — no call is made and no chain is queried.`;
        return;
      }
      el.textContent = `${r.opcode} gas: own cost ${r.baseGas} (access ${r.accessGas} + value transfer ${r.transferGas} + new account ${r.newAccountGas} + memory expansion ${r.memoryGas}); of the ${r.remaining} remaining, at most ${r.capGas} can be forwarded under the all-but-one-64th rule, so ${r.forwardedGas} is forwarded and the callee receives ${r.calleeGas} (forwarded + ${r.stipend} stipend); the caller retains ${r.callerRetained} at the moment of the call. The new-account charge is always 0 for these opcodes. Computed locally from the values you gave — no call is made and no chain is queried.`;
    });

    /* SELFDESTRUCT gas */
    const sdBtn = document.getElementById("sd-btn");
    if (sdBtn) sdBtn.addEventListener("click", () => {
      const r = selfdestructGasCalc(
        document.getElementById("sd-access").value === "cold",
        document.getElementById("sd-beneficiary").value === "empty",
        document.getElementById("sd-balance").value);
      const el = document.getElementById("sd-out");
      if (r === null) {
        el.textContent = "Check the inputs: the balance is the contract's whole balance in wei, a non-negative amount in decimal or 0x hex (only zero vs non-zero changes the price).";
        return;
      }
      el.textContent = `SELFDESTRUCT gas: ${r.totalGas} total — ${r.baseGas} for the opcode itself + ${r.accessGas} beneficiary access + ${r.newAccountGas} new-account charge; refund ${r.refund} (the old 24,000 refund was removed by EIP-3529). Under EIP-6780 the code and storage are deleted only if the contract was created in this same transaction; otherwise only the balance moves. Computed locally from the values you gave — nothing is destroyed and no chain is queried.`;
    });

    /* Original precompile gas */
    const pcBtn = document.getElementById("pc-btn");
    if (pcBtn) pcBtn.addEventListener("click", () => {
      const r = precompileGasCalc(
        document.getElementById("pc-name").value,
        document.getElementById("pc-len").value);
      const el = document.getElementById("pc-out");
      if (r === null) {
        el.textContent = "Check the inputs: the input length is a byte count in decimal (0 or more).";
        return;
      }
      el.textContent = `${r.precompile} precompile (${r.address}) gas: ${r.totalGas} total — ${r.baseGas} base + ${r.wordGas} for ${r.words} word(s) of input at ${r.perWordGas} per word. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* Original precompiles applied (SHA-256 / RIPEMD-160 / identity) */
    const opcBtn = document.getElementById("opc-btn");
    if (opcBtn) opcBtn.addEventListener("click", () => {
      const r = origPrecompileCalc(
        document.getElementById("opc-name").value,
        document.getElementById("opc-input").value);
      const el = document.getElementById("opc-out");
      if (r === null) {
        el.textContent = "Check the inputs: the precompile is SHA-256, RIPEMD-160 or identity, and the input is hex bytes (0x prefix optional, empty allowed) of at most 4,096 bytes — this page's stated computation cap; the gas calculator above prices longer inputs.";
        return;
      }
      el.textContent = `${r.precompile} precompile (${r.address}) result: ${r.output} — ${r.outputBytes} bytes of output from ${r.inputBytes} bytes of input${r.precompile === "ripemd160" ? " (the 20-byte RIPEMD-160 digest in the low 20 bytes of a 32-byte word: 12 leading zero bytes, then the hash)" : r.precompile === "identity" ? " (the input copied unchanged)" : " (the 32-byte SHA-256 digest)"}. Gas: ${r.totalGas} total — ${r.baseGas} base + ${r.wordGas} for ${r.words} word(s) at ${r.perWordGas} per word, from the gas calculator above. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* alt_bn128 precompile gas */
    const bnBtn = document.getElementById("bn-btn");
    if (bnBtn) bnBtn.addEventListener("click", () => {
      const r = bn128GasCalc(
        document.getElementById("bn-name").value,
        document.getElementById("bn-pairs").value);
      const el = document.getElementById("bn-out");
      if (r === null) {
        el.textContent = "Check the inputs: the pair count is a count in decimal (0 or more), used only by the pairing check.";
        return;
      }
      el.textContent = r.precompile === "pairing"
        ? `pairing precompile (${r.address}) gas: ${r.totalGas} total — ${r.baseGas} base + ${r.pairGas} for ${r.pairs} pair(s) at ${r.perPairGas} per pair (a pair is 192 bytes of input, so this check reads ${r.inputBytes} bytes). This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`
        : `${r.precompile} precompile (${r.address}) gas: ${r.totalGas} total — a flat charge at any input: the defined input is ${r.inputBytes} bytes, read as zero-padded if short, and the pair count is never read. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* alt_bn128 point arithmetic (ecAdd / ecMul applied) */
    const bncBtn = document.getElementById("bnc-btn");
    if (bncBtn) bncBtn.addEventListener("click", () => {
      const op = document.getElementById("bnc-op").value;
      const r = bn128Calc(
        op,
        document.getElementById("bnc-x1").value,
        document.getElementById("bnc-y1").value,
        op === "ecadd" ? document.getElementById("bnc-x2").value : document.getElementById("bnc-k").value,
        document.getElementById("bnc-y2").value);
      const el = document.getElementById("bnc-out");
      if (r === null) {
        el.textContent = "Check the inputs: the operation is ecAdd or ecMul, and each field it reads — the first point's x and y, plus the second point's x and y for ecAdd or the scalar for ecMul — is exactly 32 bytes of hex (with a 0x prefix).";
        return;
      }
      el.textContent = r.succeeded === "true"
        ? `${r.precompile} precompile (${r.address}) result: ${r.output} — the resulting point as ${r.outputBytes} bytes (x then y, each a 32-byte word; all zeros is the point at infinity). Gas: ${r.totalGas} — the flat scheduled charge from the gas calculator above. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`
        : `${r.precompile} precompile (${r.address}): the call FAILS — a coordinate at or above the field prime, or a point that is not on the curve y² = x³ + 3: no output, and a failing precompile call consumes all the gas supplied to it, so the caller's cost is whatever it forwarded (the scheduled charge is ${r.totalGas}). Unlike P256VERIFY below, this precompile does not return empty and carry on — the call itself fails. Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* alt_bn128 pairing check (applied) */
    const bnpBtn = document.getElementById("bnp-btn");
    if (bnpBtn) bnpBtn.addEventListener("click", () => {
      const r = bn128PairingCalc(
        document.getElementById("bnp-input").value);
      const el = document.getElementById("bnp-out");
      if (r === null) {
        el.textContent = "Check the input: the pairing input is hex bytes whose length is a multiple of 192 (one G1 point and one G2 point per pair), at most 16 pairs on this page — the gas calculator above prices any count.";
        return;
      }
      el.textContent = r.succeeded === "true"
        ? `pairing precompile (${r.address}) result: ${r.output} — the 32-byte word holding ${r.output.endsWith("1") ? "1: the product of the pairings is the identity, so the check passes" : "0: the product of the pairings is not the identity, so the check does not pass"}, over ${r.pairs} pair(s). Gas: ${r.totalGas} — 45,000 base + 34,000 per pair, from the gas calculator above. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`
        : `pairing precompile (${r.address}): the call FAILS — a G1 point off the curve or with a coordinate at or above the field prime, or a G2 point off the twist, outside the prime-order subgroup, or with a component at or above the field prime, in one of the ${r.pairs} pair(s): no output, and a failing precompile call consumes all the gas supplied to it, so the caller's cost is whatever it forwarded (the scheduled charge is ${r.totalGas}). Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* BLAKE2f precompile gas */
    const b2Btn = document.getElementById("b2-btn");
    if (b2Btn) b2Btn.addEventListener("click", () => {
      const r = blake2fGasCalc(
        document.getElementById("b2-rounds").value);
      const el = document.getElementById("b2-out");
      if (r === null) {
        el.textContent = "Check the inputs: the rounds count is a decimal count from 0 to 4294967295 (the uint32 in the input's first 4 bytes).";
        return;
      }
      el.textContent = `BLAKE2f precompile (${r.address}) gas: ${r.totalGas} total — ${r.rounds} round(s) at ${r.perRoundGas} gas per round, over its fixed ${r.inputBytes}-byte input. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* BLAKE2f precompile calculator */
    const b2cBtn = document.getElementById("b2c-btn");
    if (b2cBtn) b2cBtn.addEventListener("click", () => {
      const r = blake2fCalc(
        document.getElementById("b2c-rounds").value,
        document.getElementById("b2c-h").value,
        document.getElementById("b2c-m").value,
        document.getElementById("b2c-t").value,
        document.getElementById("b2c-f").value);
      const el = document.getElementById("b2c-out");
      if (r === null) {
        el.textContent = "Check the inputs: the rounds count is a whole number from 0 to 100,000 (this tool's computation cap — the precompile itself accepts any uint32), the state is exactly 64 bytes of hex, the message block exactly 128 bytes, the counters exactly 16 bytes, and the final-block flag is 0 or 1.";
        return;
      }
      el.textContent = `BLAKE2f result: ${r.output} — the updated 64-byte state, each word little-endian as the precompile returns it, after ${r.rounds} round(s) with the final-block flag ${r.finalBlock}. Gas: ${r.totalGas} — the gas tool above, fed this rounds count (1 gas per round). Computed locally from the values you gave — no call is made and no chain is queried. The same precompile runs on Ethereum, Base, Unichain and Robinhood Chain.`;
    });

    /* KZG point evaluation precompile gas */
    const kzgBtn = document.getElementById("kzg-btn");
    if (kzgBtn) kzgBtn.addEventListener("click", () => {
      const r = kzgGasCalc(
        document.getElementById("kzg-len").value);
      const el = document.getElementById("kzg-out");
      if (r === null) {
        el.textContent = "Check the inputs: the input length is a decimal byte count, and the precompile accepts exactly 192 bytes — any other length fails its length check, so no gas price exists for it.";
        return;
      }
      el.textContent = `KZG point evaluation precompile (${r.address}) gas: ${r.totalGas} total — a flat charge for verifying one point evaluation over its fixed ${r.inputBytes}-byte input, returning ${r.outputBytes} bytes (${r.fieldElementsPerBlob} field elements per blob and the BLS modulus). This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* KZG point evaluation precompile (applied) */
    const kzgeBtn = document.getElementById("kzge-btn");
    if (kzgeBtn) kzgeBtn.addEventListener("click", () => {
      const r = kzgPointEvalCalc(
        document.getElementById("kzge-input").value);
      const el = document.getElementById("kzge-out");
      if (r === null) {
        el.textContent = "Check the input: the point evaluation input is hex bytes of exactly 192 bytes — the 32-byte versioned hash, then z and y as 32-byte field elements, then the 48-byte commitment and the 48-byte proof.";
        return;
      }
      el.textContent = r.succeeded === "true"
        ? `KZG point evaluation precompile (${r.address}) result: ${r.output} — the 64-byte return, 4096 (the field elements per blob) and the BLS modulus as two 32-byte words: the commitment does evaluate to the claimed y at the claimed z. Gas: ${r.totalGas} — the flat charge from the gas calculator above. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`
        : `KZG point evaluation precompile (${r.address}): the call FAILS — the versioned hash does not match the commitment, z or y is not a canonical field element (not strictly below the BLS modulus), a commitment or proof encoding is invalid or a point lies outside the prime-order subgroup, or the proof does not verify: no output, and a failing precompile call burns all the gas supplied to it, so the caller's cost is whatever it forwarded (the scheduled charge is ${r.totalGas}). Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* BLS12-381 precompile gas */
    const blsBtn = document.getElementById("bls-btn");
    if (blsBtn) blsBtn.addEventListener("click", () => {
      const name = document.getElementById("bls-name").value;
      const r = blsGasCalc(name,
        document.getElementById("bls-pairs").value);
      const el = document.getElementById("bls-out");
      if (r === null) {
        el.textContent = "Check the inputs: for the MSM and pairing operations the count is a decimal count of at least 1 (an empty input errors, so it has no price), bounded so the implied input fits the size bound the memory tools use.";
        return;
      }
      if (r.discount !== "0") {
        el.textContent = `BLS12-381 precompile ${r.precompile} (${r.address}) gas: ${r.totalGas} total — ${r.pairs} pair(s) at a ${r.perPairGas} single-multiplication cost with the EIP-2537 MSM discount of ${r.discount}/1000 applied (floor of pairs × cost × discount / 1000), over ${r.inputBytes} bytes of input. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`;
        return;
      }
      if (r.perPairGas !== "0") {
        el.textContent = `BLS12-381 precompile ${r.precompile} (${r.address}) gas: ${r.totalGas} total — ${r.baseGas} base + ${r.perPairGas} per pair × ${r.pairs} pair(s), over ${r.inputBytes} bytes of input. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`;
        return;
      }
      el.textContent = `BLS12-381 precompile ${r.precompile} (${r.address}) gas: ${r.totalGas} total — a flat charge over its fixed ${r.inputBytes}-byte input. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* BLS12-381 G1 point arithmetic (G1ADD / one-pair G1MSM applied) */
    const blscBtn = document.getElementById("blsc-btn");
    if (blscBtn) blscBtn.addEventListener("click", () => {
      const op = document.getElementById("blsc-op").value;
      const r = blsG1Calc(
        op,
        document.getElementById("blsc-x1").value,
        document.getElementById("blsc-y1").value,
        op === "g1add" ? document.getElementById("blsc-x2").value : document.getElementById("blsc-k").value,
        document.getElementById("blsc-y2").value);
      const el = document.getElementById("blsc-out");
      if (r === null) {
        el.textContent = "Check the inputs: the operation is G1ADD or a one-pair G1MSM, and each field it reads — the first point's x and y, plus the second point's x and y for G1ADD or the scalar for the MSM — is exactly 48 bytes of hex for a coordinate (32 for the scalar), with a 0x prefix.";
        return;
      }
      el.textContent = r.succeeded === "true"
        ? `${r.precompile} precompile (${r.address}) result: ${r.output} — the resulting point in the EIP-2537 encoding, ${r.outputBytes} bytes (x then y, each a 64-byte field element whose top 16 bytes are zero; all zeros is the point at infinity). Gas: ${r.totalGas} — ${r.precompile === "g1add" ? "the flat G1ADD charge" : "the G1MSM price at k = 1 (discount 1000, so exactly the single-multiplication cost)"} from the gas calculator above. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`
        : `${r.precompile} precompile (${r.address}): the call FAILS — a coordinate at or above the field prime, a point that is not on the curve y² = x³ + 4${r.precompile === "g1msm" ? ", or a point outside the prime-order subgroup (the MSM checks it; G1ADD does not)" : ""}: no output, and a failing BLS precompile call burns all the gas supplied to it, so the caller's cost is whatever it forwarded (the scheduled charge is ${r.totalGas}). Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* BLS12-381 G2 point arithmetic (G2ADD / one-pair G2MSM applied) */
    const blsgBtn = document.getElementById("blsg-btn");
    if (blsgBtn) blsgBtn.addEventListener("click", () => {
      const op = document.getElementById("blsg-op").value;
      const r = blsG2Calc(
        op,
        document.getElementById("blsg-x1a").value,
        document.getElementById("blsg-x1b").value,
        document.getElementById("blsg-y1a").value,
        document.getElementById("blsg-y1b").value,
        op === "g2add" ? document.getElementById("blsg-x2a").value : document.getElementById("blsg-k").value,
        document.getElementById("blsg-x2b").value,
        document.getElementById("blsg-y2a").value,
        document.getElementById("blsg-y2b").value);
      const el = document.getElementById("blsg-out");
      if (r === null) {
        el.textContent = "Check the inputs: the operation is G2ADD or a one-pair G2MSM, and each field it reads — the first point's four components, plus the second point's four components for G2ADD or the scalar for the MSM — is exactly 48 bytes of hex for a component (32 for the scalar), with a 0x prefix.";
        return;
      }
      el.textContent = r.succeeded === "true"
        ? `${r.precompile} precompile (${r.address}) result: ${r.output} — the resulting point in the EIP-2537 encoding, ${r.outputBytes} bytes (x.c0, x.c1, y.c0, y.c1, each a 64-byte field element whose top 16 bytes are zero; all zeros is the point at infinity). Gas: ${r.totalGas} — ${r.precompile === "g2add" ? "the flat G2ADD charge" : "the G2MSM price at k = 1 (discount 1000, so exactly the single-multiplication cost)"} from the gas calculator above. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`
        : `${r.precompile} precompile (${r.address}): the call FAILS — a component at or above the field prime, a point that is not on the twist y² = x³ + 4 + 4i${r.precompile === "g2msm" ? ", or a point outside the prime-order subgroup (the MSM checks it; G2ADD does not)" : ""}: no output, and a failing BLS precompile call burns all the gas supplied to it, so the caller's cost is whatever it forwarded (the scheduled charge is ${r.totalGas}). Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* BLS12-381 multi-pair MSM (G1MSM / G2MSM applied) */
    const blsmBtn = document.getElementById("blsm-btn");
    if (blsmBtn) blsmBtn.addEventListener("click", () => {
      const r = blsMsmCalc(
        document.getElementById("blsm-op").value,
        document.getElementById("blsm-input").value);
      const el = document.getElementById("blsm-out");
      if (r === null) {
        el.textContent = "Check the inputs: the operation is G1MSM or G2MSM, and the input is hex (0x prefix optional) whose length is a positive multiple of the pair size — 160 bytes per pair for G1MSM, 288 for G2MSM — at most 16 pairs, this page's stated computation cap; the gas calculator above prices any count.";
        return;
      }
      el.textContent = r.succeeded === "true"
        ? `${r.precompile} precompile (${r.address}) result: ${r.output} — the summed point in the EIP-2537 encoding, ${r.outputBytes} bytes over ${r.pairs} pair(s) (all zeros is the point at infinity). Gas: ${r.totalGas} — ${r.pairs} pair(s) at the single-multiplication cost with the EIP-2537 MSM discount of ${r.discount}/1000, from the gas calculator above. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`
        : `${r.precompile} precompile (${r.address}): the call FAILS — a field element at or above the field prime (nonzero top bytes included), a point that is not on the curve, or a point outside the prime-order subgroup, in ANY of the ${r.pairs} pair(s): no output, and a failing BLS precompile call burns all the gas supplied to it, so the caller's cost is whatever it forwarded (the scheduled charge is ${r.totalGas}). Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });


    /* BLS12-381 MAP_FP_TO_G1 (field-to-curve map applied) */
    const blsmapBtn = document.getElementById("blsmap-btn");
    if (blsmapBtn) blsmapBtn.addEventListener("click", () => {
      const r = blsMapG1Calc(
        document.getElementById("blsmap-input").value);
      const el = document.getElementById("blsmap-out");
      if (r === null) {
        el.textContent = "Check the inputs: the input is exactly 64 bytes of hex (with a 0x prefix) — one field element, its 48-byte value carried in a 64-byte element whose top 16 bytes must be zero for the call to succeed.";
        return;
      }
      el.textContent = r.succeeded === "true"
        ? `${r.precompile} precompile (${r.address}) result: ${r.output} — the mapped point in the EIP-2537 encoding, ${r.outputBytes} bytes (x and y, each a 64-byte field element whose top 16 bytes are zero; all zeros would be the point at infinity). Gas: ${r.totalGas} — the flat MAP_FP_TO_G1 charge from the gas calculator above. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the value you gave — nothing is called and no chain is queried.`
        : `${r.precompile} precompile (${r.address}): the call FAILS — the field element is at or above the field prime (nonzero top bytes included, since those make the value at least 2^384): no output, and a failing BLS precompile call burns all the gas supplied to it, so the caller's cost is whatever it forwarded (the scheduled charge is ${r.totalGas}). Computed locally from the value you gave — nothing is called and no chain is queried.`;
    });

    /* BLS12-381 MAP_FP2_TO_G2 (field-to-curve map applied) */
    const blsmap2Btn = document.getElementById("blsmap2-btn");
    if (blsmap2Btn) blsmap2Btn.addEventListener("click", () => {
      const r = blsMapG2Calc(
        document.getElementById("blsmap2-input").value);
      const el = document.getElementById("blsmap2-out");
      if (r === null) {
        el.textContent = "Check the inputs: the input is exactly 128 bytes of hex (with a 0x prefix) — one Fp2 element, two 64-byte field elements (c0 then c1) whose top 16 bytes must be zero for the call to succeed.";
        return;
      }
      el.textContent = r.succeeded === "true"
        ? `${r.precompile} precompile (${r.address}) result: ${r.output} — the mapped point in the EIP-2537 encoding, ${r.outputBytes} bytes (x.c0, x.c1, y.c0, y.c1, each a 64-byte field element whose top 16 bytes are zero; all zeros would be the point at infinity). Gas: ${r.totalGas} — the flat MAP_FP2_TO_G2 charge from the gas calculator above. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the value you gave — nothing is called and no chain is queried.`
        : `${r.precompile} precompile (${r.address}): the call FAILS — a component of the Fp2 element is at or above the field prime (nonzero top bytes included, since those make the component at least 2^384): no output, and a failing BLS precompile call burns all the gas supplied to it, so the caller's cost is whatever it forwarded (the scheduled charge is ${r.totalGas}). Computed locally from the value you gave — nothing is called and no chain is queried.`;
    });

    /* BLS12-381 pairing check (applied) */
    const blspBtn = document.getElementById("blsp-btn");
    if (blspBtn) blspBtn.addEventListener("click", () => {
      const r = blsPairingCalc(
        document.getElementById("blsp-input").value);
      const el = document.getElementById("blsp-out");
      if (r === null) {
        el.textContent = "Check the input: the pairing input is hex bytes whose length is a multiple of 384 (one G1 point and one G2 point per pair), at most 16 pairs on this page — the gas calculator above prices any count.";
        return;
      }
      el.textContent = r.succeeded === "true"
        ? `pairing precompile (${r.address}) result: ${r.output} — the 32-byte word holding ${r.output.endsWith("1") ? "1: the product of the pairings is the identity, so the check passes" : "0: the product of the pairings is not the identity, so the check does not pass"}, over ${r.pairs} pair(s). Gas: ${r.totalGas} — 37,700 base + 32,600 per pair, from the gas calculator above. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`
        : `pairing precompile (${r.address}): the call FAILS — ${r.pairs === "0" ? "the input is empty, which EIP-2537 makes an error (unlike the alt_bn128 pairing check above, whose empty product returns 1)" : `a G1 or G2 point off its curve, outside the prime-order subgroup, or with a field element at or above the field prime, in one of the ${r.pairs} pair(s)`}: no output, and a failing BLS precompile call burns all the gas supplied to it, so the caller's cost is whatever it forwarded (the scheduled charge is ${r.totalGas}). Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* secp256r1 (P256VERIFY) precompile gas */
    const p256Btn = document.getElementById("p256-btn");
    if (p256Btn) p256Btn.addEventListener("click", () => {
      const r = p256GasCalc(
        document.getElementById("p256-len").value);
      const el = document.getElementById("p256-out");
      if (r === null) {
        el.textContent = "Check the inputs: the input length is a decimal byte count (0 or more, within the size bound the memory tools use).";
        return;
      }
      el.textContent = r.exactLength === "yes"
        ? `P256VERIFY precompile (${r.address}) gas: ${r.totalGas} total — a flat charge for verifying one secp256r1 signature over its fixed ${r.inputBytes}-byte input, returning ${r.outputBytesOnSuccess} bytes holding 1 if the signature verifies and nothing if it does not. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`
        : `P256VERIFY precompile (${r.address}) gas: ${r.totalGas} total — the flat charge is taken at any input length, and this precompile never reverts: at ${r.inputBytes} bytes (not the exact ${r.requiredInputBytes}) it returns nothing and still burns the same ${r.totalGas}. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Computed locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* secp256r1 (P256VERIFY) precompile verification */
    const p256vBtn = document.getElementById("p256v-btn");
    if (p256vBtn) p256vBtn.addEventListener("click", () => {
      const r = p256VerifyCalc(
        document.getElementById("p256v-hash").value,
        document.getElementById("p256v-r").value,
        document.getElementById("p256v-s").value,
        document.getElementById("p256v-x").value,
        document.getElementById("p256v-y").value);
      const el = document.getElementById("p256v-out");
      if (r === null) {
        el.textContent = "Check the inputs: the message hash, r, s and the public key's x and y are each exactly 32 bytes of hex (with a 0x prefix).";
        return;
      }
      el.textContent = r.valid === "true"
        ? `P256VERIFY precompile (0x0000000000000000000000000000000000000100): the signature VERIFIES — the precompile returns ${r.output} (${r.outputBytes} bytes holding 1). Gas: ${r.totalGas} total — the flat charge, taken the same whether the signature verifies or not. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Verified locally from the values you gave — nothing is called and no chain is queried.`
        : `P256VERIFY precompile (0x0000000000000000000000000000000000000100): the signature does NOT verify — the precompile returns nothing (0 bytes) and never reverts: an r or s outside [1, n − 1], a public-key coordinate at or above the field prime, an off-curve public key, or a signature that simply does not verify all land here. Gas: ${r.totalGas} total — the flat charge is taken anyway, exactly as it is on success. This is the precompile's own charge only — the CALL or STATICCALL that invokes it charges its own terms separately, and the precompiles start warm, so no EIP-2929 cold term applies. Verified locally from the values you gave — nothing is called and no chain is queried.`;
    });

    /* CLZ opcode (count leading zeros, EIP-7939) */
    const clzBtn = document.getElementById("clz-btn");
    if (clzBtn) clzBtn.addEventListener("click", () => {
      const r = clzCalc(
        document.getElementById("clz-value").value);
      const el = document.getElementById("clz-out");
      if (r === null) {
        el.textContent = "Check the input: enter one 256-bit word as a decimal integer or 0x hex (0 up to 2^256 − 1).";
        return;
      }
      el.textContent = r.highestSetBit === "none"
        ? `CLZ (${r.opcodeByte}) of 0: ${r.leadingZeros} — the defined special case: the word has no set bit, so the count is the full width. Gas: ${r.totalGas} — a flat charge, the MUL tier, with no other term. Computed locally from the value you gave — no chain is queried.`
        : `CLZ (${r.opcodeByte}) of ${r.value} (${r.valueHex}): ${r.leadingZeros} leading zero bits — the word's bit length is ${r.bitLength} and its highest set bit is bit ${r.highestSetBit}, so the count is also 255 − floor(log2(value)). Gas: ${r.totalGas} — a flat charge, the MUL tier, with no other term. Computed locally from the value you gave — no chain is queried.`;
    });

    /* EXP opcode (exponentiation, EIP-160 pricing) */
    const expBtn = document.getElementById("exp-btn");
    if (expBtn) expBtn.addEventListener("click", () => {
      const r = expCalc(
        document.getElementById("exp-base").value,
        document.getElementById("exp-exponent").value);
      const el = document.getElementById("exp-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter the base and the exponent each as one 256-bit word, decimal or 0x hex (0 up to 2^256 − 1).";
        return;
      }
      el.textContent = `EXP (${r.opcodeByte}): ${r.base} ^ ${r.exponent} mod 2^256 = ${r.result} (${r.resultHex}) — the stack word wraps, as the EVM's does. Gas: ${r.totalGas} — 10 flat + 50 per byte of the exponent, and the exponent ${r.exponent} needs ${r.exponentBytes} byte(s) (before EIP-160 raised the per-byte term from 10, this cost ${r.legacyGas}). The base moves no term. Computed locally from the values you gave — nothing is executed and no chain is queried.`;
    });

    /* SIGNEXTEND opcode (sign extension) */
    const sextBtn = document.getElementById("sext-btn");
    if (sextBtn) sextBtn.addEventListener("click", () => {
      const r = signExtendCalc(
        document.getElementById("sext-index").value,
        document.getElementById("sext-value").value);
      const el = document.getElementById("sext-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter the byte index and the value each as one 256-bit word, decimal or 0x hex (0 up to 2^256 − 1).";
        return;
      }
      el.textContent = r.signBit === "none"
        ? `SIGNEXTEND (${r.opcodeByte}) at byte index ${r.byteIndex}: ${r.value} (${r.valueHex}) is pushed unchanged — at an index of 31 or more there is no byte above the sign byte inside the word to replace. Read as a signed 256-bit integer the result is ${r.signedResult}. Gas: ${r.totalGas} — a flat charge with no other term. Computed locally from the values you gave — nothing is executed and no chain is queried.`
        : `SIGNEXTEND (${r.opcodeByte}) at byte index ${r.byteIndex}: byte ${r.byteIndex} of ${r.value} (${r.valueHex}) has sign bit ${r.signBit}, so the ${r.extendedBytes} byte(s) above it are replaced with ${r.signBit === "1" ? "0xFF" : "0x00"} bytes, pushing ${r.result} (${r.resultHex}) — read as a signed integer, ${r.signedResult}. Gas: ${r.totalGas} — a flat charge with no other term. Computed locally from the values you gave — nothing is executed and no chain is queried.`;
    });

    /* Shift opcodes SHL / SHR / SAR (EIP-145) */
    const shiftBtn = document.getElementById("shift-btn");
    if (shiftBtn) shiftBtn.addEventListener("click", () => {
      const r = shiftCalc(
        document.getElementById("shift-op").value,
        document.getElementById("shift-amount").value,
        document.getElementById("shift-value").value);
      const el = document.getElementById("shift-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter the shift and the value each as one 256-bit word, decimal or 0x hex (0 up to 2^256 − 1).";
        return;
      }
      const name = r.opcode.toUpperCase();
      const how = r.opcode === "shl"
        ? "shifted left, the word wrapping mod 2^256"
        : r.opcode === "shr"
          ? "shifted right with zero fill (a logical shift)"
          : `read as the signed value ${r.signedValue} and shifted right with sign fill (an arithmetic shift, rounding toward minus infinity)`;
      const sat = r.saturated === "true"
        ? (r.opcode === "sar"
          ? " A shift of 256 or more saturates: SAR pushes 0 for a non-negative value and all-ones (−1) for a negative one."
          : " A shift of 256 or more saturates: the opcode pushes 0 whatever the value.")
        : "";
      el.textContent = `${name} (${r.opcodeByte}): ${r.value} (${r.valueHex}) ${how} by ${r.shift} bit(s) pushes ${r.result} (${r.resultHex}) — read as a signed 256-bit integer, ${r.signedResult}.${sat} Gas: ${r.totalGas} — a flat charge with no other term. Computed locally from the values you gave — nothing is executed and no chain is queried.`;
    });

    /* Modular arithmetic opcodes ADDMOD / MULMOD */
    const modBtn = document.getElementById("mod-btn");
    if (modBtn) modBtn.addEventListener("click", () => {
      const r = modMathCalc(
        document.getElementById("mod-op").value,
        document.getElementById("mod-a").value,
        document.getElementById("mod-b").value,
        document.getElementById("mod-n").value);
      const el = document.getElementById("mod-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter a, b and the modulus N each as one 256-bit word, decimal or 0x hex (0 up to 2^256 − 1).";
        return;
      }
      const name = r.opcode.toUpperCase();
      const expr = r.opcode === "addmod" ? `(${r.a} + ${r.b}) mod ${r.modulus}` : `(${r.a} × ${r.b}) mod ${r.modulus}`;
      const zero = r.zeroModulus === "true"
        ? " The modulus is 0, so the opcode pushes 0 whatever a and b are (Solidity's built-in functions check first and revert instead — that check is the language's, not the opcode's)."
        : " The intermediate sum or product is computed at full precision — it is not reduced mod 2^256 before the modulus is taken.";
      el.textContent = `${name} (${r.opcodeByte}): ${expr} pushes ${r.result} (${r.resultHex}).${zero} Gas: ${r.totalGas} — a flat charge with no other term. Computed locally from the values you gave — nothing is executed and no chain is queried.`;
    });

    /* BYTE opcode (byte extraction) */
    const byteBtn = document.getElementById("byte-btn");
    if (byteBtn) byteBtn.addEventListener("click", () => {
      const r = byteCalc(
        document.getElementById("byte-index").value,
        document.getElementById("byte-value").value);
      const el = document.getElementById("byte-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter the byte index and the value each as one 256-bit word, decimal or 0x hex (0 up to 2^256 − 1).";
        return;
      }
      el.textContent = r.outOfRange === "true"
        ? `BYTE (${r.opcodeByte}) at index ${r.byteIndex}: the index is 32 or more, so the opcode pushes 0 — out of range is a defined result, not an error. Gas: ${r.totalGas} — a flat charge with no other term. Computed locally from the values you gave — nothing is executed and no chain is queried.`
        : `BYTE (${r.opcodeByte}) at index ${r.byteIndex}: byte ${r.byteIndex} of ${r.value} (${r.valueHex}), counting from the most significant byte, is ${r.result} (${r.resultHex}) — that byte, pushed at the least significant position. Gas: ${r.totalGas} — a flat charge with no other term. Computed locally from the values you gave — nothing is executed and no chain is queried.`;
    });

    /* Division / modulo opcodes (DIV / SDIV / MOD / SMOD) */
    const divBtn = document.getElementById("div-btn");
    if (divBtn) divBtn.addEventListener("click", () => {
      const r = divCalc(
        document.getElementById("div-op").value,
        document.getElementById("div-a").value,
        document.getElementById("div-b").value);
      const el = document.getElementById("div-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter the dividend a and the divisor b each as one 256-bit word, decimal or 0x hex (0 up to 2^256 − 1).";
        return;
      }
      const name = r.opcode.toUpperCase();
      const signed = r.opcode === "sdiv" || r.opcode === "smod";
      const expr = r.opcode === "div" || r.opcode === "sdiv"
        ? (signed ? `${r.signedA} ÷ ${r.signedB}` : `${r.a} ÷ ${r.b}`)
        : (signed ? `${r.signedA} mod ${r.signedB}` : `${r.a} mod ${r.b}`);
      const shown = signed ? `${r.result} (${r.resultHex}), read signed as ${r.signedResult}` : `${r.result} (${r.resultHex})`;
      const zero = r.zeroDivisor === "true"
        ? " The divisor is 0, so the opcode pushes 0 — division by zero is a defined result at the opcode level (Solidity's / and % check first and revert instead; that check is the language's, not the opcode's)."
        : signed
          ? (r.opcode === "sdiv"
            ? " SDIV truncates toward zero — it does not floor — and −2^255 ÷ −1 pushes the −2^255 word itself, the one overflow case."
            : " SMOD's result takes the sign of the dividend a, never the divisor.")
          : "";
      el.textContent = `${name} (${r.opcodeByte}): ${expr} pushes ${shown}.${zero} Gas: ${r.totalGas} — a flat charge with no other term. Computed locally from the values you gave — nothing is executed and no chain is queried.`;
    });

    /* Comparison opcodes (LT / GT / SLT / SGT / EQ / ISZERO) */
    const cmpBtn = document.getElementById("cmp-btn");
    if (cmpBtn) cmpBtn.addEventListener("click", () => {
      const r = cmpCalc(
        document.getElementById("cmp-op").value,
        document.getElementById("cmp-a").value,
        document.getElementById("cmp-b").value);
      const el = document.getElementById("cmp-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter a and b each as one 256-bit word, decimal or 0x hex (0 up to 2^256 \u2212 1). For ISZERO only a is read.";
        return;
      }
      const name = r.opcode.toUpperCase();
      if (r.unary === "true") {
        el.textContent = `ISZERO (${r.opcodeByte}): the word ${r.a} (${r.aHex}) pushes ${r.result} \u2014 ISZERO pops one word only and pushes 1 exactly when that word is 0, and 0 for every other word. Gas: ${r.totalGas} \u2014 a flat charge with no other term. Computed locally from the value you gave \u2014 nothing is executed and no chain is queried.`;
        return;
      }
      const signed = r.opcode === "slt" || r.opcode === "sgt";
      const sym = { lt: "<", gt: ">", slt: "<", sgt: ">", eq: "=" }[r.opcode];
      const expr = signed ? `${r.signedA} ${sym} ${r.signedB}` : `${r.a} ${sym} ${r.b}`;
      const note = r.opcode === "eq"
        ? " EQ is reading-independent \u2014 the words are equal or they are not, signed or unsigned."
        : signed
          ? " The signed opcodes read the words as two's-complement integers \u2014 the same two words can answer oppositely under the unsigned pair."
          : " The unsigned opcodes read the words as plain magnitudes \u2014 the same two words can answer oppositely under the signed pair.";
      el.textContent = `${name} (${r.opcodeByte}): ${expr} is ${r.result === "1" ? "true" : "false"}, so the opcode pushes ${r.result} (${r.resultHex}) \u2014 a comparison pushes 1 or 0, never an operand.${note} Gas: ${r.totalGas} \u2014 a flat charge with no other term. Computed locally from the values you gave \u2014 nothing is executed and no chain is queried.`;
    });


    /* Bitwise opcodes (AND / OR / XOR / NOT) */
    const bitBtn = document.getElementById("bit-btn");
    if (bitBtn) bitBtn.addEventListener("click", () => {
      const r = bitCalc(
        document.getElementById("bit-op").value,
        document.getElementById("bit-a").value,
        document.getElementById("bit-b").value);
      const el = document.getElementById("bit-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter a and b each as one 256-bit word, decimal or 0x hex (0 up to 2^256 \u2212 1). For NOT only a is read.";
        return;
      }
      const name = r.opcode.toUpperCase();
      if (r.unary === "true") {
        el.textContent = `NOT (${r.opcodeByte}): the word ${r.a} (${r.aHex}) with every bit flipped pushes ${r.result} (${r.resultHex}) \u2014 NOT pops one word only, flips all 256 bits, and is not negation: \u2212x = NOT(x) + 1, so NOT 1 reads as \u22122 signed, not \u22121. Gas: ${r.totalGas} \u2014 a flat charge with no other term. Computed locally from the value you gave \u2014 nothing is executed and no chain is queried.`;
        return;
      }
      const sym = { and: "AND", or: "OR", xor: "XOR" }[r.opcode];
      el.textContent = `${name} (${r.opcodeByte}): ${r.a} (${r.aHex}) ${sym} ${r.b} (${r.bHex}) pushes ${r.result} (${r.resultHex}) \u2014 the combination is bit by bit on the raw words, so the signed or unsigned reading does not matter, and a and b are interchangeable. Gas: ${r.totalGas} \u2014 a flat charge with no other term. Computed locally from the values you gave \u2014 nothing is executed and no chain is queried.`;
    });

    /* Arithmetic opcodes (ADD / MUL / SUB) */
    const arithBtn = document.getElementById("arith-btn");
    if (arithBtn) arithBtn.addEventListener("click", () => {
      const r = arithCalc(
        document.getElementById("arith-op").value,
        document.getElementById("arith-a").value,
        document.getElementById("arith-b").value);
      const el = document.getElementById("arith-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter a and b each as one 256-bit word, decimal or 0x hex (0 up to 2^256 \u2212 1).";
        return;
      }
      const name = r.opcode.toUpperCase();
      const sym = { add: "+", mul: "\u00d7", sub: "\u2212" }[r.opcode];
      el.textContent = `${name} (${r.opcodeByte}): ${r.a} (${r.aHex}) ${sym} ${r.b} (${r.bHex}) pushes ${r.result} (${r.resultHex}) \u2014 the result is reduced modulo 2^256, so it wraps rather than trapping: the checked reverts of Solidity >= 0.8 are a language check around these opcodes, not the opcodes themselves. Gas: ${r.totalGas} \u2014 a flat charge with no other term${r.opcode === "mul" ? " (MUL is the Low tier at 5, unlike ADD and SUB at 3)" : ""}. Computed locally from the values you gave \u2014 nothing is executed and no chain is queried.`;
    });

    /* Push opcodes (PUSH0 / PUSH1-PUSH32) */
    const pushBtn = document.getElementById("push-btn");
    if (pushBtn) pushBtn.addEventListener("click", () => {
      const r = pushCalc(
        document.getElementById("push-n").value,
        document.getElementById("push-imm").value);
      const el = document.getElementById("push-out");
      if (r === null) {
        el.textContent = "Check the inputs: pick PUSH0 or PUSH1\u2013PUSH32, and enter the immediate as hex bytes (0x prefix optional, an even number of hex digits, no more bytes than the opcode reads \u2014 for PUSH0 leave it empty, it has no immediate).";
        return;
      }
      const name = "PUSH" + r.n;
      if (r.n === "0") {
        el.textContent = `PUSH0 (${r.opcodeByte}): pushes 0 (${r.resultHex}) \u2014 it has no immediate, pops nothing, and costs ${r.totalGas} gas (the Base tier), 1 less than PUSH1 0x00 at 3, plus a saved code byte; that saving is why EIP-3855 added it in Shanghai. Computed locally \u2014 nothing is executed and no chain is queried.`;
        return;
      }
      const pad = r.paddedBytes !== "0"
        ? ` Only ${r.suppliedBytes} of the ${r.n} immediate bytes remain before the code ends, so the missing ${r.paddedBytes} low-order byte(s) read as zero \u2014 the bytes are padded on the right, which is why the result is not the short-integer reading.`
        : "";
      const min = r.minimalN !== r.n
        ? ` The smallest push of this same value is PUSH${r.minimalN} \u2014 leading or trailing zero bytes cost code size, never change the value.`
        : "";
      el.textContent = `${name} (${r.opcodeByte}): immediate ${r.immHex} read big-endian pushes ${r.result} (${r.resultHex}).${pad}${min} Gas: ${r.totalGas} \u2014 a flat charge for every PUSH1\u2013PUSH32, whatever n or the value. Computed locally from the values you gave \u2014 nothing is executed and no chain is queried.`;
    });

    /* Stack opcodes (POP / DUP1-DUP16 / SWAP1-SWAP16) */
    const stackBtn = document.getElementById("stack-btn");
    if (stackBtn) stackBtn.addEventListener("click", () => {
      const sel = document.getElementById("stack-op").value;
      const fam = sel === "pop" ? "pop" : sel.startsWith("dup") ? "dup" : "swap";
      const n = sel === "pop" ? "0" : sel.replace(fam, "");
      const r = stackCalc(
        fam,
        n,
        document.getElementById("stack-items").value);
      const el = document.getElementById("stack-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter the stack as 256-bit words (decimal or 0x hex), deepest first with the top item last, separated by commas or spaces \u2014 at most 64 items; an empty field is an empty stack.";
        return;
      }
      const name = r.opcode === "pop" ? "POP" : r.opcode.toUpperCase() + r.n;
      const fmtStack = arr => arr.length === 0 ? "(empty)" : "[" + arr.join(", ") + "]";
      if (r.underflow === "true") {
        const need = r.opcode === "pop" ? 1 : r.opcode === "dup" ? Number(r.n) : Number(r.n) + 1;
        el.textContent = `${name} (${r.opcodeByte}) on a stack of depth ${r.depthBefore}: STACK UNDERFLOW \u2014 this opcode needs at least ${need} item(s) on the stack. In a real execution this is an exceptional halt: the frame's remaining gas is consumed and its state reverts, and no resulting stack exists \u2014 the stack is shown unchanged, not because the opcode leaves it so but because execution stops. The opcode's own flat charge is ${r.totalGas} gas (the Base tier), but a halt costs far more than that. Computed locally \u2014 nothing is executed and no chain is queried.`;
        return;
      }
      const effect = r.opcode === "pop"
        ? `removes the top item ${r.before[r.before.length - 1]}`
        : r.opcode === "dup"
          ? `pushes a copy of the item ${r.n} down from the top (${r.after[r.after.length - 1]}); the original stays where it was, so the depth grows by exactly 1`
          : `exchanges the top item with the one ${r.n} below it \u2014 the two change places, every other item is untouched, and the depth is unchanged`;
      el.textContent = `${name} (${r.opcodeByte}): stack ${fmtStack(r.before)} \u2192 ${fmtStack(r.after)} \u2014 ${effect}. Gas: ${r.totalGas} \u2014 a flat charge (the Base tier, 1 below the Verylow 3 the push family charges), with no other term. Computed locally from the stack you gave \u2014 nothing is executed and no chain is queried.`;
    });

    /* JUMPDEST analyser */
    const jdBtn = document.getElementById("jd-btn");
    if (jdBtn) jdBtn.addEventListener("click", () => {
      const r = jumpdestCalc(
        document.getElementById("jd-code").value,
        document.getElementById("jd-dest").value);
      const el = document.getElementById("jd-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter the bytecode as hex (0x prefix optional, an even number of hex digits, at most 24,576 bytes — the EIP-170 deployed-code limit; empty is empty code), and a destination as a whole number in decimal or 0x hex (or leave it empty to just list the destinations).";
        return;
      }
      const fmt = arr => arr.length === 0 ? "none" : arr.join(", ");
      const trunc = r.truncatedPush === "true"
        ? " The code ends inside a PUSH: its missing immediate bytes are consumed as data (padded with zeros when the push executes), so the walk ends there."
        : "";
      let verdict = "";
      if (r.dest !== "") {
        verdict = r.destValid === "true"
          ? ` Destination ${r.dest}: VALID — a JUMP or JUMPI landing there is legal.`
          : ` Destination ${r.dest}: NOT a valid destination — a JUMP or JUMPI landing there is an invalid jump destination and halts exceptionally, consuming the frame's gas${r.fakes.includes(r.dest) ? ", even though the byte stored there is 0x5b: it sits inside PUSH immediate data, so it is data, not a JUMPDEST" : ""}.`;
      }
      el.textContent = `Code: ${r.codeBytes} byte(s), ${r.instructions} instruction(s) on the walk from pc 0. Valid jump destinations (${r.jumpdestCount}): ${fmt(r.jumpdests)}. Bytes that are 0x5b but sit inside PUSH data and are NOT destinations (${r.fakeCount}): ${fmt(r.fakes)}.${trunc}${verdict} JUMPDEST itself costs 1 gas when execution reaches it. Computed locally from the code you gave — nothing is executed and no chain is queried.`;
    });

    /* Linear disassembler */
    const disBtn = document.getElementById("dis-btn");
    if (disBtn) disBtn.addEventListener("click", () => {
      const r = disasmCalc(document.getElementById("dis-code").value);
      const el = document.getElementById("dis-out");
      if (r === null) {
        el.textContent = "Check the input: enter the bytecode as hex (0x prefix optional, an even number of hex digits, at most 24,576 bytes — the EIP-170 deployed-code limit; empty is empty code).";
        return;
      }
      const trunc = r.truncatedPush === "true"
        ? " The code ends inside a PUSH, whose listing line shows the bytes present and the value the push would read."
        : "";
      const un = r.unassignedCount !== "0"
        ? ` ${r.unassignedCount} byte(s) have no assigned opcode and are listed as UNASSIGNED — executing one is an invalid-instruction halt, distinct from the assigned INVALID opcode (0xfe).`
        : "";
      el.textContent = (r.listing.length === 0
        ? "Empty code: no instructions."
        : r.listing.join("\n")) +
        `\n— ${r.codeBytes} byte(s), ${r.instructions} instruction(s) on the linear walk from pc 0, ${r.jumpdestCount} of them JUMPDESTs.${trunc}${un} This is a linear sweep, not an execution trace: instructions after a STOP, RETURN or JUMP are listed whether or not any execution reaches them. Computed locally from the code you gave — nothing is executed and no chain is queried.`;
    });

    /* Memory opcodes (MLOAD / MSTORE / MSTORE8) */
    const memopBtn = document.getElementById("memop-btn");
    if (memopBtn) memopBtn.addEventListener("click", () => {
      const r = memCalc(
        document.getElementById("memop-op").value,
        document.getElementById("memop-offset").value,
        document.getElementById("memop-value").value,
        document.getElementById("memop-memory").value);
      const el = document.getElementById("memop-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter the offset and (for MSTORE / MSTORE8) the value each as one 256-bit word, decimal or 0x hex, and the memory before as hex bytes (0x prefix optional, an even number of hex digits, at most 4,096 bytes; empty is empty memory). The touched end — offset plus 32 bytes, or 1 for MSTORE8 — must also stay within 4,096 bytes.";
        return;
      }
      const name = r.opcode.toUpperCase();
      const gas = r.expansionGas === "0"
        ? `Gas: ${r.totalGas} — the flat 3 (the Verylow tier) alone, because the touched bytes are inside the size already covered, so no expansion is charged.`
        : `Gas: ${r.totalGas} — the flat 3 (the Verylow tier) plus ${r.expansionGas} of memory expansion for growing MSIZE from ${r.msizeBefore} to ${r.msizeAfter} bytes.`;
      if (r.opcode === "mload") {
        el.textContent = `MLOAD (${r.opcodeByte}) at offset ${r.offset}: the 32 big-endian bytes there push ${r.result} (${r.resultHex}) — bytes past the end of the supplied memory read as zero. The bytes are unchanged (${r.memoryAfterBytes} byte(s)); MSIZE is ${r.msizeAfter}. ${gas} Computed locally from the memory you gave — nothing is executed and no chain is queried.`;
        return;
      }
      if (r.opcode === "mstore8") {
        el.textContent = `MSTORE8 (${r.opcodeByte}) at offset ${r.offset}: stores the single byte ${r.storedByte} — the value ${r.value} mod 256, its least significant byte; the value's higher bytes are discarded. Memory after (${r.memoryAfterBytes} byte(s)): ${r.memoryAfter}. MSIZE is ${r.msizeAfter}. ${gas} Computed locally from the memory you gave — nothing is executed and no chain is queried.`;
        return;
      }
      el.textContent = `MSTORE (${r.opcodeByte}) at offset ${r.offset}: writes the value ${r.value} (${r.valueHex}) as a 32-byte big-endian word — its low byte lands at offset ${Number(r.offset) + 31}. Memory after (${r.memoryAfterBytes} byte(s)): ${r.memoryAfter}. MSIZE is ${r.msizeAfter}. ${gas} Computed locally from the memory you gave — nothing is executed and no chain is queried.`;
    });

    /* Calldata opcodes (CALLDATALOAD / CALLDATASIZE / CALLDATACOPY) */
    const cdatBtn = document.getElementById("cdat-btn");
    if (cdatBtn) cdatBtn.addEventListener("click", () => {
      const r = cdCalc(
        document.getElementById("cdat-op").value,
        document.getElementById("cdat-offset").value,
        document.getElementById("cdat-dest").value,
        document.getElementById("cdat-size").value,
        document.getElementById("cdat-calldata").value,
        document.getElementById("cdat-memory").value);
      const el = document.getElementById("cdat-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter the offset and (for CALLDATACOPY) the destination and size each as one 256-bit word, decimal or 0x hex, and the calldata and the memory before as hex bytes (0x prefix optional, an even number of hex digits, at most 4,096 bytes each; empty is empty). For CALLDATACOPY the size and, when the size is not zero, the destination end must also stay within 4,096 bytes.";
        return;
      }
      if (r.opcode === "calldataload") {
        el.textContent = `CALLDATALOAD (${r.opcodeByte}) at offset ${r.offset}: the 32 big-endian bytes there push ${r.result} (${r.resultHex}) — bytes past the end of the ${r.calldataBytes}-byte calldata read as zero, and no memory is touched (memory unchanged at ${r.memoryAfterBytes} byte(s)). Gas: 3 — the flat Verylow tier, at any offset, because reading calldata expands nothing. Computed locally from the calldata you gave — nothing is executed and no chain is queried.`;
        return;
      }
      if (r.opcode === "calldatasize") {
        el.textContent = `CALLDATASIZE (${r.opcodeByte}): pushes ${r.result} — the length in bytes of the calldata you supplied. Gas: 2 — the flat Base tier. No memory is touched (memory unchanged at ${r.memoryAfterBytes} byte(s)). Computed locally from the calldata you gave — nothing is executed and no chain is queried.`;
        return;
      }
      el.textContent = `CALLDATACOPY (${r.opcodeByte}): copies ${r.copySize} byte(s) from calldata offset ${r.offset} to memory offset ${r.destOffset} — bytes past the end of the ${r.calldataBytes}-byte calldata copy as zero, and a gap in memory is zero-filled. Copied: ${r.copied}. Memory after (${r.memoryAfterBytes} byte(s)): ${r.memoryAfter}. MSIZE is ${r.msizeAfter}. Gas: ${r.totalGas} — the flat 3 plus ${r.wordGas} for the word(s) copied plus ${r.expansionGas} of memory expansion. Computed locally from the calldata and memory you gave — nothing is executed and no chain is queried.`;
    });

    /* Returndata opcodes (RETURNDATASIZE / RETURNDATACOPY) */
    const rdatBtn = document.getElementById("rdat-btn");
    if (rdatBtn) rdatBtn.addEventListener("click", () => {
      const r = rdCalc(
        document.getElementById("rdat-op").value,
        document.getElementById("rdat-offset").value,
        document.getElementById("rdat-dest").value,
        document.getElementById("rdat-size").value,
        document.getElementById("rdat-data").value,
        document.getElementById("rdat-memory").value);
      const el = document.getElementById("rdat-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter the offset and (for RETURNDATACOPY) the destination and size each as one 256-bit word, decimal or 0x hex, and the return data and the memory before as hex bytes (0x prefix optional, an even number of hex digits, at most 4,096 bytes each; empty is an empty return data buffer). For an in-bounds RETURNDATACOPY the destination end must also stay within 4,096 bytes.";
        return;
      }
      if (r.opcode === "returndatasize") {
        el.textContent = `RETURNDATASIZE (${r.opcodeByte}): pushes ${r.result} — the length in bytes of the return data you supplied (the buffer the most recent call left; empty before any call). Gas: 2 — the flat Base tier. No memory is touched (memory unchanged at ${r.memoryAfterBytes} byte(s)). Computed locally from the return data you gave — nothing is executed and no chain is queried.`;
        return;
      }
      if (r.halted === "true") {
        el.textContent = `RETURNDATACOPY (${r.opcodeByte}): copying ${r.copySize} byte(s) from return data offset ${r.offset} runs past the end of the ${r.returndataBytes}-byte return data — an exceptional halt. Unlike CALLDATACOPY and CODECOPY this copy does NOT zero-pad its source: the frame's remaining gas is consumed, nothing is copied, and memory is unchanged (${r.memoryAfterBytes} byte(s)): ${r.memoryAfter}. Computed locally from the return data you gave — nothing is executed and no chain is queried.`;
        return;
      }
      el.textContent = `RETURNDATACOPY (${r.opcodeByte}): copies ${r.copySize} byte(s) from return data offset ${r.offset} to memory offset ${r.destOffset} — the range is inside the ${r.returndataBytes}-byte return data, so every byte copied is a real returned byte (this copy never zero-pads), and a gap in memory is zero-filled. Copied: ${r.copied}. Memory after (${r.memoryAfterBytes} byte(s)): ${r.memoryAfter}. MSIZE is ${r.msizeAfter}. Gas: ${r.totalGas} — the flat 3 plus ${r.wordGas} for the word(s) copied plus ${r.expansionGas} of memory expansion. Computed locally from the return data and memory you gave — nothing is executed and no chain is queried.`;
    });

    /* Code opcodes (CODESIZE / CODECOPY) */
    const codeBtn = document.getElementById("code-btn");
    if (codeBtn) codeBtn.addEventListener("click", () => {
      const r = codeCalc(
        document.getElementById("code-op").value,
        document.getElementById("code-offset").value,
        document.getElementById("code-dest").value,
        document.getElementById("code-size").value,
        document.getElementById("code-code").value,
        document.getElementById("code-memory").value);
      const el = document.getElementById("code-out");
      if (r === null) {
        el.textContent = "Check the inputs: enter the offset and (for CODECOPY) the destination and size each as one 256-bit word, decimal or 0x hex, and the code and the memory before as hex bytes (0x prefix optional, an even number of hex digits, at most 4,096 bytes each; empty is empty code). For CODECOPY the size and the destination end must also stay within 4,096 bytes.";
        return;
      }
      if (r.opcode === "codesize") {
        el.textContent = `CODESIZE (${r.opcodeByte}): pushes ${r.result} — the length in bytes of the executing code you supplied. Gas: 2 — the flat Base tier. No memory is touched (memory unchanged at ${r.memoryAfterBytes} byte(s)). Computed locally from the code you gave — nothing is executed and no chain is queried.`;
        return;
      }
      el.textContent = `CODECOPY (${r.opcodeByte}): copies ${r.copySize} byte(s) from code offset ${r.offset} to memory offset ${r.destOffset} — bytes past the end of the ${r.codeBytes}-byte code copy as zero (this copy zero-pads its source; it never halts the way RETURNDATACOPY does), and a gap in memory is zero-filled. Copied: ${r.copied}. Memory after (${r.memoryAfterBytes} byte(s)): ${r.memoryAfter}. MSIZE is ${r.msizeAfter}. Gas: ${r.totalGas} — the flat 3 plus ${r.wordGas} for the word(s) copied plus ${r.expansionGas} of memory expansion. Computed locally from the code and memory you gave — nothing is executed and no chain is queried.`;
    });

    /* Environment opcodes (ADDRESS / BALANCE / ORIGIN / CALLER / CALLVALUE / GASPRICE / COINBASE / TIMESTAMP / NUMBER / PREVRANDAO / GASLIMIT / CHAINID / SELFBALANCE / BASEFEE / BLOBHASH / BLOBBASEFEE) */
    const envBtn = document.getElementById("env-btn");
    if (envBtn) envBtn.addEventListener("click", () => {
      const cold = document.getElementById("env-balcold").checked;
      const r = envCalc(
        document.getElementById("env-op").value,
        document.getElementById("env-address").value,
        document.getElementById("env-baladdr").value,
        document.getElementById("env-balvalue").value,
        cold,
        document.getElementById("env-selfbal").value,
        document.getElementById("env-caller").value,
        document.getElementById("env-callvalue").value,
        document.getElementById("env-origin").value,
        document.getElementById("env-gasprice").value,
        document.getElementById("env-coinbase").value,
        document.getElementById("env-timestamp").value,
        document.getElementById("env-number").value,
        document.getElementById("env-prevrandao").value,
        document.getElementById("env-gaslimit").value,
        document.getElementById("env-chainid").value,
        document.getElementById("env-basefee").value,
        document.getElementById("env-blobbasefee").value,
        document.getElementById("env-blobindex").value,
        document.getElementById("env-blobhashes").value);
      const el = document.getElementById("env-out");
      if (r === null) {
        el.textContent = "Check the inputs: each opcode reads only its own field(s) of the environment — an address must be exactly 40 hex characters (0x prefix optional), a value one 256-bit word in decimal or 0x hex, and the blob versioned hashes a comma-separated list of 32-byte hashes (0x prefix optional per entry, at most 32 entries, empty for a transaction with no blobs).";
        return;
      }
      const NAME = r.opcode.toUpperCase();
      const tail = "Computed locally from the environment you gave — nothing is executed and no chain is queried.";
      if (r.opcode === "balance") {
        el.textContent = `BALANCE (${r.opcodeByte}, ${r.fork}): pushes ${r.result} — the balance in wei you supplied for ${toChecksumAddress(r.resultAddress)}. Gas: ${r.totalGas} — the EIP-2929 account access cost for a ${cold ? "cold account (its first touch in this transaction; a later touch of the same account would be warm at 100)" : "warm account (already touched in this transaction; a cold first touch would cost 2,600)"}, the same total the hub's account-access gas tool quotes. The executing account's own balance is SELFBALANCE's job, at a flat 5 with no access cost. ${tail}`;
        return;
      }
      if (r.opcode === "blobhash") {
        el.textContent = r.blobInRange === "true"
          ? `BLOBHASH (${r.opcodeByte}, ${r.fork}): pushes ${r.resultHex} — blob versioned hash ${r.blobIndex} of the ${r.blobCount} the transaction you described carries. Gas: 3 — the flat Verylow tier. ${tail}`
          : `BLOBHASH (${r.opcodeByte}, ${r.fork}): pushes 0 — the index ${r.blobIndex} is past the end of the transaction's ${r.blobCount}-entry blob versioned hash list, and an out-of-range index pushes 0 rather than halting (the opposite failure mode from RETURNDATACOPY). Gas: 3 — the flat Verylow tier. ${tail}`;
        return;
      }
      if (r.resultAddress !== "") {
        el.textContent = `${NAME} (${r.opcodeByte}, ${r.fork}): pushes the address ${toChecksumAddress(r.resultAddress)} (as the word ${r.resultHex}). Gas: ${r.totalGas} — the flat Base tier. ${tail}`;
        return;
      }
      el.textContent = `${NAME} (${r.opcodeByte}, ${r.fork}): pushes ${r.result} (the word ${r.resultHex}) — the value you supplied for this field of the environment. Gas: ${r.totalGas}${r.opcode === "selfbalance" ? " — the flat Low tier, with no EIP-2929 access cost, because the balance read is the executing account's own" : " — the flat Base tier"}. ${tail}`;
    });

    /* BLOCKHASH opcode (0x40) */
    const bhBtn = document.getElementById("bh-btn");
    if (bhBtn) bhBtn.addEventListener("click", () => {
      const r = blockhashCalc(
        document.getElementById("bh-current").value,
        document.getElementById("bh-target").value,
        document.getElementById("bh-entries").value);
      const el = document.getElementById("bh-out");
      if (r === null) {
        el.textContent = "Check the inputs: the current and target block numbers are each one 256-bit word, decimal or 0x hex, and the entries are comma-separated number:hash pairs (hash exactly 32 bytes, 0x prefix optional, at most 256 entries, no block number twice). If the target is inside the 256-block window, its hash must be among the entries — supply it, because the real opcode would push that block's actual hash, not 0.";
        return;
      }
      const tail = "Computed locally from the block numbers and hashes you gave — nothing is executed and no chain is queried.";
      if (r.inWindow === "true") {
        el.textContent = `BLOCKHASH (${r.opcodeByte}, ${r.fork}): pushes ${r.resultHex} — the hash you supplied for block ${r.target}, which is ${r.depth} block(s) behind the current block ${r.current}, inside the 256-block window (the far edge, exactly 256 back, is included). Gas: 20 — the flat G_blockhash, unchanged since Frontier. ${tail}`;
        return;
      }
      const why = r.depth === "" ? `block ${r.target} is ahead of the current block ${r.current}, and a block that does not exist yet has no hash`
        : r.depth === "0" ? `block ${r.target} IS the current block, whose hash is not yet known to the executing frame`
        : `block ${r.target} is ${r.depth} blocks behind the current block ${r.current}, past the 256-block window`;
      el.textContent = `BLOCKHASH (${r.opcodeByte}, ${r.fork}): pushes 0 — ${why}. An out-of-window argument pushes 0 rather than halting, and it pushes 0 even if a hash for that block is among the entries you supplied: supplying data does not extend the window. Gas: 20 — the flat G_blockhash, unchanged since Frontier. ${tail}`;
    });

    /* Execution-state opcodes PC (0x58) / MSIZE (0x59) / GAS (0x5a) */
    const execBtn = document.getElementById("exec-btn");
    if (execBtn) execBtn.addEventListener("click", () => {
      const r = execCalc(
        document.getElementById("exec-op").value,
        document.getElementById("exec-pc").value,
        document.getElementById("exec-memory").value,
        document.getElementById("exec-gasbefore").value);
      const el = document.getElementById("exec-out");
      if (r === null) {
        el.textContent = "Check the inputs for the selected opcode: PC takes one 256-bit value, decimal or 0x hex (the byte offset of the PC instruction itself); MSIZE takes memory as even-length hex, at most 4,096 bytes; GAS takes the gas in hand as one 256-bit value, decimal or 0x hex. Only the selected opcode's input is read.";
        return;
      }
      const NAME = { pc: "PC", msize: "MSIZE", gas: "GAS" }[r.opcode];
      const tail = "Computed locally from the execution state you supplied — nothing is executed and no chain is queried.";
      if (r.halted === "true") {
        el.textContent = `GAS (${r.opcodeByte}, ${r.fork}): HALTS out of gas — the frame has ${r.gasBefore} gas in hand, less than the 2 the GAS opcode itself costs, so it cannot pay for itself: the frame's gas is consumed, nothing is pushed, and there is no gas figure to quote. ${tail}`;
        return;
      }
      if (r.opcode === "pc") {
        el.textContent = `PC (${r.opcodeByte}, ${r.fork}): pushes ${r.result} (the word ${r.resultHex}) — the byte offset of the PC instruction itself in the executing code, not the offset of the next instruction (${(BigInt(r.result) + 1n).toString()}). Gas: 2 — the flat Base tier. ${tail}`;
        return;
      }
      if (r.opcode === "msize") {
        el.textContent = `MSIZE (${r.opcodeByte}, ${r.fork}): pushes ${r.result} — the active memory size in bytes for the ${r.memoryBytes} byte(s) of memory you supplied, rounded up to a whole number of 32-byte words, because memory only ever grows in whole words. Gas: 2 — the flat Base tier. ${tail}`;
        return;
      }
      el.textContent = `GAS (${r.opcodeByte}, ${r.fork}): pushes ${r.result} (the word ${r.resultHex}) — the frame's gas remaining after the GAS opcode's own cost is deducted: ${r.gasBefore} in hand minus 2, never the ${r.gasBefore} itself, and the frame's full remainder — the EIP-150 63/64 cap limits what a later CALL may forward, not what GAS reports. Gas: 2 — the flat Base tier. ${tail}`;
    });

    /* External code opcodes EXTCODESIZE (0x3b) / EXTCODEHASH (0x3f) */
    const extBtn = document.getElementById("ext-btn");
    if (extBtn) extBtn.addEventListener("click", () => {
      const cold = document.getElementById("ext-cold").checked;
      const r = extcodeCalc(
        document.getElementById("ext-op").value,
        document.getElementById("ext-addr").value,
        document.getElementById("ext-code").value,
        document.getElementById("ext-balance").value,
        document.getElementById("ext-nonce").value,
        cold);
      const el = document.getElementById("ext-out");
      if (r === null) {
        el.textContent = "Check the inputs: the target address must be exactly 40 hex characters (0x prefix optional), the target's code even-length hex of at most 4,096 bytes (empty is an account with no code), and (for EXTCODEHASH) the balance and nonce each one 256-bit word, decimal or 0x hex. EXTCODESIZE reads only the address, the code and the warmth.";
        return;
      }
      const tail = "Computed locally from the account state you gave — nothing is executed and no chain is queried.";
      const gasNote = `Gas: ${r.totalGas} — the EIP-2929 account access cost for a ${cold ? "cold account (its first touch in this transaction; a later touch of the same account would be warm at 100)" : "warm account (already touched in this transaction; a cold first touch would cost 2,600)"}, the same total the hub's account-access gas tool quotes.`;
      if (r.opcode === "extcodesize") {
        el.textContent = `EXTCODESIZE (${r.opcodeByte}, ${r.fork}): pushes ${r.result} — the length in bytes of the code you supplied for ${toChecksumAddress(r.targetAddress)}. An account with no code pushes 0, funded or not, and a non-existent account pushes 0. ${gasNote} ${tail}`;
        return;
      }
      if (r.empty === "true") {
        el.textContent = `EXTCODEHASH (${r.opcodeByte}, ${r.fork}): pushes 0 — the account at ${toChecksumAddress(r.targetAddress)} is empty as you supplied it (nonce 0, balance 0, no code), or does not exist, and EIP-1052 pushes 0 for such an account, NOT the hash of empty data (0xc5d246…). ${gasNote} ${tail}`;
        return;
      }
      if (r.codeBytes === "0") {
        el.textContent = `EXTCODEHASH (${r.opcodeByte}, ${r.fork}): pushes ${r.resultHex} — the Keccak-256 of empty data, because the account at ${toChecksumAddress(r.targetAddress)} exists and is not empty (its balance or nonce is non-zero) but carries no code, like a funded externally owned account. It is not 0: 0 is reserved for a non-existent or empty account. ${gasNote} ${tail}`;
        return;
      }
      el.textContent = `EXTCODEHASH (${r.opcodeByte}, ${r.fork}): pushes ${r.resultHex} — the Keccak-256 of the ${r.codeBytes} byte(s) of code you supplied for ${toChecksumAddress(r.targetAddress)}. ${gasNote} ${tail}`;
    });

    /* EXTCODECOPY opcode (0x3c) */
    const extcopyBtn = document.getElementById("extcopy-btn");
    if (extcopyBtn) extcopyBtn.addEventListener("click", () => {
      const cold = document.getElementById("extcopy-cold").checked;
      const r = extcopyCalc(
        document.getElementById("extcopy-addr").value,
        document.getElementById("extcopy-offset").value,
        document.getElementById("extcopy-dest").value,
        document.getElementById("extcopy-size").value,
        document.getElementById("extcopy-code").value,
        document.getElementById("extcopy-memory").value,
        cold);
      const el = document.getElementById("extcopy-out");
      if (r === null) {
        el.textContent = "Check the inputs: the target address must be exactly 40 hex characters (0x prefix optional), the code offset, destination and size each one 256-bit word, decimal or 0x hex, and the target's code and the memory before as hex bytes (0x prefix optional, an even number of hex digits, at most 4,096 bytes each; empty is an account with no code). The size and a non-empty copy's destination end must also stay within 4,096 bytes.";
        return;
      }
      const tail = "Computed locally from the account and memory you gave — nothing is executed and no chain is queried.";
      el.textContent = `EXTCODECOPY (${r.opcodeByte}, ${r.fork}): copies ${r.copySize} byte(s) from offset ${r.offset} of the ${r.codeBytes} byte(s) of code you supplied for ${toChecksumAddress(r.targetAddress)} to memory offset ${r.destOffset} — bytes past the end of that code copy as zero (this copy zero-pads its source; it never halts the way RETURNDATACOPY does, and a target with no code copies only zeros), and a gap in memory is zero-filled. Copied: ${r.copied}. Memory after (${r.memoryAfterBytes} byte(s)): ${r.memoryAfter}. MSIZE is ${r.msizeAfter}. Gas: ${r.totalGas} — there is no flat base: ${r.accessGas} of EIP-2929 account access for a ${cold ? "cold account (its first touch in this transaction; a later touch of the same account would be warm at 100)" : "warm account (already touched in this transaction; a cold first touch would cost 2,600)"} plus ${r.wordGas} for the word(s) copied plus ${r.expansionGas} of memory expansion — the same total the hub's EXTCODECOPY gas tool quotes. The same copy of the executing account's own code via CODECOPY would pay no access cost. ${tail}`;
    });

    /* JUMP (0x56) / JUMPI (0x57) */
    const jumpBtn = document.getElementById("jump-btn");
    if (jumpBtn) jumpBtn.addEventListener("click", () => {
      const r = jumpCalc(
        document.getElementById("jump-op").value,
        document.getElementById("jump-dest").value,
        document.getElementById("jump-cond").value,
        document.getElementById("jump-code").value);
      const el = document.getElementById("jump-out");
      if (r === null) {
        el.textContent = "Check the inputs: the destination (and, for JUMPI, the condition) must each be one 256-bit word, decimal or 0x hex, and the code even-length hex of at most 24,576 bytes (empty is empty code). JUMP has no condition and its condition field is not read.";
        return;
      }
      const tail = "Computed locally from the code you gave — nothing is executed and no chain is queried.";
      const name = r.opcode === "jumpi" ? "JUMPI" : "JUMP";
      const dests = r.validDests.length ? r.validDests.join(", ") : "none";
      if (r.outcome === "fallthrough") {
        el.textContent = `JUMPI (${r.opcodeByte}, ${r.fork}): the condition is 0, so execution falls through to the next instruction — the destination ${r.dest} is never validated${r.destValid === "true" ? ", even though it happens to be a valid JUMPDEST here" : ", and it is not a valid destination (valid destinations in this code: " + dests + ") — a zero condition makes that harmless"}. Gas: 10 — the flat High tier, paid on a fall-through too because the opcode ran. ${tail}`;
        return;
      }
      if (r.outcome === "jump") {
        el.textContent = `${name} (${r.opcodeByte}, ${r.fork}): ${r.opcode === "jumpi" ? "the condition " + r.condition + " is non-zero, so the jump is taken, and " : ""}execution continues at pc ${r.nextPc} — a JUMPDEST in the ${r.codeBytes} byte(s) of code you supplied (valid destinations: ${dests}). Gas: ${r.totalGas} — the flat ${r.opcode === "jumpi" ? "High" : "Mid"} tier, with no other term. ${tail}`;
        return;
      }
      el.textContent = `${name} (${r.opcodeByte}, ${r.fork}): destination ${r.dest} is NOT a valid jump destination in the ${r.codeBytes} byte(s) of code you supplied (valid destinations: ${dests})${r.destFake === "true" ? " — the byte stored there is 0x5b, but it sits inside PUSH immediate data, so it is data, not a JUMPDEST" : ""} — an invalid jump destination, an exceptional halt that consumes the frame's gas, so no single-opcode gas figure applies. ${tail}`;
    });

    /* SLOAD (0x54) / SSTORE (0x55) */
    const storageBtn = document.getElementById("storage-btn");
    if (storageBtn) storageBtn.addEventListener("click", () => {
      const cold = document.getElementById("storage-cold").checked;
      const r = storageCalc(
        document.getElementById("storage-op").value,
        document.getElementById("storage-slot").value,
        document.getElementById("storage-original").value,
        document.getElementById("storage-current").value,
        document.getElementById("storage-new").value,
        document.getElementById("storage-gas").value,
        cold);
      const el = document.getElementById("storage-out");
      if (r === null) {
        el.textContent = "Check the inputs: the slot and the current value (and, for SSTORE, the original value, the new value and the gas remaining) must each be one 256-bit word, decimal or 0x hex. SLOAD reads only the slot, the current value and the warmth — its other fields are not read.";
        return;
      }
      const tail = "Computed locally from the storage state you gave — nothing is executed and no chain is queried.";
      if (r.opcode === "sload") {
        el.textContent = `SLOAD (${r.opcodeByte}, ${r.fork}): pushes the current word of slot ${r.slot} — ${r.pushed} (${r.storageAfterHex}) — and storage is unchanged. Gas: ${r.totalGas} — the EIP-2929 slot access cost for a ${cold ? "cold slot (its first touch in this transaction; a later touch of the same slot would be warm at 100)" : "warm slot (already touched in this transaction; a cold first touch would cost 2,100)"}, with no other term — the same total the hub's SLOAD gas tool quotes. ${tail}`;
        return;
      }
      if (r.halted === "true" && r.haltReason === "sentry") {
        el.textContent = `SSTORE (${r.opcodeByte}, ${r.fork}): the frame's gas remaining, ${r.gasBefore}, is at or below the 2,300 call stipend, so the EIP-2200 sentry halts the opcode out of gas before any metering — even a 100-gas no-op write cannot run on a stipend. Slot ${r.slot} keeps its current word ${r.current}; no gas or refund figure applies. ${tail}`;
        return;
      }
      if (r.halted === "true") {
        el.textContent = `SSTORE (${r.opcodeByte}, ${r.fork}): the frame's gas remaining, ${r.gasBefore}, is above the 2,300 sentry but below this write's metered cost, so the opcode halts out of gas. Slot ${r.slot} keeps its current word ${r.current}; no gas or refund figure applies. The metered cost itself is what the hub's SSTORE gas tool quotes for these values. ${tail}`;
        return;
      }
      el.textContent = `SSTORE (${r.opcodeByte}, ${r.fork}): slot ${r.slot} goes from its current word ${r.current} to ${r.storageAfter} (${r.storageAfterHex}) — the ${r.branch} branch of EIP-2200 metering against the transaction-original word ${r.original}, on a ${cold ? "cold slot (first touch in this transaction, +2,100 included)" : "warm slot"}. Gas: ${r.totalGas}. Refund counter change: ${r.refundDelta} (the counter change this one opcode makes, before the transaction-level refund cap). The same total and refund the hub's SSTORE gas tool quotes for these values. ${tail}`;
    });

    /* TLOAD (0x5c) / TSTORE (0x5d) */
    const tstorageBtn = document.getElementById("tstorage-btn");
    if (tstorageBtn) tstorageBtn.addEventListener("click", () => {
      const r = tstorageCalc(
        document.getElementById("tstorage-op").value,
        document.getElementById("tstorage-slot").value,
        document.getElementById("tstorage-current").value,
        document.getElementById("tstorage-new").value,
        document.getElementById("tstorage-gas").value);
      const el = document.getElementById("tstorage-out");
      if (r === null) {
        el.textContent = "Check the inputs: the slot and the current value (and, for TSTORE, the new value and the gas remaining) must each be one 256-bit word, decimal or 0x hex. TLOAD reads only the slot and the current value — its other fields are not read.";
        return;
      }
      const tail = "Computed locally from the transient state you gave — nothing is executed and no chain is queried.";
      if (r.opcode === "tload") {
        el.textContent = `TLOAD (${r.opcodeByte}, ${r.fork}): pushes the current transient word of slot ${r.slot} — ${r.pushed} (${r.storageAfterHex}) — and transient storage is unchanged. Gas: ${r.totalGas} — the flat EIP-1153 charge, with no cold price (a first touch costs the same 100) and no other term — the same total the hub's transient storage gas tool quotes. The whole transient store is discarded when the transaction ends. ${tail}`;
        return;
      }
      if (r.halted === "true") {
        el.textContent = `TSTORE (${r.opcodeByte}, ${r.fork}): the frame's gas remaining, ${r.gasBefore}, is below the flat 100 charge, so the opcode halts out of gas — the only gas halt TSTORE has, because it is exempt from SSTORE's 2,300 sentry. Slot ${r.slot} keeps its current transient word ${r.current}; no gas figure applies. ${tail}`;
        return;
      }
      el.textContent = `TSTORE (${r.opcodeByte}, ${r.fork}): slot ${r.slot} goes from its current transient word ${r.current} to ${r.storageAfter} (${r.storageAfterHex}). Gas: ${r.totalGas} — the flat EIP-1153 charge whatever the values: no cold surcharge, no EIP-2200 metering, and no sentry, so this write runs at gas remaining ${r.gasBefore} even at or below 2,300 where an SSTORE would halt. Refund: 0 — transient storage never earns one (an SSTORE clear earns 4,800). The same total the hub's transient storage gas tool quotes. The whole transient store is discarded when the transaction ends. ${tail}`;
    });

    /* CALL (0xf1) / CALLCODE (0xf2) / DELEGATECALL (0xf4) / STATICCALL (0xfa) */
    const callopBtn = document.getElementById("callop-btn");
    if (callopBtn) callopBtn.addEventListener("click", () => {
      const gv = id => document.getElementById(id).value;
      const gb = id => document.getElementById(id).checked;
      const r = callCalc(
        gv("callop-op"), gv("callop-gasavail"), gv("callop-gasreq"), gv("callop-value"),
        gv("callop-caller"), gv("callop-target"), gv("callop-sender"), gv("callop-callvalue"),
        gv("callop-callerbal"), gv("callop-targetbal"), gv("callop-depth"), gv("callop-outcome"),
        gv("callop-gasused"), gv("callop-retdata"), gv("callop-memory"),
        gv("callop-inoff"), gv("callop-insize"), gv("callop-outoff"), gv("callop-outsize"),
        gb("callop-cold"), gb("callop-targetempty"), gb("callop-hascode"), gb("callop-static"));
      const el = document.getElementById("callop-out");
      if (r === null) {
        el.textContent = "Check the inputs: addresses must be 0x followed by 40 hex characters; gas, value, balances, depth, offsets and sizes must each be one 256-bit word, decimal or 0x hex; memory and return data even-length hex of at most 4,096 bytes, and a non-empty region must end within 4,096 bytes; the child may not use more gas than its allowance. For CALL the target cannot be both empty and coded, nor empty with a balance. Fields an opcode never reads (the value for DELEGATECALL / STATICCALL, the inherited sender and value for the others) cannot fail the check.";
        return;
      }
      const tail = "Computed locally from the state you gave — nothing is executed and no chain is queried.";
      const ctx = `The child frame runs at ${r.childAddress} with sender ${r.childSender}, value ${r.childValue}${r.childStatic === "true" ? ", in a static frame" : ""}.`;
      if (r.halted === "true") {
        el.textContent = `${r.opcode.toUpperCase()} (${r.opcodeByte}, ${r.fork}): the frame's gas remaining is below this call's own cost of ${r.baseGas} (the total the hub's CALL-family gas tools quote for these values), so the opcode halts the calling frame exceptionally — no success word is pushed, no gas figure applies, and nothing moves. ${tail}`;
        return;
      }
      if (r.outcome === "failed") {
        const why = r.failReason === "depth"
          ? "the call depth is at the 1,024 limit, so no child frame may be created"
          : r.failReason === "static"
            ? "the calling frame is static and this call carries value, which a static frame may not move"
            : "the caller's balance is below the value this call carries";
        el.textContent = `${r.opcode.toUpperCase()} (${r.opcodeByte}, ${r.fork}): the call fails softly — ${why} — so the opcode pushes 0, forwards nothing, and only the base cost ${r.baseGas} is consumed (gas after: ${r.gasAfter}). Balances are unchanged and the returndata buffer is empty; memory still expands for the two regions. ${ctx} ${tail}`;
        return;
      }
      if (r.outcome === "empty") {
        el.textContent = `${r.opcode.toUpperCase()} (${r.opcodeByte}, ${r.fork}): the target has no code, so the call succeeds immediately and pushes 1 — nothing executes and none of the forwarded gas is used, so the total gas used is the base cost ${r.baseGas} alone (gas after: ${r.gasAfter}). ${r.transferred === "true" ? `The value still moves: caller ${r.callerAfter}, target ${r.targetAfter}. ` : "No value moves. "}The returndata buffer is empty. ${ctx} ${tail}`;
        return;
      }
      if (r.outcome === "callee-halt") {
        el.textContent = `${r.opcode.toUpperCase()} (${r.opcodeByte}, ${r.fork}): the child halts exceptionally, consuming its whole allowance of ${r.calleeGas} (${r.forwardedGas} forwarded plus a ${r.stipend} stipend), so the opcode pushes 0. Total gas used: ${r.gasUsed} (gas after: ${r.gasAfter}). The returndata buffer is left empty and nothing is copied into the output region; balances are unchanged — caller ${r.callerAfter}, target ${r.targetAfter}. ${ctx} ${tail}`;
        return;
      }
      if (r.outcome === "revert") {
        el.textContent = `${r.opcode.toUpperCase()} (${r.opcodeByte}, ${r.fork}): the child reverts, so the opcode pushes 0 — but the child's unused gas returns (it used ${r.calleeGasUsed} of ${r.calleeGas}), the returndata buffer holds its full ${r.returndataBytes}-byte return, and the first bytes of it are still copied into the output region (memory after: ${r.memoryAfterBytes} bytes). The state changes roll back, so balances are unchanged — caller ${r.callerAfter}, target ${r.targetAfter}. Total gas used: ${r.gasUsed} (gas after: ${r.gasAfter}). ${ctx} ${tail}`;
        return;
      }
      el.textContent = `${r.opcode.toUpperCase()} (${r.opcodeByte}, ${r.fork}): the child succeeds and the opcode pushes 1. Base cost ${r.baseGas}; forwarded ${r.forwardedGas} plus a ${r.stipend} stipend gives the child ${r.calleeGas}, of which it used ${r.calleeGasUsed} — the unused part returns, so the total gas used is ${r.gasUsed} (gas after: ${r.gasAfter}). ${r.transferred === "true" ? `The value moves: caller ${r.callerAfter}, target ${r.targetAfter}. ` : `Balances are unchanged — caller ${r.callerAfter}, target ${r.targetAfter}. `}The returndata buffer holds ${r.returndataBytes} bytes, copied into the output region up to its size (memory after: ${r.memoryAfterBytes} bytes). ${ctx} ${tail}`;
    });

    /* SHA3 (0x20) */
    const sha3opBtn = document.getElementById("sha3op-btn");
    if (sha3opBtn) sha3opBtn.addEventListener("click", () => {
      const r = sha3Calc(
        document.getElementById("sha3op-offset").value,
        document.getElementById("sha3op-size").value,
        document.getElementById("sha3op-memory").value);
      const el = document.getElementById("sha3op-out");
      if (r === null) {
        el.textContent = "Check the inputs: offset and size must each be one 256-bit word, decimal or 0x hex; memory must be even-length hex of at most 4,096 bytes; the size may be at most 4,096 and a non-empty region must end within 4,096 bytes (a zero size touches no memory, so its offset may be any word).";
        return;
      }
      const tail = "Computed locally from the memory you gave — nothing is executed and no chain is queried.";
      if (r.size === "0") {
        el.textContent = `SHA3 (${r.opcodeByte}, Frontier): a zero-size region hashes no bytes whatever its offset, so it pushes ${r.resultHex} — Keccak-256 of empty data. Gas: ${r.totalGas} — the flat 30 alone, with no word gas and no memory expansion; memory is unchanged at ${r.memoryAfterBytes} bytes. This is Ethereum's Keccak-256, not NIST SHA3-256. ${tail}`;
        return;
      }
      el.textContent = `SHA3 (${r.opcodeByte}, Frontier): pushes ${r.resultHex} — Keccak-256 of the ${r.size} byte(s) at offset ${r.offset}, ${r.hashedData} (bytes past the supplied memory read as zero). Gas: ${r.totalGas} — 30 flat + ${r.wordGas} for ${r.words} word(s) + ${r.expansionGas} of memory expansion; memory after is ${r.memoryAfterBytes} bytes (MSIZE ${r.msizeAfter}). This is Ethereum's Keccak-256, not NIST SHA3-256, whose digest of the same bytes would differ. ${tail}`;
    });

    /* CREATE / CREATE2 (0xf0 / 0xf5) */
    const createopBtn = document.getElementById("createop-btn");
    if (createopBtn) createopBtn.addEventListener("click", () => {
      const r = createCalc(
        document.getElementById("createop-op").value,
        document.getElementById("createop-gas").value,
        document.getElementById("createop-value").value,
        document.getElementById("createop-creator").value,
        document.getElementById("createop-nonce").value,
        document.getElementById("createop-salt").value,
        document.getElementById("createop-creatorbal").value,
        document.getElementById("createop-depth").value,
        document.getElementById("createop-outcome").value,
        document.getElementById("createop-used").value,
        document.getElementById("createop-deployed").value,
        document.getElementById("createop-ret").value,
        document.getElementById("createop-memory").value,
        document.getElementById("createop-off").value,
        document.getElementById("createop-size").value,
        document.getElementById("createop-tnonce").value,
        document.getElementById("createop-tbal").value,
        document.getElementById("createop-hascode").checked,
        document.getElementById("createop-static").checked);
      const el = document.getElementById("createop-out");
      if (r === null) {
        el.textContent = "Check the inputs: gas, value, nonces, balances, depth, offset and size must each be one 256-bit word, decimal or 0x hex; addresses must be exactly 40 hex characters; the salt (CREATE2 only) must be exactly 32 bytes; memory and return data must be even-length hex of at most 4,096 bytes, the deployed code at most 24,577 bytes; the initcode size may be at most 4,096 and a non-empty region must end within 4,096 bytes; the initcode gas used may not exceed the forwarded allowance.";
        return;
      }
      const tail = "Computed locally from the state you gave — no initcode is executed and no chain is queried.";
      const name = `${r.opcode.toUpperCase()} (${r.opcodeByte}, ${r.fork})`;
      if (r.outcome === "halt") {
        el.textContent = `${name}: the frame cannot even pay the upfront ${r.upfrontGas}, so the opcode itself halts out of gas — nothing is pushed, no address is created and no nonce moves. ${tail}`;
        return;
      }
      if (r.outcome === "failed") {
        const why = r.failReason === "depth"
          ? "the call depth has reached the 1,024 limit"
          : r.failReason === "static"
            ? "the calling frame is static and this creation carries value, which a static frame may not move"
            : r.failReason === "balance"
              ? "the creator's balance is below the value this creation carries"
              : "the derived account already has a non-zero nonce or code — an address collision";
        el.textContent = `${name}: creation fails softly — ${why} — so the opcode pushes 0, forwards nothing, and only the upfront ${r.upfrontGas} is consumed (gas after: ${r.gasAfter}). The derived address was ${r.targetAddress}; the creator's nonce stays at ${r.creatorNonceAfter} and no balance moves. ${tail}`;
        return;
      }
      if (r.outcome === "callee-halt") {
        el.textContent = `${name}: the initcode at ${r.targetAddress} halts exceptionally, consuming its whole forwarded allowance of ${r.forwardedGas}, so the opcode pushes 0. Total gas used: ${r.gasUsed} (gas after: ${r.gasAfter}). The creator's nonce has still incremented to ${r.creatorNonceAfter}; the endowment rolls back and the returndata buffer is empty. ${tail}`;
        return;
      }
      if (r.outcome === "revert") {
        el.textContent = `${name}: the initcode at ${r.targetAddress} reverts after using ${r.initGasUsed} of the forwarded ${r.forwardedGas}, so the opcode pushes 0 and the unused gas returns — total gas used ${r.gasUsed} (gas after: ${r.gasAfter}). The returndata buffer holds its ${r.returndataBytes}-byte revert data. The creator's nonce has still incremented to ${r.creatorNonceAfter}; the endowment rolls back, so balances are unchanged — creator ${r.creatorAfter}, derived account ${r.targetAfter}. ${tail}`;
        return;
      }
      if (r.outcome === "deposit-oog") {
        el.textContent = `${name}: the initcode at ${r.targetAddress} succeeds but leaves too little of its ${r.forwardedGas} allowance for the code deposit — it used ${r.initGasUsed} and depositing the returned code needs ${r.depositGas} — so the deposit runs out of gas, the whole allowance is consumed, and the opcode pushes 0. Total gas used: ${r.gasUsed} (gas after: ${r.gasAfter}). The creator's nonce has still incremented to ${r.creatorNonceAfter}; no code is stored and the endowment rolls back. ${tail}`;
        return;
      }
      if (r.outcome === "code-too-large") {
        el.textContent = `${name}: the initcode at ${r.targetAddress} returns code over the EIP-170 cap of 24,576 bytes, so creation fails and the whole forwarded allowance of ${r.forwardedGas} is consumed — the opcode pushes 0. Total gas used: ${r.gasUsed} (gas after: ${r.gasAfter}). The creator's nonce has still incremented to ${r.creatorNonceAfter}; no code is stored and the endowment rolls back. ${tail}`;
        return;
      }
      el.textContent = `${name}: creation succeeds and the opcode pushes the new address ${r.targetAddress}. Upfront ${r.upfrontGas} (32,000 + ${r.wordGas} for ${r.initcodeWords} initcode word(s) + ${r.memoryGas} of memory expansion); ${r.forwardedGas} was forwarded to the initcode, which used ${r.initGasUsed}, and depositing its ${r.deployedCodeBytes} byte(s) of code cost ${r.depositGas} — total gas used ${r.gasUsed} (gas after: ${r.gasAfter}). The new account sits at nonce ${r.targetNonceAfter}${r.transferred === "true" ? ` holding the endowment: creator ${r.creatorAfter}, new account ${r.targetAfter}` : ` with balance ${r.targetAfter} and no endowment moved`}; the creator's nonce is now ${r.creatorNonceAfter}. ${tail}`;
    });

    /* SELFDESTRUCT opcode calculator */
    const sdopBtn = document.getElementById("sdop-btn");
    if (sdopBtn) sdopBtn.addEventListener("click", () => {
      const r = selfdestructCalc(
        document.getElementById("sdop-gas").value,
        document.getElementById("sdop-self").value,
        document.getElementById("sdop-selfbal").value,
        document.getElementById("sdop-bene").value,
        document.getElementById("sdop-benebal").value,
        document.getElementById("sdop-benenonce").value,
        document.getElementById("sdop-hascode").checked,
        document.getElementById("sdop-cold").checked,
        document.getElementById("sdop-created").checked,
        document.getElementById("sdop-static").checked);
      const el = document.getElementById("sdop-out");
      if (r === null) {
        el.textContent = "Check the inputs: gas and both balances and the beneficiary nonce must each be one 256-bit word, decimal or 0x hex; both addresses must be exactly 40 hex characters; and a beneficiary that is the executing account itself must carry that account's own balance, have code and be warm — anything else describes an account that cannot be executing this opcode.";
        return;
      }
      const tail = "Computed locally from the state you gave — nothing is executed and no chain is queried.";
      const name = `SELFDESTRUCT (${r.opcodeByte}, ${r.fork}; EIP-6780 semantics)`;
      if (r.outcome === "halt") {
        el.textContent = r.haltReason === "static"
          ? `${name}: the frame is static and this opcode moves value, so it halts exceptionally — the frame's whole remaining gas (${r.gasUsed}) is consumed, no balance moves and nothing is deleted. ${tail}`
          : `${name}: the frame cannot pay the ${r.totalGas} this opcode costs, so it halts out of gas — the whole remaining ${r.gasUsed} is consumed, no balance moves and nothing is deleted. ${tail}`;
        return;
      }
      const gasPart = `Gas ${r.gasUsed} in total (5,000 base + ${r.accessGas} access + ${r.newAccountGas} new-account; refund ${r.refund}; gas after: ${r.gasAfter}).`;
      if (r.isSelfBeneficiary === "true") {
        el.textContent = r.deleted === "true"
          ? `${name}: the beneficiary is the account itself and it was created in this transaction, so it IS deleted at the transaction's end and its balance of ${r.burned} wei is burned — it leaves circulation and no account receives it. Balances after: the account ${r.selfAfter}. ${gasPart} ${tail}`
          : `${name}: the beneficiary is the account itself and it was NOT created in this transaction, so nothing is deleted and sending the balance to itself is a no-op — the account survives with its balance unchanged at ${r.selfAfter} wei. ${gasPart} ${tail}`;
        return;
      }
      el.textContent = `${name}: the frame terminates and the account's whole balance moves to ${r.beneficiary} — balances after: executing account ${r.selfAfter}, beneficiary ${r.beneficiaryAfter} (its nonce stays ${r.beneficiaryNonceAfter}). ${r.deleted === "true" ? "The account was created in this transaction, so it IS deleted at the transaction's end — code, storage and nonce cleared then, not before." : "The account was NOT created in this transaction, so it is NOT deleted — only the balance moved and the account survives intact (EIP-6780)."} ${gasPart} ${tail}`;
    });

    /* LOG opcode calculator */
    const logopBtn = document.getElementById("logop-btn");
    if (logopBtn) logopBtn.addEventListener("click", () => {
      const r = logCalc(
        document.getElementById("logop-op").value,
        document.getElementById("logop-gas").value,
        document.getElementById("logop-self").value,
        document.getElementById("logop-offset").value,
        document.getElementById("logop-size").value,
        document.getElementById("logop-topic0").value,
        document.getElementById("logop-topic1").value,
        document.getElementById("logop-topic2").value,
        document.getElementById("logop-topic3").value,
        document.getElementById("logop-memory").value,
        document.getElementById("logop-static").checked);
      const el = document.getElementById("logop-out");
      if (r === null) {
        el.textContent = "Check the inputs: gas, offset and size must each be one 256-bit word, decimal or 0x hex; the executing account must be exactly 40 hex characters; each topic the chosen opcode actually reads must be one 256-bit word; and the memory must be even-length hex — the memory, the size and a non-empty region's end are each capped at 4,096 bytes. Topics beyond the opcode's count are never read, so their contents cannot cause this refusal.";
        return;
      }
      const tail = "Computed locally from the state you gave — nothing is executed and no chain is queried.";
      const name = `${r.opcode.toUpperCase()} (${r.opcodeByte}, Frontier)`;
      const gasPart = `Gas ${r.totalGas} in total (375 base + ${r.topicGas} for its ${r.topicCount} topic(s) + ${r.dataGas} for the data bytes + ${r.memoryGas} of memory expansion).`;
      if (r.outcome === "halt") {
        el.textContent = r.haltReason === "static"
          ? `${name}: the frame is static and a log record is a state write, so the opcode halts exceptionally — the frame's whole remaining gas (${r.gasUsed}) is consumed, no record is appended and memory is unchanged. The opcode would have cost ${r.totalGas}. ${tail}`
          : `${name}: the frame cannot pay the ${r.totalGas} this opcode costs, so it halts out of gas — the whole remaining ${r.gasUsed} is consumed, no record is appended and memory is unchanged. ${tail}`;
        return;
      }
      const topicPart = r.topicCount === "0" ? "no topics" : `topic(s) ${r.topics.split(",").join(", ")}`;
      el.textContent = `${name}: one log record is appended under the executing account ${r.address} with ${topicPart} and data ${r.data} (${r.dataBytes} byte(s) read from memory at offset ${document.getElementById("logop-offset").value.trim()}; memory now ${r.memoryAfterBytes} byte(s), size ${r.msizeAfter}). Gas used ${r.gasUsed} (gas after: ${r.gasAfter}). ${gasPart} ${tail}`;
    });

    /* Halting opcode calculator */
    const haltopBtn = document.getElementById("haltop-btn");
    if (haltopBtn) haltopBtn.addEventListener("click", () => {
      const r = haltCalc(
        document.getElementById("haltop-op").value,
        document.getElementById("haltop-gas").value,
        document.getElementById("haltop-offset").value,
        document.getElementById("haltop-size").value,
        document.getElementById("haltop-memory").value);
      const el = document.getElementById("haltop-out");
      if (r === null) {
        el.textContent = "Check the inputs: the gas (and, for RETURN/REVERT, the offset and size) must each be one 256-bit word, decimal or 0x hex, and the memory even-length hex — the memory, the size and a non-empty region's end are each capped at 4,096 bytes. STOP and INVALID never read the offset, size or memory fields, so their contents cannot cause this refusal.";
        return;
      }
      const tail = "Computed locally from the state you gave — nothing is executed and no chain is queried.";
      const name = `${r.opcode.toUpperCase()} (${r.opcodeByte}, ${r.fork})`;
      if (r.outcome === "stopped") {
        el.textContent = `${name}: the frame halts successfully at no cost — gas used 0 (gas after: ${r.gasAfter}), no data is returned and the frame's state changes are kept. ${tail}`;
        return;
      }
      if (r.outcome === "halt" && r.haltReason === "invalid") {
        el.textContent = `${name}: executing the designated invalid instruction halts the frame exceptionally — its whole remaining gas (${r.gasUsed}) is consumed by design, no data is returned and the frame's state changes are rolled back. ${tail}`;
        return;
      }
      if (r.outcome === "halt") {
        el.textContent = `${name}: the memory expansion this region needs (${r.totalGas}) exceeds the frame's remaining gas, so the frame halts exceptionally — the whole remaining ${r.gasUsed} is consumed, no data is returned, the state changes are rolled back and memory is unchanged. ${tail}`;
        return;
      }
      el.textContent = r.outcome === "returned"
        ? `${name}: the frame halts successfully and returns ${r.returnedBytes} byte(s) from memory — ${r.returnedData} — and its state changes are kept. Gas used ${r.gasUsed}, the memory-expansion increase alone (RETURN has no flat cost; gas after: ${r.gasAfter}). ${tail}`
        : `${name}: the frame halts and rolls its state changes back, but still returns ${r.returnedBytes} byte(s) from memory — ${r.returnedData} — as the revert data its caller reads, and its unused gas is returned: gas used ${r.gasUsed}, the memory-expansion increase alone (gas after: ${r.gasAfter}). ${tail}`;
    });

    /* MCOPY opcode calculator */
    const mcopyopBtn = document.getElementById("mcopyop-btn");
    if (mcopyopBtn) mcopyopBtn.addEventListener("click", () => {
      const r = mcopyCalc(
        document.getElementById("mcopyop-gas").value,
        document.getElementById("mcopyop-dst").value,
        document.getElementById("mcopyop-src").value,
        document.getElementById("mcopyop-size").value,
        document.getElementById("mcopyop-memory").value);
      const el = document.getElementById("mcopyop-out");
      if (r === null) {
        el.textContent = "Check the inputs: the gas, destination, source and size must each be one 256-bit word, decimal or 0x hex, and the memory even-length hex — the memory, the size and a non-empty copy's larger region end are each capped at 4,096 bytes.";
        return;
      }
      const tail = "Computed locally from the state you gave — nothing is executed and no chain is queried.";
      if (r.outcome === "halt") {
        el.textContent = `MCOPY (0x5e, Cancun): the frame cannot pay the ${r.totalGas} this copy costs, so it halts out of gas — the whole remaining ${r.gasUsed} is consumed and memory is unchanged. ${tail}`;
        return;
      }
      el.textContent = `MCOPY (0x5e, Cancun): ${r.copiedBytes} byte(s) copied from offset ${r.src} to offset ${r.dst} within the same memory — ${r.copiedData} — copied as if through an intermediate buffer, so an overlapping destination receives the original bytes. Memory is now ${r.memoryAfterBytes} byte(s) (size ${r.msizeAfter}): ${r.memoryAfter}. Gas used ${r.gasUsed} (3 base + ${r.wordGas} for the copied words + ${r.expansionGas} of memory expansion; gas after: ${r.gasAfter}). ${tail}`;
    });

    /* EIP-4844 blob versioned hash */
    const vhashBtn = document.getElementById("vhash-btn");
    if (vhashBtn) vhashBtn.addEventListener("click", () => {
      const r = blobVersionedHash(document.getElementById("vhash-commitment").value);
      const el = document.getElementById("vhash-out");
      el.textContent = r === null
        ? "Enter the blob's KZG commitment as exactly 48 bytes of hex (0x + 96 hex characters) — the commitment from the blob sidecar, not the 32-byte versioned hash itself and not a KZG proof."
        : `Blob versioned hash: ${r} — 0x01 (the KZG version byte) followed by bytes 1–31 of SHA-256 of the commitment. This is the value a type 3 transaction carries in blob_versioned_hashes and the BLOBHASH opcode returns. Derived locally — no chain queried, no KZG proof checked.`;
    });
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseScaled, formatScaled, convertUnit, keccak256, keccak256Bytes, parseHexBytes, toChecksumAddress, inspectAddress, gasEstimate, normalizeSignature, functionSelector, eventTopic, create2Address, uniswapPoolAddress, uniswapV2Quote, uniswapV2Mint, uniswapV2Burn, V2_MINIMUM_LIQUIDITY, erc4626Convert, compoundCToken, compoundAccrue, compoundSnapshot, compoundRateModel, compoundSeizeTokens, compoundLiquidity, compoundLiquidateAllowed, compoundBorrowAllowed, compoundRedeemAllowed, compoundTransferAllowed, compoundExitMarket, aaveAccountCalc, aaveInterestCalc, aaveLiquidationCalc, modexpGas, modexpCalc, sstoreGas, memoryGas, callGasCalc, createGasCalc, logGasCalc, sha3GasCalc, copyGasCalc, mcopyGasCalc, extCodeCopyGasCalc, accountAccessGasCalc, sloadGasCalc, transientGasCalc, otherCallGasCalc, selfdestructGasCalc, precompileGasCalc, origPrecompileCalc, ripemd160Bytes, bn128GasCalc, bn128Calc, bn128PairingCalc, blake2fGasCalc, blake2fCalc, kzgGasCalc, blsGasCalc, blsG1Calc, blsG2Calc, blsMsmCalc, blsMapG1Calc, blsMapG2Calc, blsPairingCalc, kzgPointEvalCalc, p256GasCalc, p256VerifyCalc, clzCalc, expCalc, signExtendCalc, shiftCalc, modMathCalc, byteCalc, divCalc, cmpCalc, bitCalc, arithCalc, pushCalc, stackCalc, jumpdestCalc, disasmCalc, memCalc, cdCalc, rdCalc, codeCalc, envCalc, blockhashCalc, execCalc, extcodeCalc, extcopyCalc, jumpCalc, storageCalc, tstorageCalc, callCalc, sha3Calc, createCalc, selfdestructCalc, logCalc, haltCalc, mcopyCalc, permitDigest, EIP2612_PERMIT_TYPEHASH, uniswapV3Tick, uniswapV3Liquidity, uniswapV3SwapStep, V3_MIN_TICK, V3_MAX_TICK, V3_MIN_SQRT, V3_MAX_SQRT, UNISWAP_V2_FACTORY, UNISWAP_V3_FACTORY, UNISWAP_V2_INIT_CODE_HASH, UNISWAP_V3_INIT_CODE_HASH, rlpEncodeBytes, createAddress, utf8Bytes, labelhash, namehash, eip712DomainSeparator, EIP712_DOMAIN_TYPEHASH, eip712HashPerson, eip712MailDigest, EIP712_PERSON_TYPEHASH, EIP712_MAIL_TYPEHASH, erc1967Slot, erc7201Slot, ERC1967_LABELS, abiEncodeCall, abiDecodeCall, abiParseType, abiCanonicalType, merkleLeafHash, merkleRoot, merkleProof, merkleVerify, rlpEncodeInput, rlpDecodeInput, rlpRenderValue, decodeRawTransaction, encodeRawTransaction, recoverAddress, eip191Digest, personalDigestCalc, verifyPersonalSignature, verify712MailSignature, verifyPermitSignature, recoverTransactionSender, eip7702AuthorizationDigest, authorizationDigestCalc, verify7702Authorization, fakeExponential, blobFeeCalc, BLOB_SCHEDULES, nextBaseFee, sha256Bytes, blobVersionedHash, intrinsicGas, UNIT_DECIMALS };
}
