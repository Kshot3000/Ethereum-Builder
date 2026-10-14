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
  module.exports = { parseScaled, formatScaled, convertUnit, keccak256, keccak256Bytes, parseHexBytes, toChecksumAddress, inspectAddress, gasEstimate, normalizeSignature, functionSelector, eventTopic, create2Address, utf8Bytes, labelhash, namehash, UNIT_DECIMALS };
}
