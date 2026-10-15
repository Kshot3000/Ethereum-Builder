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
  module.exports = { parseScaled, formatScaled, convertUnit, keccak256, keccak256Bytes, parseHexBytes, toChecksumAddress, inspectAddress, gasEstimate, normalizeSignature, functionSelector, eventTopic, create2Address, uniswapPoolAddress, uniswapV2Quote, uniswapV2Mint, uniswapV2Burn, V2_MINIMUM_LIQUIDITY, erc4626Convert, compoundCToken, compoundAccrue, compoundSnapshot, compoundRateModel, compoundSeizeTokens, compoundLiquidity, uniswapV3Tick, uniswapV3Liquidity, uniswapV3SwapStep, V3_MIN_TICK, V3_MAX_TICK, V3_MIN_SQRT, V3_MAX_SQRT, UNISWAP_V2_FACTORY, UNISWAP_V3_FACTORY, UNISWAP_V2_INIT_CODE_HASH, UNISWAP_V3_INIT_CODE_HASH, rlpEncodeBytes, createAddress, utf8Bytes, labelhash, namehash, eip712DomainSeparator, EIP712_DOMAIN_TYPEHASH, eip712HashPerson, eip712MailDigest, EIP712_PERSON_TYPEHASH, EIP712_MAIL_TYPEHASH, erc1967Slot, erc7201Slot, ERC1967_LABELS, abiEncodeCall, abiDecodeCall, abiParseType, abiCanonicalType, merkleLeafHash, merkleRoot, merkleProof, merkleVerify, rlpEncodeInput, rlpDecodeInput, rlpRenderValue, decodeRawTransaction, recoverAddress, eip191Digest, verifyPersonalSignature, verify712MailSignature, recoverTransactionSender, eip7702AuthorizationDigest, fakeExponential, blobFeeCalc, BLOB_SCHEDULES, nextBaseFee, sha256Bytes, blobVersionedHash, intrinsicGas, UNIT_DECIMALS };
}
