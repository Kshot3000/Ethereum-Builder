"use strict";
/* Ethereum Builder site tests — run: node tests/test-site.js */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const guide = fs.readFileSync(path.join(root, "guides", "getting-started.md"), "utf8");
const app = require(path.join(root, "app.js"));

const ETH = "0x4b48c98cd9d99d00dafe5cc4bb9e965345c5b15a";
let failures = 0;
let total = 0;
function check(name, cond) {
  total++;
  console.log((cond ? "PASS" : "FAIL") + " " + name);
  if (!cond) failures++;
}

/* attribution on every user-facing surface */
for (const [label, doc] of [["index.html", html], ["README", readme], ["guide", guide]]) {
  check("ETH donation address in " + label, doc.includes(ETH));
  check("@kshot9000 in " + label, doc.includes("@kshot9000"));
}
check("no other Kyle ETH address leaks into hub", ![html, readme, guide].some(d =>
  d.includes("0x4b6f3BC697D9dAF3e8dE182aEc56eD208B9087f1") ||
  d.includes("0xA1d3CEB7bD707847c3c6aB59d30D385FE8DD85Fc") ||
  d.includes("0x3fa2f4d9463b516e835ff2d8c3b04663a35830e5")));
check("honesty line in index.html", html.includes("not affiliated with the Ethereum Foundation, Base, Uniswap, or Robinhood"));
check("honesty line in README", readme.includes("not affiliated with the Ethereum Foundation, Base, Uniswap, or Robinhood"));
check("model labelled not live data in index.html", html.includes("not live data") || html.includes("not live network data"));
check("not financial advice in index.html", html.includes("financial advice"));

/* verified team tags present */
for (const tag of ["@ethereum", "@base", "@Uniswap", "@robinhood"]) {
  check("GitHub team tag present: " + tag, html.includes(tag) || readme.includes(tag));
}
for (const x of ["https://x.com/ethereum", "https://x.com/base", "https://x.com/Uniswap", "https://x.com/unichain", "https://x.com/RobinhoodApp"]) {
  check("X handle linked: " + x, html.includes(x) || guide.includes(x));
}

/* structure */
check("exactly one <h1>", (html.match(/<h1[ >]/g) || []).length === 1);
check("has <main> landmark", /<main[\s>]/.test(html));
check("all tool controls labelled",
  ["conv-value", "conv-from", "conv-to", "addr-input", "gas-units", "gas-base", "gas-priority", "sig-input", "sig-preset", "c2-deployer", "c2-salt", "c2-init", "ens-input"]
    .every(id => html.includes(`for="${id}"`)));
check("cache keys current", html.includes("styles.css?v=1") && html.includes("app.js?v=4"));
check("filters present", ["all", "l1", "base", "unichain", "robinhood", "kyle"].every(f => html.includes(`data-filter="${f}"`)));

/* catalogue links (all verified HTTP 200 at launch) */
for (const url of [
  "https://ethereum.org",
  "https://github.com/wevm/viem",
  "https://github.com/wevm/viem/pull/5176",
  "https://github.com/wevm/viem/pull/5196",
  "https://viem.sh",
  "https://github.com/paradigmxyz/reth",
  "https://github.com/ChainSafe/lodestar",
  "https://github.com/OffchainLabs/prysm",
  "https://github.com/ethereum-optimism/optimism",
  "https://github.com/ethers-io/ethers.js",
  "https://github.com/ethereum/ERCs",
  "https://www.base.org",
  "https://docs.base.org",
  "https://github.com/pearl-research-labs/pearl/issues/347",
  "https://www.unichain.org",
  "https://robinhood.com/us/en/chain/",
  "https://docs.robinhood.com/chain"
]) {
  check("catalogue/guide link present: " + url, html.includes(url) || guide.includes(url));
}
check("wPRL labelled testnet proposal", html.includes("testnet proposal") && html.includes("Base Sepolia"));

/* Keccak-256 known vectors */
check("keccak256('') known vector", app.keccak256("") === "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
check("keccak256('hello world') known vector", app.keccak256("hello world") === "47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad");

/* EIP-55 official test vectors */
const vectors = [
  "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
  "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
  "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
  "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb"
];
for (const v of vectors) {
  check("EIP-55 checksum from lowercase: " + v, app.toChecksumAddress(v.toLowerCase()) === v);
  check("EIP-55 checksum validates: " + v, app.inspectAddress(v).checksumValid === true);
}
check("Kyle's ETH address well-formed", app.inspectAddress(ETH).valid === true);
check("Kyle's ETH address checksummed form is stable", app.toChecksumAddress(app.toChecksumAddress(ETH)) === app.toChecksumAddress(ETH));
check("bad address rejected", app.inspectAddress("0x123").valid === false && app.toChecksumAddress("xyz") === null);
check("tampered checksum flagged", (() => {
  const c = app.toChecksumAddress(ETH);
  const tampered = c.replace(/([a-f])/, m => m.toUpperCase() === m ? m.toLowerCase() : m.toUpperCase());
  return tampered !== c ? app.inspectAddress(tampered).checksumValid === false : true;
})());

/* wei converter exactness */
check("1 ETH = 1e18 wei", app.convertUnit("1", "eth", "wei") === "1000000000000000000");
check("1 ETH = 1e9 gwei", app.convertUnit("1", "eth", "gwei") === "1000000000");
check("1.5 ETH = 1500000000 gwei", app.convertUnit("1.5", "eth", "gwei") === "1500000000");
check("21000 gwei = 0.000021 ETH", app.convertUnit("21000", "gwei", "eth") === "0.000021");
check("1 wei = 0.000000001 gwei", app.convertUnit("1", "wei", "gwei") === "0.000000001");
check("smallest ETH unit exact", app.convertUnit("0.000000000000000001", "eth", "wei") === "1");
check("too many decimals rejected", app.convertUnit("0.0000000000000000001", "eth", "wei") === null);
check("garbage rejected", app.convertUnit("1e3", "eth", "wei") === null && app.convertUnit("-1", "eth", "wei") === null);
check("round trip ETH->wei->ETH", app.convertUnit(app.convertUnit("3.14159", "eth", "wei"), "wei", "eth") === "3.14159");

/* EIP-1559 estimator math */
const g1 = app.gasEstimate("21000", "12", "1.5");
check("gas: effective price 13.5 gwei", g1 && g1.effectiveGwei === "13.5");
check("gas: expected 21000*13.5gwei = 0.0002835 ETH", g1 && g1.expectedEth === "0.0002835");
check("gas: max fee 25.5 gwei", g1 && g1.maxFeeGwei === "25.5");
check("gas: max 21000*25.5gwei = 0.0005355 ETH", g1 && g1.maxEth === "0.0005355");
const g2 = app.gasEstimate("100000", "30", "2");
check("gas: 100k at 32 gwei = 0.0032 ETH", g2 && g2.expectedEth === "0.0032");
check("gas: invalid input rejected", app.gasEstimate("x", "12", "1") === null && app.gasEstimate("21000", "12.1234567891", "1") === null);

/* function selectors — canonical ERC-20 / ERC-721 vectors */
for (const [sig, sel] of [
  ["transfer(address,uint256)", "0xa9059cbb"],
  ["transferFrom(address,address,uint256)", "0x23b872dd"],
  ["approve(address,uint256)", "0x095ea7b3"],
  ["balanceOf(address)", "0x70a08231"],
  ["allowance(address,address)", "0xdd62ed3e"],
  ["totalSupply()", "0x18160ddd"],
  ["name()", "0x06fdde03"],
  ["symbol()", "0x95d89b41"],
  ["decimals()", "0x313ce567"]
]) {
  check("selector " + sig, app.functionSelector(sig) === sel);
}
check("selector tolerates user whitespace", app.functionSelector("transfer(address, uint256)") === "0xa9059cbb");
check("event topic Transfer", app.eventTopic("Transfer(address,address,uint256)") === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
check("event topic Approval", app.eventTopic("Approval(address,address,uint256)") === "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925");
check("selector is topic prefix", app.eventTopic("transfer(address,uint256)").startsWith(app.functionSelector("transfer(address,uint256)")));
check("bad signatures rejected",
  app.functionSelector("") === null &&
  app.functionSelector("transfer") === null &&
  app.functionSelector("transfer(") === null &&
  app.functionSelector("transfer(address,,uint256)") === null &&
  app.functionSelector("transfer(address,uint256) returns (bool)") === null &&
  app.eventTopic("9lives(address)") === null);
check("array types accepted", app.functionSelector("batch(address[],uint256[])") !== null);

/* CREATE2 — all seven official EIP-1014 examples, expected results verbatim from the EIP */
const ZERO32 = "0x" + "00".repeat(32);
for (const [label, deployer, salt, init, expected] of [
  ["example 0", "0x0000000000000000000000000000000000000000", ZERO32, "0x00", "0x4D1A2e2bB4F88F0250f26Ffff098B0b30B26BF38"],
  ["example 1", "0xdeadbeef00000000000000000000000000000000", ZERO32, "0x00", "0xB928f69Bb1D91Cd65274e3c79d8986362984fDA3"],
  ["example 2", "0xdeadbeef00000000000000000000000000000000", "0x000000000000000000000000feed000000000000000000000000000000000000", "0x00", "0xD04116cDd17beBE565EB2422F2497E06cC1C9833"],
  ["example 3", "0x0000000000000000000000000000000000000000", ZERO32, "0xdeadbeef", "0x70f2b2914A2a4b783FaEFb75f459A580616Fcb5e"],
  ["example 4", "0x00000000000000000000000000000000deadbeef", "0x00000000000000000000000000000000000000000000000000000000cafebabe", "0xdeadbeef", "0x60f3f640a8508fC6a86d45DF051962668E1e8AC7"],
  ["example 5", "0x00000000000000000000000000000000deadbeef", "0x00000000000000000000000000000000000000000000000000000000cafebabe", "0x" + "deadbeef".repeat(11), "0x1d8bfDC5D46DC4f61D6b6115972536eBE6A8854C"],
  ["example 6 (empty init code)", "0x0000000000000000000000000000000000000000", ZERO32, "0x", "0xE33C0C7F7df4809055C3ebA6c09CFe4BaF1BD9e0"]
]) {
  check("CREATE2 EIP-1014 " + label, app.create2Address(deployer, salt, init) === expected);
}
check("CREATE2 result is a valid checksummed address", app.inspectAddress(app.create2Address("0x0000000000000000000000000000000000000000", ZERO32, "0x00")).checksumValid === true);
check("CREATE2 rejects short deployer / short salt / odd-length init / non-hex",
  app.create2Address("0x123", ZERO32, "0x00") === null &&
  app.create2Address("0x0000000000000000000000000000000000000000", "0x00", "0x00") === null &&
  app.create2Address("0x0000000000000000000000000000000000000000", ZERO32, "0x0") === null &&
  app.create2Address("0x0000000000000000000000000000000000000000", ZERO32, "0xzz") === null);
check("keccak256Bytes matches keccak256 on ASCII bytes",
  app.keccak256Bytes([104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100]) === app.keccak256("hello world"));
check("keccak256Bytes of empty input is the empty-hash vector",
  app.keccak256Bytes([]) === "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
check("CREATE2 tool section present in index.html", html.includes("c2-btn") && html.includes("EIP-1014"));

/* ENS namehash — official EIP-137 test vectors, verbatim */
check("namehash('') is the root node", app.namehash("") === "0x0000000000000000000000000000000000000000000000000000000000000000");
check("namehash('eth') EIP-137 vector", app.namehash("eth") === "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae");
check("namehash('foo.eth') EIP-137 vector", app.namehash("foo.eth") === "0xde9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f");
check("labelhash('eth') folds to namehash('eth')", (() => {
  const lh = app.labelhash("eth");
  if (lh === null) return false;
  const labelBytes = [];
  for (let i = 2; i < lh.length; i += 2) labelBytes.push(parseInt(lh.substr(i, 2), 16));
  const folded = "0x" + app.keccak256Bytes([...new Array(32).fill(0), ...labelBytes]);
  return folded === app.namehash("eth");
})());
check("namehash is case-insensitive (lowercased before hashing)", app.namehash("FOO.ETH") === app.namehash("foo.eth"));
check("namehash tolerates surrounding whitespace", app.namehash("  foo.eth ") === app.namehash("foo.eth"));
check("namehash rejects empty labels / bad names",
  app.namehash(".eth") === null &&
  app.namehash("foo..eth") === null &&
  app.namehash("foo.") === null &&
  app.namehash("foo eth") === null &&
  app.namehash("foo.eth!") === null &&
  app.namehash(null) === null);
check("namehash rejects non-ASCII labels instead of mis-hashing (no UTS-46)",
  app.namehash("exämple.eth") === null && app.labelhash("bücher") === null);
check("utf8Bytes ASCII matches char codes", app.utf8Bytes("eth").join(",") === "101,116,104");
check("ENS tool section present in index.html", html.includes("ens-btn") && html.includes("EIP-137"));

console.log(`\n${total - failures}/${total} checks passed`);
process.exit(failures ? 1 : 0);
