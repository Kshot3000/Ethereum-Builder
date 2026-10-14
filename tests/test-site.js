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
  ["conv-value", "conv-from", "conv-to", "addr-input", "gas-units", "gas-base", "gas-priority", "sig-input", "sig-preset", "c2-deployer", "c2-salt", "c2-init", "create-sender", "create-nonce", "ens-input", "dom712-name", "dom712-version", "dom712-chain", "dom712-contract", "m712-dname", "m712-dversion", "m712-dchain", "m712-dcontract", "m712-from-name", "m712-from-wallet", "m712-to-name", "m712-to-wallet", "m712-contents", "slot-kind", "slot-ns", "abi-sig", "abi-args", "dec-sig", "dec-data"]
    .every(id => html.includes(`for="${id}"`)));
check("all tool controls labelled (merkle)",
  ["mrk-leaves", "mrk-index"].every(id => html.includes(`for="${id}"`)));
check("cache keys current", html.includes("styles.css?v=2") && html.includes("app.js?v=11"));
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

/* CREATE address — the long-published worked example for
   keccak256(rlp([sender, nonce]))[12:]: sender 0x6ac7…dbf0, nonces 0–3.
   Expected values verbatim (shown here in their EIP-55 checksummed form).
   The RLP byte-string encoder is also checked against the encoding
   examples from the RLP specification itself. */
const CREATE_SENDER = "0x6ac7ea33f8831ea9dcc53393aaa88b25a785dbf0";
for (const [nonce, expected] of [
  ["0", "0xcd234A471b72ba2F1Ccf0A70FCABA648a5eeCD8d"],
  ["1", "0x343c43A37D37dfF08AE8C4A11544c718AbB4fCF8"],
  ["2", "0xf778B86FA74E846c4f0a1fBd1335FE81c00a0C91"],
  ["3", "0xffFd933A0bC612844eaF0C6Fe3E5b8E9B6C1d19c"]
]) {
  check("CREATE published vector nonce " + nonce, app.createAddress(CREATE_SENDER, nonce) === expected);
}
check("CREATE result is a valid checksummed address", app.inspectAddress(app.createAddress(CREATE_SENDER, "0")).checksumValid === true);
check("CREATE sender is case-insensitive", app.createAddress(CREATE_SENDER.toUpperCase().replace("0X", "0x"), "0") === app.createAddress(CREATE_SENDER, "0"));
check("CREATE nonce trims whitespace and accepts leading zeros",
  app.createAddress(CREATE_SENDER, " 007 ") === app.createAddress(CREATE_SENDER, "7"));
check("CREATE address changes with nonce",
  app.createAddress(CREATE_SENDER, "4") !== app.createAddress(CREATE_SENDER, "5"));
check("CREATE accepts a large in-range nonce (2^255)",
  app.createAddress(CREATE_SENDER, (2n ** 255n).toString()) !== null);
check("CREATE rejects bad senders / bad nonces",
  app.createAddress("0x123", "0") === null &&
  app.createAddress("not-an-address", "0") === null &&
  app.createAddress(CREATE_SENDER, "") === null &&
  app.createAddress(CREATE_SENDER, "-1") === null &&
  app.createAddress(CREATE_SENDER, "1.5") === null &&
  app.createAddress(CREATE_SENDER, "0x10") === null &&
  app.createAddress(CREATE_SENDER, (2n ** 256n).toString()) === null);
check("RLP spec example: 'dog' encodes to 0x83646f67",
  app.rlpEncodeBytes([0x64, 0x6f, 0x67]).map(b => b.toString(16).padStart(2, "0")).join("") === "83646f67");
check("RLP spec example: 1024 encodes to 0x820400, empty string to 0x80",
  app.rlpEncodeBytes([0x04, 0x00]).map(b => b.toString(16).padStart(2, "0")).join("") === "820400" &&
  app.rlpEncodeBytes([]).map(b => b.toString(16).padStart(2, "0")).join("") === "80");
check("CREATE tool section present in index.html", html.includes("create-btn") && html.includes("CREATE address calculator"));

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

/* EIP-712 domain separator — the spec's own Ether Mail example domain.
   Type hash and separator are the published values for that example. */
const MAIL_CONTRACT = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC";
check("EIP-712 domain type hash is the canonical constant",
  app.EIP712_DOMAIN_TYPEHASH === "0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f");
check("EIP-712 Ether Mail example domain separator",
  app.eip712DomainSeparator("Ether Mail", "1", "1", MAIL_CONTRACT) === "0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f");
check("EIP-712 separator is checksummed-address case-insensitive",
  app.eip712DomainSeparator("Ether Mail", "1", "1", MAIL_CONTRACT.toLowerCase()) === "0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f");
check("EIP-712 separator trims surrounding whitespace on inputs",
  app.eip712DomainSeparator("  Ether Mail ", " 1 ", " 1 ", " " + MAIL_CONTRACT + " ") === "0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f");
check("EIP-712 separator changes with chain ID (Base 8453 differs from L1 1)",
  app.eip712DomainSeparator("Ether Mail", "1", "8453", MAIL_CONTRACT) !== null &&
  app.eip712DomainSeparator("Ether Mail", "1", "8453", MAIL_CONTRACT) !== app.eip712DomainSeparator("Ether Mail", "1", "1", MAIL_CONTRACT));
check("EIP-712 accepts a very large in-range chain ID (2^255)",
  app.eip712DomainSeparator("Ether Mail", "1", (2n ** 255n).toString(), MAIL_CONTRACT) !== null);
check("EIP-712 rejects empty name / empty version",
  app.eip712DomainSeparator("", "1", "1", MAIL_CONTRACT) === null &&
  app.eip712DomainSeparator("Ether Mail", "  ", "1", MAIL_CONTRACT) === null &&
  app.eip712DomainSeparator(null, "1", "1", MAIL_CONTRACT) === null);
check("EIP-712 rejects bad chain IDs (0, negative, decimal, hex, >= 2^256)",
  app.eip712DomainSeparator("Ether Mail", "1", "0", MAIL_CONTRACT) === null &&
  app.eip712DomainSeparator("Ether Mail", "1", "-1", MAIL_CONTRACT) === null &&
  app.eip712DomainSeparator("Ether Mail", "1", "1.5", MAIL_CONTRACT) === null &&
  app.eip712DomainSeparator("Ether Mail", "1", "0x1", MAIL_CONTRACT) === null &&
  app.eip712DomainSeparator("Ether Mail", "1", (2n ** 256n).toString(), MAIL_CONTRACT) === null);
check("EIP-712 rejects a malformed verifying contract",
  app.eip712DomainSeparator("Ether Mail", "1", "1", "0x123") === null &&
  app.eip712DomainSeparator("Ether Mail", "1", "1", "not-an-address") === null);
check("EIP-712 tool section present in index.html", html.includes("dom712-btn") && html.includes("EIP-712"));

/* EIP-712 typed-data digest — the Ether Mail example from the EIP's own
   Example.js: Mail/Person type hashes, hashStruct(Mail) and the final
   signable digest are the published values for that example. */
const COW = "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826";
const BOB = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
const mailArgs = ["Ether Mail", "1", "1", MAIL_CONTRACT, "Cow", COW, "Bob", BOB, "Hello, Bob!"];
const md = app.eip712MailDigest(...mailArgs);
check("EIP-712 Person type hash matches the example implementation",
  app.EIP712_PERSON_TYPEHASH === "0xb9d8c78acf9b987311de6c7b45bb6a9c8e1bf361fa7fd3467a2163f994c79500");
check("EIP-712 Mail type hash matches the example implementation",
  app.EIP712_MAIL_TYPEHASH === "0xa0cedeb2dc280ba39b857546d74f5549c3a1d7bdc2dd96bf881f76108e23dac2");
check("EIP-712 hashStruct(Person Cow) appears in the published encodeData",
  app.eip712HashPerson("Cow", COW) === "0xfc71e5fa27ff56c350aa531bc129ebdf613b772b6604664f5d8dbe21b85eb0c8");
check("EIP-712 Ether Mail domain separator carried through",
  md !== null && md.domainSeparator === "0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f");
check("EIP-712 Ether Mail hashStruct(Mail) published value",
  md !== null && md.structHash === "0xc52c0ee5d84264471806290a3f2c4cecfc5490626bf912d01f240d7a274b371e");
check("EIP-712 Ether Mail final signable digest published value",
  md !== null && md.digest === "0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2");
check("EIP-712 digest is wallet case-insensitive",
  app.eip712MailDigest("Ether Mail", "1", "1", MAIL_CONTRACT, "Cow", COW.toLowerCase(), "Bob", BOB.toLowerCase(), "Hello, Bob!").digest === md.digest);
check("EIP-712 digest changes with chain ID",
  app.eip712MailDigest("Ether Mail", "1", "8453", MAIL_CONTRACT, "Cow", COW, "Bob", BOB, "Hello, Bob!").digest !== md.digest);
check("EIP-712 contents are hashed verbatim (trailing space changes the digest)",
  app.eip712MailDigest("Ether Mail", "1", "1", MAIL_CONTRACT, "Cow", COW, "Bob", BOB, "Hello, Bob! ").digest !== md.digest);
check("EIP-712 empty contents are valid (hashed as the empty string)",
  app.eip712MailDigest("Ether Mail", "1", "1", MAIL_CONTRACT, "Cow", COW, "Bob", BOB, "") !== null);
check("EIP-712 mail digest rejects bad wallets / empty person names / bad domain",
  app.eip712MailDigest("Ether Mail", "1", "1", MAIL_CONTRACT, "Cow", "0x123", "Bob", BOB, "Hello, Bob!") === null &&
  app.eip712MailDigest("Ether Mail", "1", "1", MAIL_CONTRACT, "Cow", COW, "Bob", "not-an-address", "Hello, Bob!") === null &&
  app.eip712MailDigest("Ether Mail", "1", "1", MAIL_CONTRACT, "  ", COW, "Bob", BOB, "Hello, Bob!") === null &&
  app.eip712MailDigest("Ether Mail", "1", "0", MAIL_CONTRACT, "Cow", COW, "Bob", BOB, "Hello, Bob!") === null &&
  app.eip712MailDigest("Ether Mail", "1", "1", MAIL_CONTRACT, "Cow", COW, "Bob", BOB, null) === null);
check("EIP-712 mail tool section present in index.html", html.includes("m712-btn") && html.includes("hashStruct"));

/* Proxy & namespaced storage slots — the slot values published in ERC-1967
   (implementation / beacon / admin, plus rollback from its reference
   implementation) and ERC-7201's worked example for namespace example.main. */
check("ERC-1967 implementation slot matches the published value",
  app.erc1967Slot("implementation") === "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc");
check("ERC-1967 beacon slot matches the published value",
  app.erc1967Slot("beacon") === "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50");
check("ERC-1967 admin slot matches the published value",
  app.erc1967Slot("admin") === "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103");
check("ERC-1967 rollback slot matches the reference implementation",
  app.erc1967Slot("rollback") === "0x4910fdfa16fed3260ed0e7147f7cc6da11a60208b5b9406d12a635614ffd9143");
check("ERC-1967 the four standard slots are all distinct",
  new Set(["implementation", "beacon", "admin", "rollback"].map(k => app.erc1967Slot(k))).size === 4);
check("ERC-1967 rejects unknown kinds and non-strings",
  app.erc1967Slot("owner") === null && app.erc1967Slot("") === null && app.erc1967Slot(null) === null && app.erc1967Slot(3) === null);
check("ERC-7201 example.main slot matches the ERC's worked example",
  app.erc7201Slot("example.main") === "0x183a6125c38840424c4a85fa12bab2ab606c4b6d0e7cc73c0c06ba5300eab500");
check("ERC-7201 roots are 256-aligned (low byte zeroed by the & ~0xff mask)",
  ["example.main", "openzeppelin.storage.ERC20", "my.app.storage"].every(id => app.erc7201Slot(id).endsWith("00")));
check("ERC-7201 slot changes with the namespace ID",
  app.erc7201Slot("example.main") !== app.erc7201Slot("example.other"));
check("ERC-7201 trims surrounding whitespace on the ID",
  app.erc7201Slot("  example.main  ") === app.erc7201Slot("example.main"));
check("ERC-7201 rejects empty / whitespace-containing / non-string IDs",
  app.erc7201Slot("") === null && app.erc7201Slot("   ") === null &&
  app.erc7201Slot("two words") === null && app.erc7201Slot("exa\tmple") === null &&
  app.erc7201Slot(null) === null && app.erc7201Slot(7) === null);
check("storage slot tool section present in index.html", html.includes("slot-btn") && html.includes("ERC-7201"));

/* ABI calldata encoder — verified byte-for-byte against all five worked
   examples in the Solidity ABI specification (baz, bar, sam, f, g), whose
   published encodings are the oracles below (words composed with W). */
const W = h => h.padStart(64, "0");
const baz = app.abiEncodeCall("baz(uint32,bool)", [69, true]);
check("ABI spec example baz(uint32,bool) with (69, true), byte-for-byte",
  baz !== null && baz.selector === "0xcdcd77c0" &&
  baz.calldata === "0xcdcd77c0" + W("45") + W("1"));
const bar = app.abiEncodeCall("bar(bytes3[2])", [["abc", "def"]]);
check("ABI spec example bar(bytes3[2]) with ('abc', 'def'), byte-for-byte",
  bar !== null && bar.calldata === "0xfce353f6" + "616263" + "0".repeat(58) + "646566" + "0".repeat(58));
const sam = app.abiEncodeCall("sam(bytes,bool,uint[])", ["dave", true, [1, 2, 3]]);
check("ABI spec example sam(bytes,bool,uint256[]) with ('dave', true, [1,2,3]), byte-for-byte",
  sam !== null && sam.calldata === "0xa5643bf2" + W("60") + W("1") + W("a0") + W("4") + "64617665" + "0".repeat(56) + W("3") + W("1") + W("2") + W("3"));
check("ABI bare uint canonicalises to uint256 in the signature (sam example)",
  sam !== null && sam.canonical === "sam(bytes,bool,uint256[])");
const fabi = app.abiEncodeCall("f(uint256,uint32[],bytes10,bytes)", ["0x123", ["0x456", "0x789"], "1234567890", "Hello, world!"]);
check("ABI spec example f(uint256,uint32[],bytes10,bytes), byte-for-byte",
  fabi !== null && fabi.calldata === "0x8be65246" + W("123") + W("80") + "31323334353637383930" + "0".repeat(44) + W("e0") + W("2") + W("456") + W("789") + W("d") + "48656c6c6f2c20776f726c6421" + "0".repeat(38));
const gabi = app.abiEncodeCall("g(uint256[][],string[])", [[[1, 2], [3]], ["one", "two", "three"]]);
check("ABI spec example g(uint256[][],string[]) nested dynamics, byte-for-byte",
  gabi !== null && gabi.calldata === "0x2289b18c" + W("40") + W("140") + W("2") + W("40") + W("a0") + W("2") + W("1") + W("2") + W("1") + W("3") + W("3") + W("60") + W("a0") + W("e0") + W("3") + "6f6e65" + "0".repeat(58) + W("3") + "74776f" + "0".repeat(58) + W("5") + "7468726565" + "0".repeat(54));
check("ABI ERC-20 transfer calldata (selector tool's canonical signature)",
  app.abiEncodeCall("transfer(address,uint256)", [ETH, "1000000000000000000"]).calldata ===
  "0xa9059cbb" + "0".repeat(24) + ETH.slice(2) + W("de0b6b3a7640000"));
check("ABI bytes as 0x hex encodes identically to the same bytes as text",
  app.abiEncodeCall("sam(bytes,bool,uint256[])", ["0x64617665", true, [1, 2, 3]]).calldata === sam.calldata);
check("ABI negative int8 encodes as a sign-extended two's-complement word",
  app.abiEncodeCall("n(int8)", ["-1"]).calldata.endsWith("f".repeat(64)));
check("ABI whitespace in the signature is tolerated and canonicalised",
  app.abiEncodeCall(" baz(uint32, bool) ", [69, true]).calldata === baz.calldata);
check("ABI rejects out-of-range integers (uint32 overflow, int8 bounds, negative uint)",
  app.abiEncodeCall("baz(uint32,bool)", ["4294967296", true]) === null &&
  app.abiEncodeCall("n(int8)", ["128"]) === null &&
  app.abiEncodeCall("n(int8)", ["-129"]) === null &&
  app.abiEncodeCall("u(uint256)", ["-1"]) === null);
check("ABI rejects an unsafe JSON number instead of rounding a uint256",
  app.abiEncodeCall("u(uint256)", [9007199254740993]) === null);
check("ABI rejects wrong arity / non-bool bool / bad address / wrong fixed-array length",
  app.abiEncodeCall("baz(uint32,bool)", [69]) === null &&
  app.abiEncodeCall("baz(uint32,bool)", [69, "true"]) === null &&
  app.abiEncodeCall("t(address)", ["0x123"]) === null &&
  app.abiEncodeCall("bar(bytes3[2])", [["abc"]]) === null &&
  app.abiEncodeCall("bar(bytes3[2])", [["abcd", "def"]]) === null);
check("ABI rejects unsupported types (tuples, fixed-point, bad bit sizes, bytes33)",
  app.abiEncodeCall("h((uint256))", [[1]]) === null &&
  app.abiEncodeCall("h(fixed128x18)", ["1"]) === null &&
  app.abiEncodeCall("h(uint7)", [1]) === null &&
  app.abiEncodeCall("h(bytes33)", ["0x"]) === null &&
  app.abiEncodeCall("h(uint256)", "not-an-array") === null);
check("ABI tool section present in index.html", html.includes("abi-btn") && html.includes("ABI calldata encoder"));

/* ABI calldata decoder — the strict inverse of the encoder. The oracles are
   the same five published spec encodings (composed with W above): decoding
   them must return the spec's published arguments, in the decoder's output
   conventions (integers as decimal strings, bytes/address as 0x hex). */
const J = v => JSON.stringify(v);
check("ABI decoder: spec baz calldata decodes to [69, true]",
  J(app.abiDecodeCall("baz(uint32,bool)", baz.calldata)?.args) === J(["69", true]));
check("ABI decoder: spec bar calldata decodes to the two bytes3 values as hex",
  J(app.abiDecodeCall("bar(bytes3[2])", bar.calldata)?.args) === J([["0x616263", "0x646566"]]));
check("ABI decoder: spec sam calldata decodes bytes as hex, bool, and the uint array as strings",
  J(app.abiDecodeCall("sam(bytes,bool,uint256[])", sam.calldata)?.args) === J(["0x64617665", true, ["1", "2", "3"]]));
check("ABI decoder: spec f calldata decodes to the published arguments",
  J(app.abiDecodeCall("f(uint256,uint32[],bytes10,bytes)", fabi.calldata)?.args) ===
  J(["291", ["1110", "1929"], "0x31323334353637383930", "0x48656c6c6f2c20776f726c6421"]));
check("ABI decoder: spec g calldata decodes the nested dynamic arrays",
  J(app.abiDecodeCall("g(uint256[][],string[])", gabi.calldata)?.args) ===
  J([[["1", "2"], ["3"]], ["one", "two", "three"]]));
check("ABI decoder: ERC-20 transfer calldata decodes the address lowercase and the amount exactly",
  J(app.abiDecodeCall("transfer(address,uint256)",
    app.abiEncodeCall("transfer(address,uint256)", [ETH, "1000000000000000000"]).calldata)?.args) ===
  J([ETH, "1000000000000000000"]));
check("ABI decoder: every spec example re-encodes byte-for-byte from its decoded form",
  [["baz(uint32,bool)", baz], ["bar(bytes3[2])", bar], ["sam(bytes,bool,uint256[])", sam],
   ["f(uint256,uint32[],bytes10,bytes)", fabi], ["g(uint256[][],string[])", gabi]
  ].every(([sig, enc]) => app.abiEncodeCall(sig, app.abiDecodeCall(sig, enc.calldata).args).calldata === enc.calldata));
check("ABI decoder: negative int8 and a non-ASCII string round-trip",
  J(app.abiDecodeCall("n(int8)", app.abiEncodeCall("n(int8)", ["-1"]).calldata)?.args) === J(["-1"]) &&
  J(app.abiDecodeCall("s(string)", app.abiEncodeCall("s(string)", ["héllo"]).calldata)?.args) === J(["héllo"]));
check("ABI decoder: rejects a selector that does not match the signature",
  app.abiDecodeCall("sam(bytes,bool,uint256[])", baz.calldata) === null &&
  app.abiDecodeCall("baz(uint32,bool)", sam.calldata) === null);
check("ABI decoder: rejects truncated calldata and trailing bytes",
  app.abiDecodeCall("baz(uint32,bool)", baz.calldata.slice(0, -2)) === null &&
  app.abiDecodeCall("baz(uint32,bool)", baz.calldata + "00") === null &&
  app.abiDecodeCall("baz(uint32,bool)", "0xcdcd77c0") === null);
check("ABI decoder: rejects non-canonical words (bool 2, uint32 bits above 32, int8 = 128)",
  app.abiDecodeCall("baz(uint32,bool)", baz.calldata.slice(0, -2) + "02") === null &&
  app.abiDecodeCall("baz(uint32,bool)", "0xcdcd77c0" + "1" + "0".repeat(55) + "00000045" + W("1")) === null &&
  app.abiDecodeCall("n(int8)", app.abiEncodeCall("n(int256)", ["128"]).calldata.replace(app.functionSelector("n(int256)"), app.functionSelector("n(int8)"))) === null);
check("ABI decoder: rejects a head-pointing offset and non-zero bytes padding in sam calldata",
  app.abiDecodeCall("sam(bytes,bool,uint256[])", sam.calldata.slice(0, 10) + W("0") + sam.calldata.slice(10 + 64)) === null &&
  app.abiDecodeCall("sam(bytes,bool,uint256[])", sam.calldata.slice(0, -64) + "64617665" + "0".repeat(54) + "ff" + sam.calldata.slice(-64)) === null);
check("ABI decoder: rejects missing 0x, odd-length hex, an invalid-UTF-8 string, and a huge array length",
  app.abiDecodeCall("baz(uint32,bool)", baz.calldata.slice(2)) === null &&
  app.abiDecodeCall("baz(uint32,bool)", baz.calldata + "0") === null &&
  app.abiDecodeCall("s(string)", app.abiEncodeCall("s(string)", ["ok"]).calldata.replace("6f6b", "ffff")) === null &&
  app.abiDecodeCall("a(uint256[])", "0x" + app.keccak256("a(uint256[])").slice(0, 8) + W("20") + "f".repeat(64)) === null);
check("ABI decoder tool section present in index.html", html.includes("dec-btn") && html.includes("ABI calldata decoder"));

/* Merkle root & proof — sorted-pair Keccak tree with odd-node promotion.
   The root/proof oracles below were produced by an independent pure-Python
   Keccak-256 implementation written from the Keccak specification for this
   tool (itself anchored on the published '' and 'hello world' vectors
   checked above), NOT by this file's own code — so they cross-check both
   the JS Keccak and the tree construction. Smaller cases are additionally
   composed by hand from keccak256Bytes, which the vectors above anchor. */
const NAMES4 = ["alice", "bob", "carol", "dave"];
const NAMES5 = [...NAMES4, "eve"];
check("Merkle leaf hash of 'alice' is keccak256 of its UTF-8 bytes",
  app.merkleLeafHash("alice") === "0x9c0257114eb9399a2985f8e75dad7600c5d89fe3824ffa99ec1c3eb8bf3b0501" &&
  app.merkleLeafHash("alice") === "0x" + app.keccak256("alice"));
check("Merkle root of the 4-leaf example (independent Python oracle)",
  app.merkleRoot(NAMES4) === "0x2c64ce985e642fde9d8ce17ed8d7bb7990cb63ae3f1d5f641664930a339e9cc3");
check("Merkle root of the 5-leaf example (independent Python oracle, odd promotion)",
  app.merkleRoot(NAMES5) === "0xc4b14fdcf1a35cc018311ccd1d7df233ed0f44230021aa3d18b34c78cc495a50");
check("Merkle single leaf: root is the leaf hash and the proof is empty",
  app.merkleRoot(["alice"]) === app.merkleLeafHash("alice") &&
  J(app.merkleProof(["alice"], 0).proof) === J([]));
check("Merkle 2-leaf root composed by hand from the anchored keccak",
  (() => {
    const ha = app.parseHexBytes(app.merkleLeafHash("alice"));
    const hb = app.parseHexBytes(app.merkleLeafHash("bob"));
    let aFirst = true;
    for (let i = 0; i < 32; i++) { if (ha[i] !== hb[i]) { aFirst = ha[i] < hb[i]; break; } }
    const [lo, hi] = aFirst ? [ha, hb] : [hb, ha];
    return app.merkleRoot(["alice", "bob"]) === "0x" + app.keccak256Bytes([...lo, ...hi]);
  })());
check("Merkle proof for leaf 0 of 4 (independent Python oracle)",
  J(app.merkleProof(NAMES4, 0).proof) === J([
    "0x38e47a7b719dce63662aeaf43440326f551b8a7ee198cee35cb5d517f2d296a2",
    "0xb81613f04cd9ce07b4781be9bbaa86a503220985be2a3f168b30d158da0db0e2"]));
check("Merkle proof for the promoted odd leaf (index 4 of 5) is the 4-leaf subtree root alone",
  J(app.merkleProof(NAMES5, 4)) === J({
    root: "0xc4b14fdcf1a35cc018311ccd1d7df233ed0f44230021aa3d18b34c78cc495a50",
    leaf: "0x876be0999ed9b7fc26f1b270903ef7b0c35291f89407903270fea611c85f515c",
    proof: ["0x2c64ce985e642fde9d8ce17ed8d7bb7990cb63ae3f1d5f641664930a339e9cc3"] }));
check("Merkle every leaf of the 5-leaf tree has a proof that verifies",
  NAMES5.every((leaf, i) => {
    const p = app.merkleProof(NAMES5, i);
    return p !== null && app.merkleVerify(leaf, p.proof, p.root);
  }));
check("Merkle sorted pairs: swapping the two leaves within a pair keeps the root",
  app.merkleRoot(["bob", "alice", "carol", "dave"]) === app.merkleRoot(NAMES4) &&
  app.merkleRoot(["alice", "bob", "dave", "carol"]) === app.merkleRoot(NAMES4));
check("Merkle swapping leaves across pairs changes the root",
  app.merkleRoot(["carol", "bob", "alice", "dave"]) !== app.merkleRoot(NAMES4));
check("Merkle a 0x hex leaf contributes its bytes (0x616c696365 builds the 'alice' tree)",
  app.merkleRoot(["0x616c696365", "bob", "carol", "dave"]) === app.merkleRoot(NAMES4));
check("Merkle changing any leaf changes the root",
  app.merkleRoot(["alice", "bob", "carol", "mallory"]) !== app.merkleRoot(NAMES4));
check("Merkle verify rejects a tampered proof, a wrong leaf, and a wrong root",
  !app.merkleVerify("alice", ["0x" + "00".repeat(32), app.merkleProof(NAMES4, 0).proof[1]], app.merkleRoot(NAMES4)) &&
  !app.merkleVerify("mallory", app.merkleProof(NAMES4, 0).proof, app.merkleRoot(NAMES4)) &&
  !app.merkleVerify("alice", app.merkleProof(NAMES4, 0).proof, app.merkleRoot(NAMES5)));
check("Merkle verify rejects malformed proof elements and roots instead of throwing",
  !app.merkleVerify("alice", ["0x1234"], app.merkleRoot(["alice"])) &&
  !app.merkleVerify("alice", [], "0x1234") &&
  !app.merkleVerify("alice", "not-an-array", app.merkleRoot(["alice"])) &&
  !app.merkleVerify("alice", [null], app.merkleRoot(["alice"])));
check("Merkle rejects empty lists, blank leaves, bad hex, and out-of-range indexes",
  app.merkleRoot([]) === null &&
  app.merkleRoot(["alice", "   "]) === null &&
  app.merkleRoot(["0xzz"]) === null &&
  app.merkleRoot(["0x0"]) === null &&
  app.merkleRoot(["0x"]) === null &&
  app.merkleRoot("alice") === null &&
  app.merkleProof(NAMES4, 4) === null &&
  app.merkleProof(NAMES4, -1) === null &&
  app.merkleProof(NAMES4, 1.5) === null &&
  app.merkleLeafHash("") === null &&
  app.merkleLeafHash(null) === null);
check("Merkle tool section present in index.html", html.includes("mrk-btn") && html.includes("Merkle root"));
check("OpenZeppelin MerkleProof source linked from index.html",
  html.includes("https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/MerkleProof.sol"));

console.log(`\n${total - failures}/${total} checks passed`);
process.exit(failures ? 1 : 0);
