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
check("cache keys current", html.includes("styles.css?v=2") && html.includes("app.js?v=63"));
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
check("raw transaction controls labelled",
  ["txd-raw"].every(id => html.includes(`for="${id}"`)));

/* raw transaction decoder — the signed transaction published in EIP-155
   (fields and signing hash are the EIP's own published values), plus
   type 1 / type 2 vectors and hash values produced by an independent
   pure-Python RLP + Keccak-256 oracle written from the specifications */
const EIP155_TX = "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83";
const tx155 = app.decodeRawTransaction(EIP155_TX);
check("EIP-155 example decodes to its published fields",
  tx155 !== null && tx155.type === "legacy" && tx155.signed === true &&
  tx155.nonce === "9" && tx155.gasPrice === "20000000000" && tx155.gasLimit === "21000" &&
  tx155.to === app.toChecksumAddress("0x3535353535353535353535353535353535353535") &&
  tx155.value === "1000000000000000000" && tx155.data === "0x" && tx155.accessList === null);
check("EIP-155 example: v 37 means chain ID 1, y-parity 0, published r/s",
  tx155.chainId === "1" && tx155.yParity === 0 && tx155.v === "37" &&
  tx155.r === "0x28ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276" &&
  tx155.s === "0x67cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83");
check("EIP-155 example: signing hash is the EIP's published value",
  tx155.signingHash === "0xdaf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53");
check("EIP-155 example: transaction hash (Python oracle)",
  tx155.txHash === "0x33469b22e9f636356c4160a87eb19df52b7412e8eac32a4a55ffe88ea8350788");
const txPre155 = app.decodeRawTransaction(EIP155_TX.replace("8025a0", "801ba0"));
check("pre-EIP-155 variant (v 27) has no chain ID and the 6-field signing hash (Python oracle)",
  txPre155 !== null && txPre155.v === "27" && txPre155.chainId === null && txPre155.yParity === 0 &&
  txPre155.signingHash === "0xf9e36c28c8cb35adba138005c02ab7aa7fbcd891f3139cb2eeed052a51cd2713");
const txUnsigned = app.decodeRawTransaction("0xe9098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a764000080");
check("unsigned legacy transaction (6 fields) decodes with no v and the same signing hash",
  txUnsigned !== null && txUnsigned.signed === false && !("v" in txUnsigned) &&
  txUnsigned.signingHash === "0xf9e36c28c8cb35adba138005c02ab7aa7fbcd891f3139cb2eeed052a51cd2713");
const TYPE2_TX = "0x02f8af822105078459682f008506fc23ac00830186a094111111111111111111111111111111111111111184075bcd1584a9059cbbf838f7942222222222222222222222222222222222222222e1a0000000000000000000000000000000000000000000000000000000000000000301a01111111111111111111111111111111111111111111111111111111111111111a02222222222222222222222222222222222222222222222222222222222222222";
const tx2 = app.decodeRawTransaction(TYPE2_TX);
check("type 2 (EIP-1559, Base chain ID 8453) decodes all fields incl. access list (Python oracle vector)",
  tx2 !== null && tx2.type === "eip1559" && tx2.chainId === "8453" && tx2.nonce === "7" &&
  tx2.maxPriorityFeePerGas === "1500000000" && tx2.maxFeePerGas === "30000000000" &&
  tx2.gasLimit === "100000" && tx2.value === "123456789" && tx2.data === "0xa9059cbb" &&
  tx2.to === app.toChecksumAddress("0x1111111111111111111111111111111111111111") &&
  tx2.yParity === 1 &&
  JSON.stringify(tx2.accessList) === JSON.stringify([{ address: app.toChecksumAddress("0x2222222222222222222222222222222222222222"), storageKeys: ["0x0000000000000000000000000000000000000000000000000000000000000003"] }]));
check("type 2 signing and transaction hashes (Python oracle)",
  tx2.signingHash === "0x3f9a08ab00f217d6e294fb1d1cdc30c1df90641413a54a002521e2b33f34cb51" &&
  tx2.txHash === "0x553544334406f8e3919bb1e2d275bf8cfe2d11f8e8e4a66c440c53278cd2627d");
const TYPE1_TX = "0x01f8588182808504a817c8008307a12080808460006000c080a03333333333333333333333333333333333333333333333333333333333333333a04444444444444444444444444444444444444444444444444444444444444444";
const tx1 = app.decodeRawTransaction(TYPE1_TX);
check("type 1 (EIP-2930, Unichain chain ID 130) contract creation decodes (Python oracle vector)",
  tx1 !== null && tx1.type === "eip2930" && tx1.chainId === "130" && tx1.gasPrice === "20000000000" &&
  tx1.to === null && tx1.value === "0" && tx1.data === "0x60006000" &&
  Array.isArray(tx1.accessList) && tx1.accessList.length === 0 && tx1.yParity === 0 &&
  tx1.signingHash === "0x33ceb81ff981f0d0e9dc35bc9a065f8b8425922b7e469d449d56838c2b376922" &&
  tx1.txHash === "0x0971fa7326ea8dedb333e24ef08f5927b68ac0ef3cec99872a7bcdf5ed3c10c2");

const TYPE3_TX = "0x03f8f6010b84773594008506fc23ac008301d4c09435353535353535353535353535353535353535358806f05b59d3b2000080f838f7941111111111111111111111111111111111111111e1a000000000000000000000000000000000000000000000000000000000000000018477359400f842a0013fa2d9cad26df768c1b09203b0275f0f4d2d7ddf2be8f77fbd65f931c7e2efa001ef71c1e14b31badcc6d27d0e32ca041bce8fc2558c385a931a1c005ad2efaf01a033a036da1cc7d995b6db724a549dbd6293ef2615852d20f39309a0c7f6f5dccba035dfe4f0d8c39acbd7a2e395e9a83e0e296316e2a051b719e093a64545783b8c";
const tx3 = app.decodeRawTransaction(TYPE3_TX);
check("type 3 (EIP-4844, Ethereum L1 chain ID 1) decodes all fields incl. blob versioned hashes (Python oracle vector)",
  tx3 !== null && tx3.type === "eip4844" && tx3.signed === true && tx3.chainId === "1" && tx3.nonce === "11" &&
  tx3.maxPriorityFeePerGas === "2000000000" && tx3.maxFeePerGas === "30000000000" && tx3.gasLimit === "120000" &&
  tx3.to === app.toChecksumAddress("0x3535353535353535353535353535353535353535") &&
  tx3.value === "500000000000000000" && tx3.data === "0x" && tx3.yParity === 1 && tx3.v === "1" &&
  tx3.r === "0x33a036da1cc7d995b6db724a549dbd6293ef2615852d20f39309a0c7f6f5dccb" && tx3.s === "0x35dfe4f0d8c39acbd7a2e395e9a83e0e296316e2a051b719e093a64545783b8c" &&
  tx3.maxFeePerBlobGas === "2000000000" &&
  JSON.stringify(tx3.accessList) === JSON.stringify([{ address: app.toChecksumAddress("0x1111111111111111111111111111111111111111"), storageKeys: ["0x0000000000000000000000000000000000000000000000000000000000000001"] }]) &&
  JSON.stringify(tx3.blobVersionedHashes) === JSON.stringify(["0x013fa2d9cad26df768c1b09203b0275f0f4d2d7ddf2be8f77fbd65f931c7e2ef", "0x01ef71c1e14b31badcc6d27d0e32ca041bce8fc2558c385a931a1c005ad2efaf"]) &&
  tx3.authorizationList === null);
check("type 3 signing and transaction hashes (Python oracle)",
  tx3.signingHash === "0xa203bffd7e2d88063627794ff061c55b051a9310dcca7677ae03246c39817d32" && tx3.txHash === "0x7c280088465a10a78e78d59649fd8cc0fb8ca6dc244fce7b037ce1c8c4a87df1");
const tx3Unsigned = app.decodeRawTransaction("0x03f8b3010b84773594008506fc23ac008301d4c09435353535353535353535353535353535353535358806f05b59d3b2000080f838f7941111111111111111111111111111111111111111e1a000000000000000000000000000000000000000000000000000000000000000018477359400f842a0013fa2d9cad26df768c1b09203b0275f0f4d2d7ddf2be8f77fbd65f931c7e2efa001ef71c1e14b31badcc6d27d0e32ca041bce8fc2558c385a931a1c005ad2efaf");
check("unsigned type 3 transaction (11 fields) decodes with the same signing hash",
  tx3Unsigned !== null && tx3Unsigned.signed === false && !("v" in tx3Unsigned) &&
  tx3Unsigned.signingHash === "0xa203bffd7e2d88063627794ff061c55b051a9310dcca7677ae03246c39817d32" && tx3Unsigned.blobVersionedHashes.length === 2);
check("type 3 decoder rejects EIP-4844-invalid transactions (Python oracle vectors)",
  app.decodeRawTransaction("0x03f8b3010b84773594008506fc23ac008301d4c09435353535353535353535353535353535353535358806f05b59d3b2000080f838f7941111111111111111111111111111111111111111e1a000000000000000000000000000000000000000000000000000000000000000018477359400c001a0108c8f95f564aac9a7e28c31217bc898272a612faf714dc9fbb4064c1eaa2115a071b8c5ef3d6b2c7d3acdf36f5cd042a1f0a0dabf3375efc8e9bb6ecad553fbdf") === null &&
  app.decodeRawTransaction("0x03f8e2010b84773594008506fc23ac008301d4c0808806f05b59d3b2000080f838f7941111111111111111111111111111111111111111e1a000000000000000000000000000000000000000000000000000000000000000018477359400f842a0013fa2d9cad26df768c1b09203b0275f0f4d2d7ddf2be8f77fbd65f931c7e2efa001ef71c1e14b31badcc6d27d0e32ca041bce8fc2558c385a931a1c005ad2efaf01a01515302507caf785c188d96c2f2b03ca146174952311a546d7ac27a827e9996fa05d7a15e851122bff14cf0d76887aa0031dde691e31779990f9831e73f43e4d50") === null &&
  app.decodeRawTransaction("0x03f8f6010b84773594008506fc23ac008301d4c09435353535353535353535353535353535353535358806f05b59d3b2000080f838f7941111111111111111111111111111111111111111e1a000000000000000000000000000000000000000000000000000000000000000018477359400f842a0013fa2d9cad26df768c1b09203b0275f0f4d2d7ddf2be8f77fbd65f931c7e2efa002ef71c1e14b31badcc6d27d0e32ca041bce8fc2558c385a931a1c005ad2efaf01a0026a97c56d020c758507f1fdbf63fd2161bacf9dea2998216fb0785b63beb05ca0332dd6d2d0fbf2927174838c75db07cd43296056578b2b2ff49c423c11818c3f") === null &&
  app.decodeRawTransaction("0x03f8d3010b84773594008506fc23ac008301d4c09435353535353535353535353535353535353535358806f05b59d3b2000080f838f7941111111111111111111111111111111111111111e1a000000000000000000000000000000000000000000000000000000000000000018477359400e09f013fa2d9cad26df768c1b09203b0275f0f4d2d7ddf2be8f77fbd65f931c7e280a0fdf1356791797e57402408cc3e2158d7ce499caec546f6ee8aa6b517f334c48aa05f7257cb11980fea49450aabc0ec14ec5cd34a3a3c42c2c6b25a5e43256a5a5e") === null &&
  app.decodeRawTransaction("0x03f90160f8f6010b84773594008506fc23ac008301d4c09435353535353535353535353535353535353535358806f05b59d3b2000080f838f7941111111111111111111111111111111111111111e1a000000000000000000000000000000000000000000000000000000000000000018477359400f842a0013fa2d9cad26df768c1b09203b0275f0f4d2d7ddf2be8f77fbd65f931c7e2efa001ef71c1e14b31badcc6d27d0e32ca041bce8fc2558c385a931a1c005ad2efaf01a033a036da1cc7d995b6db724a549dbd6293ef2615852d20f39309a0c7f6f5dccba035dfe4f0d8c39acbd7a2e395e9a83e0e296316e2a051b719e093a64545783b8cc3820102f1b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f1b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000") === null);

const TYPE4_TX = "0x04f9016b822105078459682f008506fc23ac00830186a0943535353535353535353535353535353535353535880de0b6b3a764000080f838f7941111111111111111111111111111111111111111e1a00000000000000000000000000000000000000000000000000000000000000001f8baf85c8221059411111111111111111111111111111111111111110380a0ecd286ae19eaf8f55a47fb2e6156cdb85fd63de22fefb8dce806acedcb1ea797a006ad19fe8e587e1c554325d65703dc04ced6ec65f2a9af7dcda81080eab8b2f3f85a809422222222222222222222222222222222222222228080a0d43d780f5b5453c2f7764e99b203ce176e125b69bff96662f0d5f95032783801a0037051652f758859a9ffaffb0e085c18ad35fbdfa23e6d94d318c47a7742c2e101a0293fdcc99c6e9c8d94084a09b20f588a0bf2cf57bbe5ee6939da984f0cfc9b50a0621657f4abc3f655725b5f65e37467cee4c4da6801f85ce6f0392f4c22ab9a97";
const tx4 = app.decodeRawTransaction(TYPE4_TX);
check("type 4 (EIP-7702, Base chain ID 8453) decodes all fields incl. authorization list (Python oracle vector)",
  tx4 !== null && tx4.type === "eip7702" && tx4.signed === true && tx4.chainId === "8453" && tx4.nonce === "7" &&
  tx4.maxPriorityFeePerGas === "1500000000" && tx4.maxFeePerGas === "30000000000" && tx4.gasLimit === "100000" &&
  tx4.to === app.toChecksumAddress("0x3535353535353535353535353535353535353535") &&
  tx4.value === "1000000000000000000" && tx4.data === "0x" && tx4.yParity === 1 &&
  tx4.v === "1" && tx4.r === "0x293fdcc99c6e9c8d94084a09b20f588a0bf2cf57bbe5ee6939da984f0cfc9b50" && tx4.s === "0x621657f4abc3f655725b5f65e37467cee4c4da6801f85ce6f0392f4c22ab9a97" &&
  JSON.stringify(tx4.accessList) === JSON.stringify([{ address: app.toChecksumAddress("0x1111111111111111111111111111111111111111"), storageKeys: ["0x0000000000000000000000000000000000000000000000000000000000000001"] }]) &&
  JSON.stringify(tx4.authorizationList) === JSON.stringify([
    { chainId: "8453", address: app.toChecksumAddress("0x1111111111111111111111111111111111111111"), nonce: "3", yParity: 0, r: "0xecd286ae19eaf8f55a47fb2e6156cdb85fd63de22fefb8dce806acedcb1ea797", s: "0x06ad19fe8e587e1c554325d65703dc04ced6ec65f2a9af7dcda81080eab8b2f3" },
    { chainId: "0", address: app.toChecksumAddress("0x2222222222222222222222222222222222222222"), nonce: "0", yParity: 0, r: "0xd43d780f5b5453c2f7764e99b203ce176e125b69bff96662f0d5f95032783801", s: "0x037051652f758859a9ffaffb0e085c18ad35fbdfa23e6d94d318c47a7742c2e1" }]));
check("type 4 signing and transaction hashes (Python oracle)",
  tx4.signingHash === "0xf83d87b5649f3237e2f726e4d59def012ad6d0d66247fc46a2ec576190f0a032" && tx4.txHash === "0x802700d3062b3125c9bc2edcd545af2c8f7c7ebd88698ef7cd6bdffc40e787fb");
const tx4Unsigned = app.decodeRawTransaction("0x04f90128822105078459682f008506fc23ac00830186a0943535353535353535353535353535353535353535880de0b6b3a764000080f838f7941111111111111111111111111111111111111111e1a00000000000000000000000000000000000000000000000000000000000000001f8baf85c8221059411111111111111111111111111111111111111110380a0ecd286ae19eaf8f55a47fb2e6156cdb85fd63de22fefb8dce806acedcb1ea797a006ad19fe8e587e1c554325d65703dc04ced6ec65f2a9af7dcda81080eab8b2f3f85a809422222222222222222222222222222222222222228080a0d43d780f5b5453c2f7764e99b203ce176e125b69bff96662f0d5f95032783801a0037051652f758859a9ffaffb0e085c18ad35fbdfa23e6d94d318c47a7742c2e1");
check("unsigned type 4 transaction (10 fields) decodes with the same signing hash",
  tx4Unsigned !== null && tx4Unsigned.signed === false && !("v" in tx4Unsigned) &&
  tx4Unsigned.signingHash === "0xf83d87b5649f3237e2f726e4d59def012ad6d0d66247fc46a2ec576190f0a032" && tx4Unsigned.authorizationList.length === 2);
check("type 4 decoder rejects EIP-7702-invalid transactions (Python oracle vectors)",
  app.decodeRawTransaction("0x04f8b0822105078459682f008506fc23ac00830186a0943535353535353535353535353535353535353535880de0b6b3a764000080f838f7941111111111111111111111111111111111111111e1a00000000000000000000000000000000000000000000000000000000000000001c080a01476b7ab2c40bebfbdc60192957fb2a138fb6d12f2e121f743f98555ab1dda12a025690fe7e84ffd1479cdf3c8846dcb066f9414e8c04b7f5cb4ef8588b7054419") === null &&
  app.decodeRawTransaction("0x04f90157822105078459682f008506fc23ac00830186a080880de0b6b3a764000080f838f7941111111111111111111111111111111111111111e1a00000000000000000000000000000000000000000000000000000000000000001f8baf85c8221059411111111111111111111111111111111111111110380a0ecd286ae19eaf8f55a47fb2e6156cdb85fd63de22fefb8dce806acedcb1ea797a006ad19fe8e587e1c554325d65703dc04ced6ec65f2a9af7dcda81080eab8b2f3f85a809422222222222222222222222222222222222222228080a0d43d780f5b5453c2f7764e99b203ce176e125b69bff96662f0d5f95032783801a0037051652f758859a9ffaffb0e085c18ad35fbdfa23e6d94d318c47a7742c2e101a0c3a0e74de84db4cba0993cb42f523a4ab8dd338568460754f5368a09c3a516baa01d40a1402d5aabb08dfbc81d58d0710983123ebb088218e977400be6b7330474") === null &&
  app.decodeRawTransaction("0x04f8ee822105078459682f008506fc23ac00830186a0943535353535353535353535353535353535353535880de0b6b3a764000080f838f7941111111111111111111111111111111111111111e1a00000000000000000000000000000000000000000000000000000000000000001f83df83b8221059411111111111111111111111111111111111111110380a0ecd286ae19eaf8f55a47fb2e6156cdb85fd63de22fefb8dce806acedcb1ea79780a09649eab4645d5eaaaba3b417645cdf59c27fdb5d6c7309b84e549436d9f101cda057f25a5663e80991dbd5dd03bf7db1126a398bba7a42102dca24a5ccef785249") === null &&
  app.decodeRawTransaction("0x04f90118822105078459682f008506fc23ac00830186a0943535353535353535353535353535353535353535880de0b6b3a764000080f838f7941111111111111111111111111111111111111111e1a00000000000000000000000000000000000000000000000000000000000000001f867f8658221059411111111111111111111111111111111111111118901000000000000000080a0ecd286ae19eaf8f55a47fb2e6156cdb85fd63de22fefb8dce806acedcb1ea797a006ad19fe8e587e1c554325d65703dc04ced6ec65f2a9af7dcda81080eab8b2f380a06b1321fc99d6d6d60637e5e898a2f5f073961b5110fa96f46b719bc1f0ac7ff3a023bd3afd9eb6b1d41535cf358d9cb166e54c9691cc23b0395ef44800c0d71191") === null &&
  app.decodeRawTransaction("0x04f90111822105078459682f008506fc23ac00830186a0943535353535353535353535353535353535353535880de0b6b3a764000080f838f7941111111111111111111111111111111111111111e1a00000000000000000000000000000000000000000000000000000000000000001f860f85e82210594111111111111111111111111111111111111111103820100a0ecd286ae19eaf8f55a47fb2e6156cdb85fd63de22fefb8dce806acedcb1ea797a006ad19fe8e587e1c554325d65703dc04ced6ec65f2a9af7dcda81080eab8b2f301a0b243f443c56e2d5861e81c5912b18fc6622f6a5651ba7b9bfa1ad163aeb8f5a7a058385691bbf3831af4d49cb5551080236dbe4993fa01d9160a900616150adde8") === null);
check("non-blob transactions carry null blob versioned hashes",
  tx155.blobVersionedHashes === null && tx1.blobVersionedHashes === null && tx2.blobVersionedHashes === null && tx4.blobVersionedHashes === null);
check("EIP-7702 authorization digests (Python oracle)",
  app.eip7702AuthorizationDigest("8453", "0x1111111111111111111111111111111111111111", "3") === "0xa220321b87c7e2f32cd61ca94318a803d6b748661985c7e4e77f4d9a67eb048e" &&
  app.eip7702AuthorizationDigest("0", "0x2222222222222222222222222222222222222222", "0") === "0xfb6605641675aed59f0a3f2c102ac202312494431d767f683a450b845ff3a8cc" &&
  app.eip7702AuthorizationDigest("-1", "0x1111111111111111111111111111111111111111", "3") === null &&
  app.eip7702AuthorizationDigest("8453", "0x1111", "3") === null &&
  app.eip7702AuthorizationDigest("8453", "0x1111111111111111111111111111111111111111", "x") === null);
check("transaction decoder rejects malformed and non-canonical input",
  app.decodeRawTransaction("") === null &&
  app.decodeRawTransaction("0x") === null &&
  app.decodeRawTransaction("0xf86") === null &&
  app.decodeRawTransaction("0xzz") === null &&
  app.decodeRawTransaction(EIP155_TX + "00") === null &&
  app.decodeRawTransaction(EIP155_TX.slice(0, -2)) === null &&
  app.decodeRawTransaction("0x03" + EIP155_TX.slice(2)) === null &&
  app.decodeRawTransaction("0xf86d8109" + EIP155_TX.slice(10)) === null &&
  app.decodeRawTransaction("0xf86e09b8018504a817c800" + EIP155_TX.slice(20)) === null &&
  app.decodeRawTransaction("0xf86e820009" + EIP155_TX.slice(8)) === null &&
  app.decodeRawTransaction("0xe9098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025") === null &&
  app.decodeRawTransaction(EIP155_TX.replace("8025a0", "801da0")) === null &&
  app.decodeRawTransaction(TYPE2_TX.replace("0301a0", "0302a0")) === null &&
  app.decodeRawTransaction(null) === null);
check("raw transaction tool section present in index.html", html.includes("txd-btn") && html.includes("Raw transaction decoder"));
check("signature recovery controls labelled",
  ["rec-hash", "rec-v", "rec-r", "rec-s"].every(id => html.includes(`for="${id}"`)));

/* signature recovery — three independent anchors: (1) EIP-155's published
   signing hash + v/r/s recover the address an independent pure-Python
   secp256k1 oracle derives from the private key the EIP itself prints;
   (2) EIP-712's printed eth_signTypedData signature recovers its published
   signing account over the spec digest the mail tool computes; (3) two
   Python-oracle sign/recover vectors with fixed keys (incl. private key 1) */
const EIP155_SENDER = app.toChecksumAddress("0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f");
check("EIP-155 example signature recovers the sender (Python oracle from the EIP's printed key)",
  app.recoverAddress(tx155.signingHash, "37", tx155.r, tx155.s) === EIP155_SENDER &&
  app.recoverAddress(tx155.signingHash, "0", tx155.r, tx155.s) === EIP155_SENDER);
const MAIL_DIGEST = md.digest;
const COW_CHECKSUM = app.toChecksumAddress(COW);
const SIG712_R = "0x4355c47d63924e8a72e509b65029052eb6c299d53a04e167c5775fd466751c9d";
const SIG712_S = "0x07299936d304c153f6443dfa05f40ff007d72911b6f72307f996231605b91562";
check("EIP-712 printed signature recovers its published signing account (Cow)",
  app.recoverAddress(MAIL_DIGEST, "28", SIG712_R, SIG712_S) === COW_CHECKSUM &&
  app.recoverAddress(MAIL_DIGEST, "1", SIG712_R, SIG712_S) === COW);
check("wrong parity recovers a different address, not an error",
  app.recoverAddress(MAIL_DIGEST, "27", SIG712_R, SIG712_S) !== null &&
  app.recoverAddress(MAIL_DIGEST, "27", SIG712_R, SIG712_S) !== COW_CHECKSUM);
check("signature recovery matches the Python-oracle sign/recover vectors",
  app.recoverAddress("0xcd3a6e5d1a81ab6a1c73f0d6f07431edc7457102fcfb52eb0fed7db0382a11d6", "28",
    "0xf01d6b9018ab421dd410404cb869072065522bf85734008f105cf385a023a80f",
    "0x40e190a372d8af9f109bf439ac41a1569bfea45c368bfb5dc7995ec6afea69bc") ===
    app.toChecksumAddress("0x7e5f4552091a69125d5dfcb7b8c2659029395bdf") &&
  app.recoverAddress("0xb3c7d7d387fbd6b5220b5866df14be4bef6ce2d973ceed8a7cfb1ca7a2a88587", "28",
    "0x5ad2703f5b4f4b9dea4c28fa30d86d3781d28e09dd51aae1208de80bb6155bee",
    "0x1ed36f4e38a79389d012b6ccf4ae80cb7eb7c974ff336d93ecdd40c9721dea4d") ===
    app.toChecksumAddress("0x1be31a94361a391bbafb2a4ccd704f57dc04d4bb"));
check("signature recovery rejects malformed and non-canonical signatures",
  app.recoverAddress(MAIL_DIGEST, "28", "0x" + "00".repeat(32), SIG712_S) === null &&
  app.recoverAddress(MAIL_DIGEST, "28", SIG712_R, "0x" + "00".repeat(32)) === null &&
  app.recoverAddress(MAIL_DIGEST, "28", "0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141", SIG712_S) === null &&
  app.recoverAddress(MAIL_DIGEST, "27", SIG712_R, "0xf8d666c92cfb3eac09bbc205fa0bf00eb2d7b3d4f8517d33c63c3b76ca7d2bdf") === null &&
  app.recoverAddress(MAIL_DIGEST, "29", SIG712_R, SIG712_S) === null &&
  app.recoverAddress(MAIL_DIGEST, "2", SIG712_R, SIG712_S) === null &&
  app.recoverAddress(MAIL_DIGEST, "0x1c", SIG712_R, SIG712_S) === null &&
  app.recoverAddress("0xbe60", "28", SIG712_R, SIG712_S) === null &&
  app.recoverAddress(MAIL_DIGEST, "28", SIG712_R, SIG712_S.slice(0, -1)) === null &&
  app.recoverAddress(null, "28", SIG712_R, SIG712_S) === null);
check("signature recovery tool section present in index.html", html.includes("rec-btn") && html.includes("Signature recovery"));
check("EIP-155 source linked from index.html", html.includes("https://eips.ethereum.org/EIPS/eip-155"));
check("OpenZeppelin MerkleProof source linked from index.html",
  html.includes("https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/MerkleProof.sol"));
check("signed message controls labelled",
  ["msg-message", "msg-sig", "msg-expect"].every(id => html.includes(`for="${id}"`)));

/* signed message verification (EIP-191 personal_sign) — digests, signatures
   and recovered signers produced by an independent pure-Python Keccak-256 +
   secp256k1 oracle written from the specifications (Keccak anchored on the
   published '' / 'hello world' vectors checked above; the oracle's address
   derivation anchored on the published addresses of private key 1 and of
   the private key EIP-155 prints). NOT produced by this file's own code. */
const KEY1_ADDR = app.toChecksumAddress("0x7e5f4552091a69125d5dfcb7b8c2659029395bdf");
const SIG_HELLO = "0xa64db41e2968c849c2a5615ba0d6e816734a6d3e6ea6ecd6f3acb7d59daa91027b99dd94df68e33797cfdf9872561f556c8589e91d66ef16ed9884ed1f8e544b1b";
check("EIP-191 digest of 'Hello, Bob!' (Python oracle)",
  app.eip191Digest("Hello, Bob!") === "0xaf0a369c7440ada5f06e224551e765ad1acc4ec60aa08944e72415249fa9213e");
check("EIP-191 digest of the empty message signs the prefix with length 0 (Python oracle)",
  app.eip191Digest("") === "0x5f35dce98ba4fba25530a026ed80b2cecdaa31091ba4958b99b52ea1d068adad");
check("EIP-191 length counts UTF-8 bytes, not characters ('héllo wörld' is 13 bytes, Python oracle)",
  app.eip191Digest("héllo wörld") === "0xc0e106c473d00fbb6310fe337d41489c46889c4cc6ca39b76702ce7d90d62983" &&
  app.eip191Digest("héllo wörld") !== app.eip191Digest("hello world"));
check("personal_sign signature over 'Hello, Bob!' verifies to private key 1's published address",
  (() => { const r = app.verifyPersonalSignature("Hello, Bob!", SIG_HELLO); return r !== null && r.signer === KEY1_ADDR && r.digest === app.eip191Digest("Hello, Bob!"); })());
check("personal_sign empty-message signature verifies (Python oracle)",
  app.verifyPersonalSignature("", "0x5d45cb81aa765d69ca52e3869491ecf0e8fdf6a63d64e65b5213647ee4973ae552b36fdde9cb77dd21c418accf0dd92f274880ffb8ddb3fcde661547c6a624801b")?.signer === KEY1_ADDR);
check("personal_sign UTF-8 message signature verifies to the EIP-155 example key's address",
  app.verifyPersonalSignature("héllo wörld", "0xfd36a0a17d8af5e97e75083e9607dee24f03356908077b1987270a20aa3eea6238fc471132b4f8ef2b4662f294a61587bc147aeb0e827b4fa1a7ff00fa2d2df61c")?.signer === EIP155_SENDER);
check("personal_sign accepts v in 0/1 form as well as 27/28",
  app.verifyPersonalSignature("Hello, Bob!", SIG_HELLO.slice(0, -2) + "00")?.signer === KEY1_ADDR &&
  app.verifyPersonalSignature("héllo wörld", "0xfd36a0a17d8af5e97e75083e9607dee24f03356908077b1987270a20aa3eea6238fc471132b4f8ef2b4662f294a61587bc147aeb0e827b4fa1a7ff00fa2d2df61c".slice(0, -2) + "01")?.signer === EIP155_SENDER);
check("personal_sign over a tampered message recovers a different signer, not the expected one",
  (() => { const r = app.verifyPersonalSignature("Hello, Bob?", SIG_HELLO); return r !== null && r.signer !== KEY1_ADDR; })());
check("personal_sign rejects malformed signatures and non-canonical forms",
  app.verifyPersonalSignature("Hello, Bob!", "0x1234") === null &&
  app.verifyPersonalSignature("Hello, Bob!", SIG_HELLO.slice(0, -2)) === null &&
  app.verifyPersonalSignature("Hello, Bob!", SIG_HELLO + "0") === null &&
  app.verifyPersonalSignature("Hello, Bob!", SIG_HELLO.slice(0, -2) + "1d") === null &&
  app.verifyPersonalSignature("Hello, Bob!", "0x" + "00".repeat(32) + SIG_HELLO.slice(66)) === null &&
  app.verifyPersonalSignature("Hello, Bob!", "0xa64db41e2968c849c2a5615ba0d6e816734a6d3e6ea6ecd6f3acb7d59daa9102" + "8466226b20971cc8683020678da9e0a94e2952fd91e1b124d239d99fb0a7ecf6" + "1c") === null &&
  app.verifyPersonalSignature(null, SIG_HELLO) === null &&
  app.eip191Digest(null) === null);
check("signed message tool section present in index.html", html.includes("msg-btn") && html.includes("Signed message verification"));
check("EIP-191 source linked from index.html", html.includes("https://eips.ethereum.org/EIPS/eip-191"));
check("EIP-712 verify controls labelled",
  ["v712-dname", "v712-dversion", "v712-dchain", "v712-dcontract", "v712-from-name", "v712-from-wallet", "v712-to-name", "v712-to-wallet", "v712-contents", "v712-sig", "v712-expect"].every(id => html.includes(`for="${id}"`)));

/* EIP-712 typed-data verification (Ether Mail schema) — composes the mail
   digest and ecrecover. Anchors: (1) the signature EIP-712 itself prints
   as the result of its eth_signTypedData example request recovers its
   published signing account (Cow) over the published Ether Mail digest;
   (2) a signature over that same published digest produced by an
   independent pure-Python secp256k1 oracle (RFC 6979 signing; Keccak
   anchored on the published '' / 'hello world' vectors; its address
   derivation anchored on the published addresses of private key 1 and
   of the private key EIP-155 prints) with private key 1 recovers key 1's
   published address. NOT produced by this file's own code. */
const SIG712_FULL = "0x4355c47d63924e8a72e509b65029052eb6c299d53a04e167c5775fd466751c9d07299936d304c153f6443dfa05f40ff007d72911b6f72307f996231605b915621c";
const SIG712_KEY1 = "0x25ee9afa55806b99c9709a93ab967e487ad3a7cfdc421612e68cef7a737355246000f332e3f5e9ca5942275745c8b04523e17b57ef576e8362c74458fc62a6231c";
check("EIP-712 printed signature verifies to its published signing account (Cow), carrying the published digest chain",
  (() => { const r = app.verify712MailSignature(...mailArgs, SIG712_FULL); return r !== null && r.signer === COW_CHECKSUM && r.digest === "0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2" && r.domainSeparator === "0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f" && r.structHash === "0xc52c0ee5d84264471806290a3f2c4cecfc5490626bf912d01f240d7a274b371e"; })());
check("EIP-712 oracle signature by private key 1 over the mail digest verifies to key 1's published address",
  app.verify712MailSignature(...mailArgs, SIG712_KEY1)?.signer === KEY1_ADDR);
check("EIP-712 verification accepts v in 0/1 form as well as 27/28",
  app.verify712MailSignature(...mailArgs, SIG712_FULL.slice(0, -2) + "01")?.signer === COW_CHECKSUM);
check("EIP-712 signature over tampered typed data recovers a different signer, not the expected one",
  (() => { const r = app.verify712MailSignature(...mailArgs.slice(0, 8), "Hello, Bob?", SIG712_FULL); return r !== null && r.signer !== COW_CHECKSUM; })() &&
  (() => { const r = app.verify712MailSignature("Ether Mail", "1", "8453", MAIL_CONTRACT, "Cow", COW, "Bob", BOB, "Hello, Bob!", SIG712_FULL); return r !== null && r.signer !== COW_CHECKSUM; })());
check("EIP-712 verification rejects malformed signatures and non-canonical forms",
  app.verify712MailSignature(...mailArgs, "0x4355c47d63924e8a72e509b65029052eb6c299d53a04e167c5775fd466751c9df8d666c92cfb3eac09bbc205fa0bf00eb2d7b3d4f8517d33c63c3b76ca7d2bdf1b") === null &&
  app.verify712MailSignature(...mailArgs, SIG712_FULL.slice(0, -2)) === null &&
  app.verify712MailSignature(...mailArgs, SIG712_FULL + "00") === null &&
  app.verify712MailSignature(...mailArgs, SIG712_FULL.slice(0, -2) + "1d") === null &&
  app.verify712MailSignature(...mailArgs, "0x" + "00".repeat(32) + SIG712_FULL.slice(66)) === null &&
  app.verify712MailSignature(...mailArgs, null) === null);
check("EIP-712 verification rejects bad typed data (bad domain, bad wallet, null contents)",
  app.verify712MailSignature("Ether Mail", "1", "0", MAIL_CONTRACT, "Cow", COW, "Bob", BOB, "Hello, Bob!", SIG712_FULL) === null &&
  app.verify712MailSignature("Ether Mail", "1", "1", MAIL_CONTRACT, "Cow", "0x123", "Bob", BOB, "Hello, Bob!", SIG712_FULL) === null &&
  app.verify712MailSignature("Ether Mail", "1", "1", MAIL_CONTRACT, "Cow", COW, "Bob", BOB, null, SIG712_FULL) === null);
check("EIP-712 verify tool section present in index.html", html.includes("v712-btn") && html.includes("EIP-712 typed-data signature verification"));
check("EIP-712 source linked from index.html", html.includes("https://eips.ethereum.org/EIPS/eip-712"));
check("EIP-7702 source linked from index.html", html.includes("https://eips.ethereum.org/EIPS/eip-7702"));
check("EIP-4844 source linked from index.html", html.includes("https://eips.ethereum.org/EIPS/eip-4844"));
check("transaction sender controls labelled",
  ["txs-raw"].every(id => html.includes(`for="${id}"`)));

/* transaction sender recovery — composes the strict decoder and ecrecover.
   Anchors: (1) EIP-155's published transaction recovers the published
   sender address; (2) type 1 / type 2 / legacy transactions signed by an
   independent pure-Python Keccak-256 + secp256k1 oracle (written from the
   specifications; its Keccak anchored on the published '' / 'hello world'
   vectors, its address derivation anchored on the published addresses of
   private key 1 and of the private key EIP-155 prints, and it reproduces
   EIP-155's published signing hash from the EIP's signing data) with those
   two known keys, so each recovered sender is a published address the
   oracle derived by scalar multiplication — a different code path from
   recovery. NOT produced by this file's own code. */
const SENDER_T1 = "0x01f8678182038504a817c80082c3509422222222222222222222222222222222222222228080c080a06cb6084bfc440011d40dd8e7b5b150a066f98d53be746bfc62da771a33fd6577a0155a1988dac0b71fed11530d099640e06ef26e059f5716434d3a8be4b6d3f12c";
const SENDER_T2 = "0x02f8af822105078459682f008506fc23ac00830186a094111111111111111111111111111111111111111184075bcd1584a9059cbbf838f7942222222222222222222222222222222222222222e1a0000000000000000000000000000000000000000000000000000000000000000301a0f984a588d8d9d1015297234c11be7636934485c3472b29e384090f054c7b3d11a04c146271197744cb90664d2ee14d4e488e7f78f69f0f475767f0d211bf872ba9";
const SENDER_LEGACY_KEY1 = "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008026a0460787a3c09748220e60d5ebf934e92be18601ddd326693df104c63f7399e7f4a0104afdbec1ff1d63c4b2d38e2722eb3a7d2adee6246c4eceefe3d13a92d44ae7";
check("EIP-155 published transaction recovers its published sender",
  (() => { const r = app.recoverTransactionSender(EIP155_TX); return r !== null && r.sender === EIP155_SENDER && r.type === "legacy" && r.chainId === "1" && r.signingHash === tx155.signingHash && r.txHash === tx155.txHash; })());
check("type 1 oracle transaction (Unichain 130, EIP-155 example key) recovers that key's published address",
  (() => { const r = app.recoverTransactionSender(SENDER_T1); return r !== null && r.sender === EIP155_SENDER && r.type === "eip2930" && r.chainId === "130" && r.signingHash === "0xcb1fdb812ec7d3978d2d7a9ec8a534e7337db0c950c93c88058486a2403e650b" && r.txHash === "0xc17f75c51328479cd3bb0a350ac03c741698db6a6d72af2552e039d895d41c0a"; })());
check("type 2 oracle transaction (Base 8453, private key 1) recovers key 1's published address",
  (() => { const r = app.recoverTransactionSender(SENDER_T2); return r !== null && r.sender === KEY1_ADDR && r.type === "eip1559" && r.chainId === "8453" && r.signingHash === "0x3f9a08ab00f217d6e294fb1d1cdc30c1df90641413a54a002521e2b33f34cb51" && r.txHash === "0xb0b558295d49fd3e922e93bdfd18d12102b0933f6195bb4dece6f25184a8d57a"; })());
check("legacy oracle transaction over the EIP-155 fields (private key 1, v 38) recovers key 1's published address",
  (() => { const r = app.recoverTransactionSender(SENDER_LEGACY_KEY1); return r !== null && r.sender === KEY1_ADDR && r.chainId === "1" && r.signingHash === "0xdaf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53"; })());
check("wrong-parity type 2 transaction recovers a different sender, not an error (Python oracle)",
  (() => { const r = app.recoverTransactionSender("0x02f8af822105078459682f008506fc23ac00830186a094111111111111111111111111111111111111111184075bcd1584a9059cbbf838f7942222222222222222222222222222222222222222e1a0000000000000000000000000000000000000000000000000000000000000000380a0f984a588d8d9d1015297234c11be7636934485c3472b29e384090f054c7b3d11a04c146271197744cb90664d2ee14d4e488e7f78f69f0f475767f0d211bf872ba9"); return r !== null && r.sender === app.toChecksumAddress("0xa889bfc89edab5560fcd903c2e908183e80d0359") && r.sender !== KEY1_ADDR; })());
check("type 3 oracle transaction (Ethereum L1, private key 1) recovers key 1's published address",
  (() => { const r = app.recoverTransactionSender(TYPE3_TX); return r !== null && r.sender === KEY1_ADDR && r.type === "eip4844" && r.chainId === "1" && r.signingHash === tx3.signingHash && r.txHash === tx3.txHash && r.authorizations === null; })());
check("sender recovery refuses unsigned and high-s type 3 transactions",
  app.recoverTransactionSender("0x03f8b3010b84773594008506fc23ac008301d4c09435353535353535353535353535353535353535358806f05b59d3b2000080f838f7941111111111111111111111111111111111111111e1a000000000000000000000000000000000000000000000000000000000000000018477359400f842a0013fa2d9cad26df768c1b09203b0275f0f4d2d7ddf2be8f77fbd65f931c7e2efa001ef71c1e14b31badcc6d27d0e32ca041bce8fc2558c385a931a1c005ad2efaf") === null &&
  app.recoverTransactionSender("0x03f8f6010b84773594008506fc23ac008301d4c09435353535353535353535353535353535353535358806f05b59d3b2000080f838f7941111111111111111111111111111111111111111e1a000000000000000000000000000000000000000000000000000000000000000018477359400f842a0013fa2d9cad26df768c1b09203b0275f0f4d2d7ddf2be8f77fbd65f931c7e2efa001ef71c1e14b31badcc6d27d0e32ca041bce8fc2558c385a931a1c005ad2efaf80a033a036da1cc7d995b6db724a549dbd6293ef2615852d20f39309a0c7f6f5dccba0ca201b0f273c6534285d1c6a1657c1f0914bc6040ef6e921df3eb8478abe05b5") === null);
check("type 4 oracle transaction (Base 8453, private key 1) recovers key 1's published address and both authorization authorities",
  (() => { const r = app.recoverTransactionSender(TYPE4_TX); return r !== null && r.sender === KEY1_ADDR && r.type === "eip7702" && r.chainId === "8453" && r.signingHash === tx4.signingHash && r.txHash === tx4.txHash && Array.isArray(r.authorizations) && r.authorizations.length === 2 && r.authorizations[0].authority === EIP155_SENDER && r.authorizations[0].address === app.toChecksumAddress("0x1111111111111111111111111111111111111111") && r.authorizations[1].authority === KEY1_ADDR && r.authorizations[1].chainId === "0"; })());
check("type 4 transaction with a high-s authorization twin: sender still recovers, that authority is null (client skips the tuple)",
  (() => { const r = app.recoverTransactionSender("0x04f9016b822105078459682f008506fc23ac00830186a0943535353535353535353535353535353535353535880de0b6b3a764000080f838f7941111111111111111111111111111111111111111e1a00000000000000000000000000000000000000000000000000000000000000001f8baf85c8221059411111111111111111111111111111111111111110301a0ecd286ae19eaf8f55a47fb2e6156cdb85fd63de22fefb8dce806acedcb1ea797a0f952e60171a781e3aabcda29a8fc23f9ebd7f080bc9ef0bdf22a4e0be57d8e4ef85a809422222222222222222222222222222222222222228080a0d43d780f5b5453c2f7764e99b203ce176e125b69bff96662f0d5f95032783801a0037051652f758859a9ffaffb0e085c18ad35fbdfa23e6d94d318c47a7742c2e180a083eba35bd56227d8ab8a9333cfc09c57b07f9921bc1605fad9a8fb5947543a7ca0567e2dcb44bf1fa8e5f41f994489d206e320e97d2bac09d0bd863e38e7ed9d1d"); return r !== null && r.sender === KEY1_ADDR && r.authorizations[0].authority === null && r.authorizations[1].authority === KEY1_ADDR; })());
check("non-7702 sender recovery carries no authorizations; unsigned type 4 has no sender",
  (() => { const r = app.recoverTransactionSender(EIP155_TX); return r !== null && r.authorizations === null; })() &&
  app.recoverTransactionSender("0x04f90128822105078459682f008506fc23ac00830186a0943535353535353535353535353535353535353535880de0b6b3a764000080f838f7941111111111111111111111111111111111111111e1a00000000000000000000000000000000000000000000000000000000000000001f8baf85c8221059411111111111111111111111111111111111111110380a0ecd286ae19eaf8f55a47fb2e6156cdb85fd63de22fefb8dce806acedcb1ea797a006ad19fe8e587e1c554325d65703dc04ced6ec65f2a9af7dcda81080eab8b2f3f85a809422222222222222222222222222222222222222228080a0d43d780f5b5453c2f7764e99b203ce176e125b69bff96662f0d5f95032783801a0037051652f758859a9ffaffb0e085c18ad35fbdfa23e6d94d318c47a7742c2e1") === null);
check("sender recovery refuses unsigned, malleable, and malformed transactions",
  app.recoverTransactionSender("0xe9098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a764000080") === null &&
  app.recoverTransactionSender("0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a0460787a3c09748220e60d5ebf934e92be18601ddd326693df104c63f7399e7f4a0efb502413e00e29c3b4d2c71d8dd14c43d83fe008adc516ccfee8d523d61f65a") === null &&
  app.recoverTransactionSender("0x03" + EIP155_TX.slice(2)) === null &&
  app.recoverTransactionSender(EIP155_TX + "00") === null &&
  app.recoverTransactionSender("") === null &&
  app.recoverTransactionSender("0xzz") === null &&
  app.recoverTransactionSender(null) === null);
check("transaction sender tool section present in index.html", html.includes("txs-btn") && html.includes("Transaction sender recovery"));

/* standalone RLP encoder / decoder — worked examples published in the
   ethereum.org RLP specification, plus vectors from an independent
   pure-Python RLP encoder written from the same rules (long-list form,
   2^256-1, nested empties, the complex nested example) */
check("RLP controls labelled",
  ["rlp-enc-input", "rlp-dec-input"].every(id => html.includes(`for="${id}"`)));
check("RLP encoder reproduces the specification's published examples",
  app.rlpEncodeInput("\"dog\"") === "0x83646f67" &&
  app.rlpEncodeInput("dog") === "0x83646f67" &&
  app.rlpEncodeInput("[\"cat\", \"dog\"]") === "0xc88363617483646f67" &&
  app.rlpEncodeInput("\"\"") === "0x80" &&
  app.rlpEncodeInput("[]") === "0xc0" &&
  app.rlpEncodeInput("0") === "0x80" &&
  app.rlpEncodeInput("15") === "0x0f" &&
  app.rlpEncodeInput("1024") === "0x820400" &&
  app.rlpEncodeInput("0x0400") === "0x820400" &&
  app.rlpEncodeInput("[[], [[]], [[], [[]]]]") === "0xc7c0c1c0c3c0c1c0" &&
  app.rlpEncodeInput("\"Lorem ipsum dolor sit amet, consectetur adipisicing elit\"") === "0xb8384c6f72656d20697073756d20646f6c6f722073697420616d65742c20636f6e7365637465747572206164697069736963696e6720656c6974");
check("RLP encoder matches the independent Python oracle on further vectors",
  app.rlpEncodeInput("[\"cat\", [\"puppy\", \"cow\"], \"horse\", [[]], \"pig\", [\"\"], \"sheep\"]") === "0xe383636174ca85707570707983636f7785686f727365c1c083706967c180857368656570" &&
  app.rlpEncodeInput("[\"aaaaaaaaaaaaaaaaaaaa\", \"bbbbbbbbbbbbbbbbbbbb\", \"cccccccccccccccccccc\"]") === "0xf83f946161616161616161616161616161616161616161946262626262626262626262626262626262626262946363636363636363636363636363636363636363" &&
  app.rlpEncodeInput("115792089237316195423570985008687907853269984665640564039457584007913129639935") === "0xa0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" &&
  app.rlpEncodeInput("[\"\", [\"\"], 0]") === "0xc480c18080");
check("RLP decoder renders the specification's examples back",
  app.rlpDecodeInput("0xc88363617483646f67") === "[0x636174 (\"cat\"), 0x646f67 (\"dog\")]" &&
  app.rlpDecodeInput("0x80") === "0x" &&
  app.rlpDecodeInput("0xc0") === "[]" &&
  app.rlpDecodeInput("0xc7c0c1c0c3c0c1c0") === "[[], [[]], [[], [[]]]]" &&
  app.rlpDecodeInput("0x820400") === "0x0400" &&
  app.rlpDecodeInput("0x0f") === "0x0f" &&
  app.rlpDecodeInput(app.rlpEncodeInput("[\"cat\", [\"puppy\", \"cow\"], \"horse\", [[]], \"pig\", [\"\"], \"sheep\"]")) === "[0x636174 (\"cat\"), [0x7075707079 (\"puppy\"), 0x636f77 (\"cow\")], 0x686f727365 (\"horse\"), [[]], 0x706967 (\"pig\"), [0x], 0x7368656570 (\"sheep\")]");
check("RLP decoder refuses non-canonical, truncated, and trailing data",
  app.rlpDecodeInput("0x8100") === null &&
  app.rlpDecodeInput("0xb80161") === null &&
  app.rlpDecodeInput("0x83646f67ff") === null &&
  app.rlpDecodeInput("0x83646f") === null &&
  app.rlpDecodeInput("") === null &&
  app.rlpDecodeInput("0x") === null &&
  app.rlpDecodeInput(null) === null);
check("RLP encoder refuses malformed values",
  app.rlpEncodeInput("\"dog") === null &&
  app.rlpEncodeInput("[1, 2") === null &&
  app.rlpEncodeInput("0x123") === null &&
  app.rlpEncodeInput("]") === null &&
  app.rlpEncodeInput("   ") === null &&
  app.rlpEncodeInput("1 2") === null &&
  app.rlpEncodeInput("{dog}") === null &&
  app.rlpEncodeInput(null) === null);
check("RLP tool section present in index.html", html.includes("rlp-enc-btn") && html.includes("rlp-dec-btn") && html.includes("RLP encoder &amp; decoder"));
check("RLP specification linked from index.html", html.includes("https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/"));

/* EIP-4844 blob gas & base fee — vectors from an independent pure-Python
   transcription of the EIP-4844 pseudocode (fake_exponential,
   calc_excess_blob_gas, calc_blob_fee) with EIP-7691's Prague parameters;
   fake_exponential at 10x the update fraction reproduces floor(e^10) */
check("blob controls labelled",
  ["blob-schedule", "blob-excess", "blob-used", "blob-count"].every(id => html.includes(`for="${id}"`)));
check("fake_exponential matches the specification's approximation",
  app.fakeExponential(1n, 0n, 3338477n) === 1n &&
  app.fakeExponential(1n, 3338477n, 3338477n) === 2n &&
  app.fakeExponential(1n, 33384770n, 3338477n) === 22026n &&
  app.fakeExponential(1n, 5007716n, 5007716n) === 2n &&
  app.fakeExponential(1n, 50077160n, 5007716n) === 22026n);
check("blob excess update follows calc_excess_blob_gas on both schedules",
  app.blobFeeCalc("0", "0", "1", "cancun").excessBlobGas === "0" &&
  app.blobFeeCalc("0", "393216", "1", "cancun").excessBlobGas === "0" &&
  app.blobFeeCalc("100000", "100000", "1", "cancun").excessBlobGas === "0" &&
  app.blobFeeCalc("0", "786432", "1", "cancun").excessBlobGas === "393216" &&
  app.blobFeeCalc("0", "1179648", "1", "prague").excessBlobGas === "393216" &&
  app.blobFeeCalc("5000000", "0", "1", "cancun").excessBlobGas === "4606784" &&
  app.blobFeeCalc("5000000", "0", "1", "prague").excessBlobGas === "4213568");
check("blob fee pipeline matches the Python oracle (base fee and totals)",
  app.blobFeeCalc("0", "786432", "6", "cancun").totalFeeWei === "786432" &&
  app.blobFeeCalc("0", "1179648", "2", "prague").totalFeeWei === "262144" &&
  app.blobFeeCalc("0", "1179648", "2", "prague").totalFeeEth === "0.000000000000262144" &&
  app.blobFeeCalc("20000000", "393216", "3", "cancun").baseFeeWei === "399" &&
  app.blobFeeCalc("20000000", "393216", "3", "cancun").totalFeeWei === "156893184" &&
  app.blobFeeCalc("20000000", "786432", "3", "prague").baseFeeWei === "54" &&
  app.blobFeeCalc("20000000", "786432", "3", "prague").totalFeeWei === "21233664" &&
  app.blobFeeCalc("20000000", "393216", "1", "cancun").baseFeeGwei === "0.000000399" &&
  app.blobFeeCalc("0", "0", "1", "prague").baseFeeWei === "1");
check("blob calculator refuses out-of-protocol and malformed inputs",
  app.blobFeeCalc("-1", "0", "1", "cancun") === null &&
  app.blobFeeCalc("1.5", "0", "1", "cancun") === null &&
  app.blobFeeCalc("", "0", "1", "cancun") === null &&
  app.blobFeeCalc(null, "0", "1", "cancun") === null &&
  app.blobFeeCalc("0x10", "0", "1", "cancun") === null &&
  app.blobFeeCalc("1000000000", "0", "1", "cancun") === null &&
  app.blobFeeCalc("0", "786433", "1", "cancun") === null &&
  app.blobFeeCalc("0", "1179649", "1", "prague") === null &&
  app.blobFeeCalc("0", "0", "0", "cancun") === null &&
  app.blobFeeCalc("0", "0", "2.5", "cancun") === null &&
  app.blobFeeCalc("0", "0", "1", "osaka") === null &&
  app.blobFeeCalc("0", "0", "1", null) === null);
check("blob tool section present in index.html", html.includes("blob-btn") && html.includes("Blob gas &amp; blob base fee calculator"));
check("EIP-7691 linked from index.html", html.includes("https://eips.ethereum.org/EIPS/eip-7691"));

/* EIP-1559 next-block base fee — vectors from an independent pure-Python
   transcription of the EIP-1559 validation pseudocode, self-validated
   against closed forms the spec never prints: a full parent raises the
   fee by exactly fee//8 (min 1 wei), an empty parent lowers it by
   exactly fee//8, a parent at target leaves it unchanged */
check("basefee controls labelled",
  ["basefee-parent", "basefee-used", "basefee-limit"].every(id => html.includes(`for="${id}"`)));
check("basefee: parent at target leaves the fee unchanged",
  app.nextBaseFee("12", "15000000", "30000000").nextBaseFeeWei === "12000000000" &&
  app.nextBaseFee("12", "15000000", "30000000").direction === "unchanged" &&
  app.nextBaseFee("12", "15000000", "30000000").gasTarget === "15000000");
check("basefee: full parent raises by exactly one eighth, empty lowers by one eighth",
  app.nextBaseFee("12", "30000000", "30000000").nextBaseFeeWei === "13500000000" &&
  app.nextBaseFee("12", "30000000", "30000000").nextBaseFeeGwei === "13.5" &&
  app.nextBaseFee("12", "0", "30000000").nextBaseFeeWei === "10500000000" &&
  app.nextBaseFee("100", "36000000", "36000000").nextBaseFeeWei === "112500000000");
check("basefee: partial parents match the Python oracle",
  app.nextBaseFee("12", "22500000", "30000000").nextBaseFeeWei === "12750000000" &&
  app.nextBaseFee("12", "7500000", "30000000").nextBaseFeeWei === "11250000000" &&
  app.nextBaseFee("10", "30000001", "30000001").nextBaseFeeWei === "11250000083" &&
  app.nextBaseFee("10", "30000001", "30000001").gasTarget === "15000000" &&
  app.nextBaseFee("0.5", "30000000", "30000000").nextBaseFeeWei === "562500000" &&
  app.nextBaseFee("999.999999999", "29999999", "30000000").nextBaseFeeWei === "1124999991665" &&
  app.nextBaseFee("999.999999999", "29999999", "30000000").deltaWei === "124999991666");
check("basefee: 1-wei floor applies to rises only",
  app.nextBaseFee("0.000000007", "15000001", "30000000").nextBaseFeeWei === "8" &&
  app.nextBaseFee("0.000000007", "14999999", "30000000").nextBaseFeeWei === "7" &&
  app.nextBaseFee("0.000000001", "30000000", "30000000").nextBaseFeeWei === "2");
check("basefee calculator refuses out-of-protocol and malformed inputs",
  app.nextBaseFee("12", "30000001", "30000000") === null &&
  app.nextBaseFee("12", "0", "0") === null &&
  app.nextBaseFee("12", "0", "1") === null &&
  app.nextBaseFee("-1", "0", "30000000") === null &&
  app.nextBaseFee("12", "1.5", "30000000") === null &&
  app.nextBaseFee("12", "0x10", "30000000") === null &&
  app.nextBaseFee("", "0", "30000000") === null &&
  app.nextBaseFee(null, "0", "30000000") === null &&
  app.nextBaseFee("12", null, "30000000") === null &&
  app.nextBaseFee("12.0000000001", "0", "30000000") === null &&
  app.nextBaseFee("12", "18446744073709551616", "18446744073709551616") === null);
check("basefee tool section present in index.html", html.includes("basefee-btn") && html.includes("Next-block base fee calculator"));
check("EIP-1559 linked from index.html", html.includes("https://eips.ethereum.org/EIPS/eip-1559"));

/* SHA-256 & EIP-4844 blob versioned hash — the hash function is anchored
   on the published FIPS 180-4 example digests; the versioned hashes come
   from an independent Python hashlib transcription of EIP-4844's
   kzg_to_versioned_hash (0x01 || sha256(commitment)[1:]), whose hashlib
   was itself validated against the same FIPS vectors first */
const sha256HexOf = bytes => app.sha256Bytes(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
const asciiBytesOf = s => Array.from(s, c => c.charCodeAt(0));
check("vhash controls labelled",
  ["vhash-commitment"].every(id => html.includes(`for="${id}"`)));
check("sha256 matches the published FIPS 180-4 vectors",
  sha256HexOf([]) === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" &&
  sha256HexOf(asciiBytesOf("abc")) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" &&
  sha256HexOf(asciiBytesOf("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")) === "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1" &&
  sha256HexOf(new Array(1000000).fill(97)) === "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
check("blob versioned hash matches the Python hashlib oracle",
  app.blobVersionedHash("0x" + "00".repeat(48)) === "0x01b0761f87b081d5cf10757ccc89f12be355c70e2e29df288b65b30710dcbcd1" &&
  app.blobVersionedHash("0xc0" + "00".repeat(47)) === "0x010657f37554c781402a22917dee2f75def7ab966d7b770905398eba3c444014" &&
  app.blobVersionedHash("0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f") === "0x01bdc2b2b62cb00749785bc84202236dbc3777d74660611b8e58812f0cfde6c3" &&
  app.blobVersionedHash("0xfffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e0dfdedddcdbdad9d8d7d6d5d4d3d2d1d0") === "0x010897da37c9d7a1204474cceff52fce21d87e104801246ca755e84022c77003" &&
  app.blobVersionedHash("0x941f39fb8c32e7d8ad471b89b3894049bc5f6dff797c6a03849c2520d0cacd52d387a3f3e5c0aebd3847c2dde0a248dd") === "0x018318778b5bd0a2dca21ce65b8e9b1e2d2238480e8e2369e2f310b5f28d650d");
check("blob versioned hash accepts bare and uppercase hex, output starts with the 0x01 KZG version byte",
  app.blobVersionedHash("00".repeat(48)) === "0x01b0761f87b081d5cf10757ccc89f12be355c70e2e29df288b65b30710dcbcd1" &&
  app.blobVersionedHash(("0x" + "ab".repeat(48)).toUpperCase()) === app.blobVersionedHash("0x" + "ab".repeat(48)) &&
  app.blobVersionedHash("0x" + "ab".repeat(48)).startsWith("0x01"));
check("prefilled vhash commitment is 48 bytes and hashes to the point-at-infinity vector",
  (() => { const m = /id="vhash-commitment"[^>]*value="([^"]+)"/.exec(html); return m !== null && m[1].length === 98 && app.blobVersionedHash(m[1]) === "0x010657f37554c781402a22917dee2f75def7ab966d7b770905398eba3c444014"; })());
check("blob versioned hash refuses anything that is not exactly 48 bytes of hex",
  app.blobVersionedHash("") === null &&
  app.blobVersionedHash("0x") === null &&
  app.blobVersionedHash("0x" + "00".repeat(47)) === null &&
  app.blobVersionedHash("0x" + "00".repeat(49)) === null &&
  app.blobVersionedHash("0x" + "00".repeat(32)) === null &&
  app.blobVersionedHash("0xzz" + "00".repeat(47)) === null &&
  app.blobVersionedHash("0x" + "0".repeat(95)) === null &&
  app.blobVersionedHash(null) === null);
check("vhash tool section present in index.html", html.includes("vhash-btn") && html.includes("Blob versioned hash calculator"));

/* Intrinsic gas — verified against an independent pure-Python
   transcription of the rules in EIP-2930 / EIP-2028 (standard cost),
   EIP-3860 (initcode metering + limit), EIP-7702 (per-authorization
   cost) and EIP-7623 (calldata floor: minimum is the larger of the
   standard cost and 21000 + 10 * tokens, tokens = zero + 4*nonzero) */
check("ig controls labelled",
  ["ig-data", "ig-kind", "ig-addrs", "ig-keys", "ig-auths"].every(id => html.includes(`for="${id}"`)));
check("ig: empty call is exactly the 21000 base",
  app.intrinsicGas("0x", "call", "0", "0", "0").minimum === "21000" &&
  app.intrinsicGas("0x", "call", "0", "0", "0").standard === "21000" &&
  app.intrinsicGas("0x", "call", "0", "0", "0").floor === "21000" &&
  app.intrinsicGas("0x", "call", "0", "0", "0").floorBinds === false);
check("ig: prefilled baz calldata matches the Python oracle and the floor binds",
  (() => { const m = /id="ig-data"[^>]*>([^<]+)</.exec(html); const r = m && app.intrinsicGas(m[1].trim(), "call", "0", "0", "0");
    return r !== null && r.byteLength === "68" && r.zeroBytes === "62" && r.nonzeroBytes === "6" &&
      r.tokens === "86" && r.dataCost === "344" && r.standard === "21344" && r.floor === "21860" &&
      r.minimum === "21860" && r.floorBinds === true; })());
check("ig: floor binds on data-heavy calldata, standard cost binds otherwise",
  app.intrinsicGas("0x" + "ff".repeat(100), "call", "0", "0", "0").minimum === "25000" &&
  app.intrinsicGas("0x" + "00".repeat(100), "call", "0", "0", "0").minimum === "22000" &&
  app.intrinsicGas("0x" + "00".repeat(100), "call", "0", "0", "0").standard === "21400" &&
  app.intrinsicGas("0xa9059cbb", "call", "1", "2", "2").minimum === "77264");
check("ig: creation adds 32000 plus the per-word initcode cost",
  app.intrinsicGas("0x" + "60".repeat(32), "create", "0", "0", "0").createCost === "32002" &&
  app.intrinsicGas("0x" + "60".repeat(32), "create", "0", "0", "0").minimum === "53514" &&
  app.intrinsicGas("0x" + "00".repeat(33), "create", "0", "0", "0").createCost === "32004" &&
  app.intrinsicGas("0x" + "00".repeat(33), "create", "0", "0", "0").minimum === "53136" &&
  app.intrinsicGas("0x" + "00".repeat(49152), "create", "0", "0", "0").minimum === "512520");
check("ig: access list and authorization totals match the Python oracle",
  app.intrinsicGas("0x", "call", "2", "3", "0").accessCost === "10500" &&
  app.intrinsicGas("0x", "call", "2", "3", "0").minimum === "31500" &&
  app.intrinsicGas("0x0001000203", "call", "1", "0", "1").minimum === "48456" &&
  app.intrinsicGas("0x0001000203", "call", "1", "0", "1").authCost === "25000");
check("ig calculator refuses invalid, out-of-protocol and malformed inputs",
  app.intrinsicGas("", "call", "0", "0", "0") === null &&
  app.intrinsicGas("0x0", "call", "0", "0", "0") === null &&
  app.intrinsicGas("0xzz", "call", "0", "0", "0") === null &&
  app.intrinsicGas("0x", "bogus", "0", "0", "0") === null &&
  app.intrinsicGas("0x" + "00".repeat(49153), "create", "0", "0", "0") === null &&
  app.intrinsicGas("0x", "create", "0", "0", "1") === null &&
  app.intrinsicGas("0x", "call", "-1", "0", "0") === null &&
  app.intrinsicGas("0x", "call", "0", "1.5", "0") === null &&
  app.intrinsicGas("0x", "call", "1000001", "0", "0") === null &&
  app.intrinsicGas(null, "call", "0", "0", "0") === null &&
  app.intrinsicGas("0x", "call", null, "0", "0") === null);
check("ig tool section present in index.html", html.includes("ig-btn") && html.includes("Intrinsic gas calculator"));
check("EIP-7623 linked from index.html", html.includes("https://eips.ethereum.org/EIPS/eip-7623"));
check("EIP-3860 linked from index.html", html.includes("https://eips.ethereum.org/EIPS/eip-3860"));

/* Uniswap V2 pair / V3 pool addresses — canonical Ethereum-mainnet pairs
   and pools (the addresses the factories' getPair/getPool return), plus
   the Uniswap V2 docs worked example. Expected values were reproduced by
   an independent pure-Python Keccak-256 + CREATE2 oracle written from
   Uniswap's published derivations (V2: salt over the packed token pair;
   V3: salt over abi.encode(token0, token1, fee)) before being anchored
   on these published addresses. */
const POOL_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const POOL_WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const POOL_DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const POOL_USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const POOL_WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
check("pool controls labelled in index.html",
  html.includes('for="pool-factory"') && html.includes('for="pool-token-a"') &&
  html.includes('for="pool-token-b"') && html.includes('for="pool-fee"') &&
  html.includes('for="pool-init"') && html.includes('for="pool-protocol"'));
check("pool: canonical V2 pairs reproduced",
  app.uniswapPoolAddress("v2", app.UNISWAP_V2_FACTORY, POOL_USDC, POOL_WETH, null, app.UNISWAP_V2_INIT_CODE_HASH).address === "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc" &&
  app.uniswapPoolAddress("v2", app.UNISWAP_V2_FACTORY, POOL_DAI, POOL_WETH, null, app.UNISWAP_V2_INIT_CODE_HASH).address === "0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11" &&
  app.uniswapPoolAddress("v2", app.UNISWAP_V2_FACTORY, POOL_WBTC, POOL_WETH, null, app.UNISWAP_V2_INIT_CODE_HASH).address === "0xBb2b8038a1640196FbE3e38816F3e67Cba72D940");
check("pool: V2 docs worked example (CAFE/F00D) reproduced",
  app.uniswapPoolAddress("v2", app.UNISWAP_V2_FACTORY, "0xCAFE000000000000000000000000000000000000", "0xF00D000000000000000000000000000000000000", null, app.UNISWAP_V2_INIT_CODE_HASH).address === "0x4D5B55aE12922Cd1F53a8593507A491723C01E00");
check("pool: canonical V3 pools reproduced at both fee tiers",
  app.uniswapPoolAddress("v3", app.UNISWAP_V3_FACTORY, POOL_USDC, POOL_WETH, "3000", app.UNISWAP_V3_INIT_CODE_HASH).address === "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8" &&
  app.uniswapPoolAddress("v3", app.UNISWAP_V3_FACTORY, POOL_USDC, POOL_WETH, "500", app.UNISWAP_V3_INIT_CODE_HASH).address === "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640" &&
  app.uniswapPoolAddress("v3", app.UNISWAP_V3_FACTORY, POOL_WETH, POOL_USDT, "3000", app.UNISWAP_V3_INIT_CODE_HASH).address === "0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36" &&
  app.uniswapPoolAddress("v3", app.UNISWAP_V3_FACTORY, POOL_DAI, POOL_WETH, "3000", app.UNISWAP_V3_INIT_CODE_HASH).address === "0xC2e9F25Be6257c210d7Adf0D4Cd6E3E881ba25f8");
check("pool: token order is normalised (sorted token0/token1, same address either way in)",
  (() => { const r = app.uniswapPoolAddress("v3", app.UNISWAP_V3_FACTORY, POOL_WETH, POOL_USDC, "3000", app.UNISWAP_V3_INIT_CODE_HASH);
    return r.address === "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8" && r.token0 === POOL_USDC && r.token1 === POOL_WETH &&
      /^0x[0-9a-f]{64}$/.test(r.salt); })() &&
  app.uniswapPoolAddress("v2", app.UNISWAP_V2_FACTORY, POOL_WETH, POOL_USDC, null, app.UNISWAP_V2_INIT_CODE_HASH).address === "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc");
check("pool: prefilled page values reproduce the canonical USDC/WETH 0.3% pool",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.uniswapPoolAddress("v3", g("pool-factory"), g("pool-token-a"), g("pool-token-b"), g("pool-fee"), g("pool-init"));
    return r !== null && r.address === "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8"; })());
check("pool calculator refuses factory-invalid and malformed inputs",
  app.uniswapPoolAddress("v3", app.UNISWAP_V3_FACTORY, POOL_USDC, POOL_USDC, "3000", app.UNISWAP_V3_INIT_CODE_HASH) === null &&
  app.uniswapPoolAddress("v2", app.UNISWAP_V2_FACTORY, "0x0000000000000000000000000000000000000000", POOL_WETH, null, app.UNISWAP_V2_INIT_CODE_HASH) === null &&
  app.uniswapPoolAddress("v2", "0x123", POOL_USDC, POOL_WETH, null, app.UNISWAP_V2_INIT_CODE_HASH) === null &&
  app.uniswapPoolAddress("v2", app.UNISWAP_V2_FACTORY, POOL_USDC, POOL_WETH, null, "0x96e8") === null &&
  app.uniswapPoolAddress("v3", app.UNISWAP_V3_FACTORY, POOL_USDC, POOL_WETH, "0", app.UNISWAP_V3_INIT_CODE_HASH) === null &&
  app.uniswapPoolAddress("v3", app.UNISWAP_V3_FACTORY, POOL_USDC, POOL_WETH, "16777216", app.UNISWAP_V3_INIT_CODE_HASH) === null &&
  app.uniswapPoolAddress("v3", app.UNISWAP_V3_FACTORY, POOL_USDC, POOL_WETH, "abc", app.UNISWAP_V3_INIT_CODE_HASH) === null &&
  app.uniswapPoolAddress("v4", app.UNISWAP_V3_FACTORY, POOL_USDC, POOL_WETH, "3000", app.UNISWAP_V3_INIT_CODE_HASH) === null &&
  app.uniswapPoolAddress("v3", app.UNISWAP_V3_FACTORY, null, POOL_WETH, "3000", app.UNISWAP_V3_INIT_CODE_HASH) === null);
check("pool tool section present in index.html", html.includes("pool-btn") && html.includes("Uniswap V2 pair"));
check("Uniswap V2 pair-address docs linked from index.html", html.includes("https://developers.uniswap.org/docs/protocols/v2/guides/getting-pair-addresses"));
check("v3-periphery PoolAddress linked from index.html", html.includes("https://github.com/Uniswap/v3-periphery/blob/main/contracts/libraries/PoolAddress.sol"));

/* Uniswap V2 swap quotes — expected values produced by an independent
   pure-Python transcription of UniswapV2Library's three formulas
   (getAmountOut with the 997/1000 fee factor, getAmountIn rounding the
   required input up by 1, quote as the raw reserve ratio), whose
   round-trip property was also asserted in Python: the required input
   for a floored output reproduces that output, and 1 unit less does
   not. Price impact is 1 − (out × reserveIn)/(in × reserveOut) as a
   percent truncated to 4 decimals. */
check("v2q controls labelled in index.html",
  html.includes('for="v2q-mode"') && html.includes('for="v2q-reserve-in"') &&
  html.includes('for="v2q-reserve-out"') && html.includes('for="v2q-amount"'));
check("v2q: exact-input quotes match the Python oracle",
  (() => { const V = [
    ["1000000", "1000000", "10000", "9871", "1.2900", "1010000", "990129"],
    ["5000000", "2500000", "25000", "12400", "0.8000", "5025000", "2487600"],
    ["123456789", "987654321", "1000000", "7912104", "1.0987", "124456789", "979742217"],
    ["1000000000000000000000000", "400000000000000000000000", "100000000000000000000", "39876024360371270984", "0.3099", "1000100000000000000000000", "399960123975639628729016"],
    ["777", "333", "100", "37", "13.6666", "877", "296"],
    ["5192296858534827628530496329220095", "2596148429267413814265248164610048", "1000000000000000000", "498499999999999904", "0.3000", "5192296858534828628530496329220095", "2596148429267413315765248164610144"]
  ]; return V.every(([ri, ro, ai, ao, imp, nri, nro]) => { const r = app.uniswapV2Quote("out", ri, ro, ai);
    return r !== null && r.amountIn === ai && r.amountOut === ao && r.impactPercent === imp && r.newReserveIn === nri && r.newReserveOut === nro; }); })());
check("v2q: exact-output quotes match the Python oracle",
  (() => { const V = [
    ["1000000", "1000000", "9871", "10000", "1.2900"],
    ["8000000", "2000000", "100000", "422320", "5.2850"],
    ["10000000000000000000000", "10000000000000000000000", "1000000000000000000", "1003109338015045236", "0.3099"],
    ["999983", "499979", "123457", "328869", "24.9183"]
  ]; return V.every(([ri, ro, ao, ai, imp]) => { const r = app.uniswapV2Quote("in", ri, ro, ao);
    return r !== null && r.amountOut === ao && r.amountIn === ai && r.impactPercent === imp &&
      r.newReserveIn === (BigInt(ri) + BigInt(ai)).toString() && r.newReserveOut === (BigInt(ro) - BigInt(ao)).toString(); }); })());
check("v2q: spot quotes are the raw reserve ratio (no fee, no impact figure)",
  (() => { const V = [
    ["1000000", "1000000", "10000", "10000"],
    ["3000000", "7500000", "40000", "100000"],
    ["100000000000000000000", "50000000000000000000", "123456789", "61728394"]
  ]; return V.every(([ri, ro, ai, ao]) => { const r = app.uniswapV2Quote("quote", ri, ro, ai);
    return r !== null && r.amountOut === ao && r.impactPercent === null && r.newReserveIn === ri && r.newReserveOut === ro; }); })());
check("v2q: round trip — required input for a quoted output is minimal and sufficient",
  (() => { const cases = [["1000000", "1000000", "10000", "10000"], ["5000000", "2500000", "25000", "24999"], ["777", "333", "100", "98"]];
    return cases.every(([ri, ro, ai, back]) => { const out = app.uniswapV2Quote("out", ri, ro, ai);
      const inn = app.uniswapV2Quote("in", ri, ro, out.amountOut);
      if (inn.amountIn !== back || BigInt(back) > BigInt(ai)) return false;
      const oneLess = app.uniswapV2Quote("out", ri, ro, (BigInt(back) - 1n).toString());
      return oneLess === null || BigInt(oneLess.amountOut) < BigInt(out.amountOut); }); })());
check("v2q: prefilled page values reproduce the oracle's 9871 for 10000 in",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.uniswapV2Quote("out", g("v2q-reserve-in"), g("v2q-reserve-out"), g("v2q-amount"));
    return r !== null && r.amountOut === "9871" && r.impactPercent === "1.2900"; })());
check("v2q calculator refuses illiquid, impossible and malformed inputs",
  app.uniswapV2Quote("out", "0", "1000000", "10000") === null &&
  app.uniswapV2Quote("out", "1000000", "0", "10000") === null &&
  app.uniswapV2Quote("out", "1000000", "1000000", "0") === null &&
  app.uniswapV2Quote("in", "1000000", "1000000", "1000000") === null &&
  app.uniswapV2Quote("in", "1000000", "1000000", "1000001") === null &&
  app.uniswapV2Quote("out", "5192296858534827628530496329220096", "1000000", "10000") === null &&
  app.uniswapV2Quote("out", "1000000000000000000000000", "1", "1") === null &&
  app.uniswapV2Quote("out", "1000000", "1000000", "1.5") === null &&
  app.uniswapV2Quote("out", "1000000", "1000000", "-3") === null &&
  app.uniswapV2Quote("out", "1000000", "1000000", "") === null &&
  app.uniswapV2Quote("amounts", "1000000", "1000000", "10000") === null &&
  app.uniswapV2Quote("out", "1000000", "1000000", "1".repeat(79)) === null &&
  app.uniswapV2Quote("out", null, "1000000", "10000") === null);
check("v2q tool section present in index.html", html.includes("v2q-btn") && html.includes("Uniswap V2 swap quote calculator"));
check("UniswapV2Library linked from index.html", html.includes("https://github.com/Uniswap/v2-periphery/blob/master/contracts/libraries/UniswapV2Library.sol"));

/* Uniswap V2 liquidity mint & burn — expected values produced by an
   independent pure-Python transcription of UniswapV2Pair's mint/burn
   formulas and Math.sqrt's Babylonian method (hidden_files/oracle-v2liq.py),
   its sqrt cross-checked against math.isqrt on every case. Mint vectors
   are [reserve0, reserve1, totalSupply, amount0, amount1] →
   [liquidity, locked, newTotalSupply, sharePercent]; burn vectors are
   [balance0, balance1, totalSupply, liquidity] → [amount0, amount1,
   newTotalSupply]. */
check("v2l controls labelled in index.html",
  ["v2l-m-reserve0", "v2l-m-reserve1", "v2l-m-supply", "v2l-m-amount0", "v2l-m-amount1",
   "v2l-b-balance0", "v2l-b-balance1", "v2l-b-supply", "v2l-b-liquidity"]
    .every(id => html.includes(`for="${id}"`)));
check("v2l mint into an existing pair matches the Python oracle (min of the two pro-rata sides, floored)",
  (() => { const V = [
    [["1000000", "1000000", "1000000", "10000", "10000"], ["10000", "0", "1010000", "0.9900"]],
    [["1000000", "4000000", "2000000", "10000", "10000"], ["5000", "0", "2005000", "0.2493"]],
    [["1000000", "4000000", "2000000", "10000", "40000"], ["20000", "0", "2020000", "0.9900"]],
    [["1000000", "1000000", "1000000", "1", "1"], ["1", "0", "1000001", "0.0000"]],
    [["123456789", "987654321", "349876543", "111111", "888888"], ["314888", "0", "350191431", "0.0899"]],
    [["5192296858534827628530496329219095", "5192296858534827628530496329219095", "5192296858534827628530496329219095", "1000", "1000"], ["1000", "0", "5192296858534827628530496329220095", "0.0000"]],
    [["100000000000000000000", "17", "999983", "1000000000000000", "3"], ["9", "0", "999992", "0.0009"]]
  ]; return V.every(([inp, exp]) => { const r = app.uniswapV2Mint(...inp);
    return r !== null && r.first === false && r.liquidity === exp[0] && r.locked === exp[1] &&
      r.newTotalSupply === exp[2] && r.sharePercent === exp[3] &&
      r.newReserve0 === (BigInt(inp[0]) + BigInt(inp[3])).toString() &&
      r.newReserve1 === (BigInt(inp[1]) + BigInt(inp[4])).toString(); }); })());
check("v2l first-deposit mint matches the Python oracle (sqrt(product) − 1000 locked)",
  (() => { const V = [
    [["0", "0", "0", "10000", "10000"], ["9000", "10000", "90.0000"]],
    [["0", "0", "0", "1000000", "1000000"], ["999000", "1000000", "99.9000"]],
    [["0", "0", "0", "20000", "5000"], ["9000", "10000", "90.0000"]],
    [["0", "0", "0", "1001", "1001"], ["1", "1001", "0.0999"]],
    [["0", "0", "0", "2000", "600"], ["95", "1095", "8.6757"]],
    [["0", "0", "0", "1000000000000000000", "1000000000000000000"], ["999999999999999000", "1000000000000000000", "99.9999"]],
    [["0", "0", "0", "999999937", "123456789"], ["351363171", "351364171", "99.9997"]]
  ]; return V.every(([inp, exp]) => { const r = app.uniswapV2Mint(...inp);
    return r !== null && r.first === true && r.liquidity === exp[0] && r.locked === "1000" &&
      r.rootK === exp[1] && r.newTotalSupply === exp[1] && r.sharePercent === exp[2] &&
      r.newReserve0 === inp[3] && r.newReserve1 === inp[4]; }); })());
check("v2l MINIMUM_LIQUIDITY constant is the pair's 1000", app.V2_MINIMUM_LIQUIDITY === 1000n);
check("v2l: prefilled mint page values reproduce the oracle's 20000",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.uniswapV2Mint(g("v2l-m-reserve0"), g("v2l-m-reserve1"), g("v2l-m-supply"), g("v2l-m-amount0"), g("v2l-m-amount1"));
    return r !== null && r.liquidity === "20000" && r.sharePercent === "0.9900"; })());
check("v2l mint refuses zero, inconsistent, overflowing and malformed inputs",
  app.uniswapV2Mint("1000000", "1000000", "1000000", "0", "10000") === null &&
  app.uniswapV2Mint("1000000", "1000000", "1000000", "10000", "0") === null &&
  app.uniswapV2Mint("0", "0", "0", "1000", "1000") === null &&
  app.uniswapV2Mint("0", "0", "0", "999", "999") === null &&
  app.uniswapV2Mint("0", "0", "0", "3", "5") === null &&
  app.uniswapV2Mint("0", "0", "5", "10000", "10000") === null &&
  app.uniswapV2Mint("5", "0", "0", "10000", "10000") === null &&
  app.uniswapV2Mint("0", "1000000", "1000000", "10000", "10000") === null &&
  app.uniswapV2Mint("5192296858534827628530496329220095", "1000000", "1000000", "1", "1") === null &&
  app.uniswapV2Mint("1000000", "1000000", "1000000", "1.5", "10000") === null &&
  app.uniswapV2Mint("1000000", "1000000", "1000000", "-3", "10000") === null &&
  app.uniswapV2Mint("1000000", "1000000", "1000000", "", "10000") === null &&
  app.uniswapV2Mint(null, "1000000", "1000000", "10000", "10000") === null);
check("v2l burn matches the Python oracle (pro-rata from balances, floored)",
  (() => { const V = [
    [["1010000", "1010000", "1010000", "10000"], ["10000", "10000", "1000000"]],
    [["1000003", "999983", "777777", "123456"], ["158729", "158726", "654321"]],
    [["2000000", "500000", "1000000", "1000000"], ["2000000", "500000", "0"]],
    [["1000000", "1000000", "1000000", "1"], ["1", "1", "999999"]],
    [["5192296858534827628530496329220095", "5192296858534827628530496329220095", "1000000000000000000000000000000", "100000000000000000000000000000"], ["519229685853482762853049632922009", "519229685853482762853049632922009", "900000000000000000000000000000"]],
    [["987654321012345", "123456789012345", "349123456789", "98765432109"], ["279402898579969", "34925362007294", "250358024680"]]
  ]; return V.every(([inp, exp]) => { const r = app.uniswapV2Burn(...inp);
    return r !== null && r.amount0 === exp[0] && r.amount1 === exp[1] && r.newTotalSupply === exp[2] &&
      r.newBalance0 === (BigInt(inp[0]) - BigInt(exp[0])).toString() &&
      r.newBalance1 === (BigInt(inp[1]) - BigInt(exp[1])).toString(); }); })());
check("v2l: prefilled burn page values reproduce the oracle's 5000 / 20000",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.uniswapV2Burn(g("v2l-b-balance0"), g("v2l-b-balance1"), g("v2l-b-supply"), g("v2l-b-liquidity"));
    return r !== null && r.amount0 === "5000" && r.amount1 === "20000" && r.newTotalSupply === "2010000"; })());
check("v2l burn refuses zero, over-supply, zero-payout and malformed inputs",
  app.uniswapV2Burn("1000000", "1000000", "1000000", "0") === null &&
  app.uniswapV2Burn("1000000", "1000000", "1000000", "1000001") === null &&
  app.uniswapV2Burn("1000000", "3", "1000000", "1") === null &&
  app.uniswapV2Burn("0", "1000000", "1000000", "1") === null &&
  app.uniswapV2Burn("1000000", "1000000", "0", "1") === null &&
  app.uniswapV2Burn("5192296858534827628530496329220096", "1000000", "1000000", "1") === null &&
  app.uniswapV2Burn("1000000", "1000000", "1000000", "1.5") === null &&
  app.uniswapV2Burn("1000000", "1000000", "1000000", null) === null);
check("v2l tool section present in index.html", html.includes("v2l-mint-btn") && html.includes("v2l-burn-btn") && html.includes("Uniswap V2 liquidity mint"));
check("UniswapV2Pair and Math linked from index.html",
  html.includes("https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Pair.sol") &&
  html.includes("https://github.com/Uniswap/v2-core/blob/master/contracts/libraries/Math.sol"));

/* ERC-4626 vault conversion — expected values produced by an independent
   pure-Python transcription of the ERC-4626 preview semantics with the
   virtual-offset construction (hidden_files/oracle-erc4626.py): assets to
   shares multiplies by (totalSupply + 10^offset) / (totalAssets + 1) and
   shares to assets by the inverse, with deposit/redeem rounding down and
   mint/withdraw rounding up (the Python ceil is -(-a // b), a different
   shape from the JS form). Vectors are [totalAssets, totalSupply, amount,
   offset] -> result. */
check("vault controls labelled in index.html",
  ["vault-mode", "vault-assets", "vault-supply", "vault-amount", "vault-offset"]
    .every(id => html.includes(`for="${id}"`)));
check("vault previewDeposit matches the Python oracle (assets -> shares, floored, virtual offset)",
  (() => { const V = [
    [["1000000", "1000000", "10000", "0"], "10000"],
    [["0", "0", "1000", "0"], "1000"],
    [["0", "0", "1000", "3"], "1000000"],
    [["100", "30", "7", "0"], "2"],
    [["1000000", "1", "1000", "0"], "0"],
    [["1000000", "1", "1000", "3"], "1"],
    [["2000000", "1000000", "10000", "0"], "5000"],
    [["1606938044258990275541962092341162602522202993782792835313721", "803469022129495137770981046170581301261101496891396417657477", "98765432109876543210", "6"], "49382716054938271605"]
  ]; return V.every(([inp, exp]) => { const r = app.erc4626Convert("deposit", ...inp);
    return r !== null && r.result === exp && r.rounding === "down" && r.fn === "previewDeposit" &&
      r.inputUnit === "assets" && r.outputUnit === "shares"; }); })());
check("vault previewMint matches the Python oracle (shares -> assets, rounded up)",
  (() => { const V = [
    [["100", "30", "7", "0"], "23"],
    [["0", "0", "1000", "3"], "1"],
    [["1000000", "1000000", "10000", "0"], "10000"],
    [["1606938044258990275541962092341162602522202993782792835313721", "803469022129495137770981046170581301261101496891396417657477", "98765432109876543210", "6"], "197530864219753086420"]
  ]; return V.every(([inp, exp]) => { const r = app.erc4626Convert("mint", ...inp);
    return r !== null && r.result === exp && r.rounding === "up" && r.fn === "previewMint"; }); })());
check("vault previewWithdraw matches the Python oracle (assets -> shares, rounded up)",
  (() => { const V = [
    [["100", "30", "7", "0"], "3"],
    [["0", "0", "5", "0"], "5"],
    [["2000000", "1000000", "10000", "0"], "5001"],
    [["1000000", "1000000", "10000", "0"], "10000"]
  ]; return V.every(([inp, exp]) => { const r = app.erc4626Convert("withdraw", ...inp);
    return r !== null && r.result === exp && r.rounding === "up" && r.fn === "previewWithdraw"; }); })());
check("vault previewRedeem matches the Python oracle (shares -> assets, floored)",
  (() => { const V = [
    [["100", "30", "7", "0"], "22"],
    [["0", "0", "1000", "3"], "1"],
    [["1000000", "1000000", "10000", "0"], "10000"],
    [["1606938044258990275541962092341162602522202993782792835313721", "803469022129495137770981046170581301261101496891396417657477", "98765432109876543210", "6"], "197530864219753086419"]
  ]; return V.every(([inp, exp]) => { const r = app.erc4626Convert("redeem", ...inp);
    return r !== null && r.result === exp && r.rounding === "down" && r.fn === "previewRedeem"; }); })());
check("vault: prefilled page values reproduce the oracle's 10000-share deposit",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.erc4626Convert("deposit", g("vault-assets"), g("vault-supply"), g("vault-amount"), g("vault-offset"));
    return r !== null && r.result === "10000" && r.virtualShares === "1"; })());
check("vault: a zero amount converts to zero in every mode, as the previews return",
  ["deposit", "mint", "withdraw", "redeem"].every(m => { const r = app.erc4626Convert(m, "100", "30", "0", "0"); return r !== null && r.result === "0"; }));
check("vault refuses malformed, out-of-uint8-offset and uint256-overflowing inputs",
  app.erc4626Convert("deposit", "1000000", "1000000", "1.5", "0") === null &&
  app.erc4626Convert("deposit", "1000000", "1000000", "-3", "0") === null &&
  app.erc4626Convert("deposit", "1000000", "1000000", "", "0") === null &&
  app.erc4626Convert("deposit", "1000000", "1000000", "10000", "256") === null &&
  app.erc4626Convert("deposit", "1000000", "1000000", "10000", "-1") === null &&
  app.erc4626Convert("deposit", "1000000", "1000000", "10000", "1.5") === null &&
  app.erc4626Convert("deposit", "1000000", "1000000", "10000", null) === null &&
  app.erc4626Convert("bogus", "1000000", "1000000", "10000", "0") === null &&
  app.erc4626Convert("deposit", null, "1000000", "10000", "0") === null &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.erc4626Convert("deposit", "0", M, M, "0") === null; })());
check("vault tool section present in index.html", html.includes("vault-btn") && html.includes("ERC-4626 vault conversion calculator"));
check("ERC-4626 EIP and OpenZeppelin ERC4626 linked from index.html",
  html.includes("https://eips.ethereum.org/EIPS/eip-4626") &&
  html.includes("https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/extensions/ERC4626.sol"));

/* Compound cToken exchange rate & mint/redeem — expected values produced
   by an independent pure-Python transcription of CToken's stored-rate and
   conversion math (hidden_files/oracle-compound.py): the rate is the
   initial mantissa at zero supply and (cash + borrows - reserves) * 1e18
   // supply afterwards; mint and redeemUnderlying divide the amount by
   the rate (amount * 1e18 // rate), redeem multiplies (tokens * rate
   // 1e18), and every step truncates. Vectors are
   [cash, borrows, reserves, supply, initialRate, amount] -> result. */
check("compound controls labelled in index.html",
  ["comp-mode", "comp-cash", "comp-borrows", "comp-reserves", "comp-supply", "comp-initial", "comp-amount"]
    .every(id => html.includes(`for="${id}"`)));
check("compound exchangeRateStored matches the Python oracle (initial at zero supply, truncated afterwards)",
  (() => { const V = [
    [["8000000", "3000000", "100000", "500000000", "200000000000000000000000000", "0"], "21800000000000000"],
    [["0", "0", "0", "0", "200000000000000000000000000", "0"], "200000000000000000000000000"],
    [["100", "7", "3", "30", "1000000000000000000", "0"], "3466666666666666666"],
    [["50", "50", "100", "30", "1000000000000000000", "0"], "0"],
    [["1606938044258990275541962092341162602522202993782792835301376", "803469022129495137770981046170581301261101496891396417650688", "12345", "1569275433846670190958947355801916604025588861116008628224", "1000000000000000000", "0"], "1535999999999999999999"]
  ]; return V.every(([inp, exp]) => { const r = app.compoundCToken("rate", ...inp);
    return r !== null && r.result === exp && r.exchangeRate === exp && r.fn === "exchangeRateStored"; }); })());
check("compound mint matches the Python oracle (amount x 1e18 // rate, truncated)",
  (() => { const V = [
    [["8000000", "3000000", "100000", "500000000", "200000000000000000000000000", "1000000"], "45871559"],
    [["100", "7", "3", "30", "1000000000000000000", "7"], "2"],
    [["0", "0", "0", "0", "200000000000000000000000000", "1000000000000000000"], "5000000000"],
    [["1606938044258990275541962092341162602522202993782792835301376", "803469022129495137770981046170581301261101496891396417650688", "12345", "1569275433846670190958947355801916604025588861116008628224", "1000000000000000000", "98765432109876543210"], "64300411529867541"]
  ]; return V.every(([inp, exp]) => { const r = app.compoundCToken("mint", ...inp);
    return r !== null && r.result === exp && r.fn === "mint" && r.inputUnit === "underlying" && r.outputUnit === "cTokens"; }); })());
check("compound redeem matches the Python oracle (tokens x rate // 1e18, truncated — the mint round trip pays 999999, not 1000000)",
  (() => { const V = [
    [["8000000", "3000000", "100000", "500000000", "200000000000000000000000000", "45871559"], "999999"],
    [["100", "7", "3", "30", "1000000000000000000", "7"], "24"]
  ]; return V.every(([inp, exp]) => { const r = app.compoundCToken("redeemTokens", ...inp);
    return r !== null && r.result === exp && r.fn === "redeem" && r.inputUnit === "cTokens" && r.outputUnit === "underlying"; }); })());
check("compound redeemUnderlying matches the Python oracle (amount x 1e18 // rate, truncated)",
  (() => { const V = [
    [["8000000", "3000000", "100000", "500000000", "200000000000000000000000000", "999999"], "45871513"],
    [["100", "7", "3", "30", "1000000000000000000", "22"], "6"]
  ]; return V.every(([inp, exp]) => { const r = app.compoundCToken("redeemAmount", ...inp);
    return r !== null && r.result === exp && r.fn === "redeemUnderlying"; }); })());
check("compound: prefilled page values reproduce the oracle's rate and 45871559-cToken mint",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const args = [g("comp-cash"), g("comp-borrows"), g("comp-reserves"), g("comp-supply"), g("comp-initial"), g("comp-amount")];
    const rate = app.compoundCToken("rate", ...args);
    const mint = app.compoundCToken("mint", ...args);
    return rate !== null && rate.result === "21800000000000000" && mint !== null && mint.result === "45871559"; })());
check("compound: a zero amount converts to zero in every conversion mode",
  ["mint", "redeemTokens", "redeemAmount"].every(m => { const r = app.compoundCToken(m, "100", "7", "3", "30", "1000000000000000000", "0"); return r !== null && r.result === "0"; }));
check("compound refuses reserves above cash + borrows, zero rates for conversions, malformed and overflowing inputs",
  app.compoundCToken("rate", "100", "0", "101", "30", "1000000000000000000", "0") === null &&
  app.compoundCToken("rate", "0", "0", "0", "0", "0", "0") === null &&
  app.compoundCToken("mint", "50", "50", "100", "30", "1000000000000000000", "10") === null &&
  app.compoundCToken("redeemAmount", "50", "50", "100", "30", "1000000000000000000", "10") === null &&
  app.compoundCToken("mint", "100", "7", "3", "30", "1000000000000000000", "1.5") === null &&
  app.compoundCToken("mint", "100", "7", "3", "30", "1000000000000000000", "-3") === null &&
  app.compoundCToken("mint", "100", "7", "3", "30", "1000000000000000000", "") === null &&
  app.compoundCToken("mint", "100", "7", "3", "30", "1000000000000000000", null) === null &&
  app.compoundCToken("bogus", "100", "7", "3", "30", "1000000000000000000", "10") === null &&
  app.compoundCToken("mint", null, "7", "3", "30", "1000000000000000000", "10") === null &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundCToken("mint", "0", "0", "0", "0", "1", M) === null; })() &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundCToken("rate", M, "0", "0", "1", "1000000000000000000", "0") === null; })());
check("compound tool section present in index.html", html.includes("comp-btn") && html.includes("Compound cToken exchange rate"));
check("CToken and ExponentialNoError linked from index.html",
  html.includes("https://github.com/compound-finance/compound-protocol/blob/master/contracts/CToken.sol") &&
  html.includes("https://github.com/compound-finance/compound-protocol/blob/master/contracts/ExponentialNoError.sol"));

/* Compound interest accrual — expected values produced by an independent
   pure-Python transcription of CToken.accrueInterest and
   ExponentialNoError's truncating helpers
   (hidden_files/oracle-compound-accrue.py): factor = rate x blocks,
   interest = factor x borrows // 1e18, reserves grow by
   reserveFactor x interest // 1e18, the index by factor x index // 1e18.
   Vectors are [rate, blocks, borrows, reserves, reserveFactor, index]
   -> [factor, interest, borrowsNew, reservesNew, indexNew]. */
check("compound accrual controls labelled in index.html",
  ["cacc-rate", "cacc-blocks", "cacc-borrows", "cacc-reserves", "cacc-factor", "cacc-index"]
    .every(id => html.includes(`for="${id}"`)));
check("compound accrual matches the Python oracle (prefill, truncation, reserve-factor extremes, 2^200 scale, year-long gap)",
  (() => { const V = [
    [["400000000000", "10000", "3000000", "100000", "100000000000000000", "1000000000000000000"], ["4000000000000000", "12000", "3012000", "101200", "1004000000000000000"]],
    [["400000000000", "0", "3000000", "100000", "100000000000000000", "1000000000000000000"], ["0", "0", "3000000", "100000", "1000000000000000000"]],
    [["123456789", "7", "98765432109876543210", "12345", "333333333333333333", "1020000000000000000"], ["864197523", "85352841787", "98765432195229384997", "28450959607", "1020000000881481473"]],
    [["5000000000000", "1", "1000000000000000000", "0", "100000000000000000", "1000000000000000000"], ["5000000000000", "5000000000000", "1000005000000000000", "500000000000", "1000005000000000000"]],
    [["400000000000", "10000", "3000000", "100000", "1000000000000000000", "1000000000000000000"], ["4000000000000000", "12000", "3012000", "112000", "1004000000000000000"]],
    [["400000000000", "10000", "3000000", "100000", "0", "1000000000000000000"], ["4000000000000000", "12000", "3012000", "100000", "1004000000000000000"]],
    [["999999999999", "12345", "1606938044258990275541962092341162602522202993782792835313721", "1427247692705959881058285969449495136382746624", "250000000000000000", "1267650600228229401496703205376"], ["12344999999987655", "19837650156357397301409144795000086806106644305920440955989", "1626775694415347672843371237136162689328309638088713276269710", "4959412539090776573044992158631079987496110571616492985621", "1283299746888031244311520188954"]],
    [["400000000000", "2628000", "3000000", "100000", "100000000000000000", "1000000000000000000"], ["1051200000000000000", "3153600", "6153600", "415360", "2051200000000000000"]]
  ]; return V.every(([inp, exp]) => { const r = app.compoundAccrue(...inp);
    return r !== null && r.factor === exp[0] && r.interest === exp[1] && r.borrows === exp[2] && r.reserves === exp[3] && r.index === exp[4]; }); })());
check("compound accrual: zero borrows accrues no interest but the borrow index still grows by the full factor",
  (() => { const r = app.compoundAccrue("400000000000", "10000", "0", "100000", "100000000000000000", "1000000000000000000");
    return r !== null && r.interest === "0" && r.borrows === "0" && r.index === "1004000000000000000"; })());
check("compound accrual: sub-unit interest truncates to zero while the index still grows by 1",
  (() => { const r = app.compoundAccrue("1", "1", "999999", "5", "100000000000000000", "1000000000000000000");
    return r !== null && r.interest === "0" && r.borrows === "999999" && r.reserves === "5" && r.index === "1000000000000000001"; })());
check("compound accrual: prefilled page values reproduce the oracle's 12000-interest accrual",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.compoundAccrue(g("cacc-rate"), g("cacc-blocks"), g("cacc-borrows"), g("cacc-reserves"), g("cacc-factor"), g("cacc-index"));
    return r !== null && r.interest === "12000" && r.borrows === "3012000" && r.reserves === "101200" && r.index === "1004000000000000000"; })());
check("compound accrual refuses a rate above the contract maximum, a reserve factor above 1e18, malformed and overflowing inputs",
  app.compoundAccrue("5000000000001", "1", "100", "0", "0", "1000000000000000000") === null &&
  app.compoundAccrue("400000000000", "10000", "3000000", "100000", "1000000000000000001", "1000000000000000000") === null &&
  app.compoundAccrue("400000000000", "1.5", "3000000", "100000", "100000000000000000", "1000000000000000000") === null &&
  app.compoundAccrue("400000000000", "-3", "3000000", "100000", "100000000000000000", "1000000000000000000") === null &&
  app.compoundAccrue("400000000000", "", "3000000", "100000", "100000000000000000", "1000000000000000000") === null &&
  app.compoundAccrue(null, "10000", "3000000", "100000", "100000000000000000", "1000000000000000000") === null &&
  app.compoundAccrue("5000000000000", (2n ** 200n).toString(), "100", "0", "0", "1000000000000000000") === null &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundAccrue("400000000000", "10000", M, "0", "0", "1000000000000000000") === null; })());
check("compound accrual tool section present in index.html", html.includes("cacc-btn") && html.includes("Compound interest accrual calculator"));

/* Compound account snapshot — expected values produced by an independent
   pure-Python transcription of CToken.getAccountSnapshot /
   borrowBalanceStoredInternal plus ExponentialNoError's
   mul_ScalarTruncate (hidden_files/oracle-compound-snapshot.py):
   borrow = 0 if principal is 0, else principal x marketIndex //
   snapshotIndex; underlying = tokens x rate // 1e18.
   Vectors are [principal, snapshotIndex, marketIndex, tokens, rate]
   -> [borrow, underlying, tokens]. */
check("compound snapshot controls labelled in index.html",
  ["csnap-principal", "csnap-snap-index", "csnap-market-index", "csnap-tokens", "csnap-rate"]
    .every(id => html.includes(`for="${id}"`)));
check("compound snapshot matches the Python oracle (prefill chain, short-circuit, identity, truncation, index-below-snapshot, 2^150 scale)",
  (() => { const V = [
    [["1000000", "1000000000000000000", "1004000000000000000", "45871559", "21800000000000000"], ["1004000", "999999", "45871559"]],
    [["0", "0", "1000000000000000000", "0", "0"], ["0", "0", "0"]],
    [["0", "0", "1000000000000000000", "12345", "200000000000000000000000000"], ["0", "2469000000000", "12345"]],
    [["777777", "1234567890123456789", "1234567890123456789", "0", "1000000000000000000"], ["777777", "0", "0"]],
    [["1000000", "3000000000000000000", "1000000000000000001", "3", "333333333333333333"], ["333333", "0", "3"]],
    [["1000000", "2000000000000000000", "1000000000000000000", "1000000", "1000000000000000000"], ["500000", "1000000", "1000000"]],
    [["1427247692705959881058285969449495136382746624", "1180591620717411303424", "1208925819614629174706176", "1427247692705959881058285969449495136382746624", "1099511627776"], ["1461501637330902918203684832716283019655932542976", "1569275433846670190958947355801916604025", "1427247692705959881058285969449495136382746624"]],
    [["3000000", "1000000000000000000", "2051200000000000000", "500000000", "21800000000000000"], ["6153600", "10900000", "500000000"]]
  ]; return V.every(([inp, exp]) => { const r = app.compoundSnapshot(...inp);
    return r !== null && r.borrow === exp[0] && r.underlying === exp[1] && r.tokens === exp[2]; }); })());
check("compound snapshot: zero principal short-circuits even with a zero snapshot index",
  (() => { const r = app.compoundSnapshot("0", "0", "1004000000000000000", "100", "21800000000000000");
    return r !== null && r.borrow === "0" && r.underlying === "2"; })());
check("compound snapshot: prefilled page values chain the accrual and exchange-rate tools (owes 1004000, holds 999999)",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.compoundSnapshot(g("csnap-principal"), g("csnap-snap-index"), g("csnap-market-index"), g("csnap-tokens"), g("csnap-rate"));
    return r !== null && r.borrow === "1004000" && r.underlying === "999999" && r.tokens === "45871559"; })());
check("compound snapshot refuses a zero snapshot index with a borrow, malformed and overflowing inputs",
  app.compoundSnapshot("100", "0", "1000000000000000000", "0", "1000000000000000000") === null &&
  app.compoundSnapshot("100", "1000000000000000000", "1.5", "0", "1000000000000000000") === null &&
  app.compoundSnapshot("100", "1000000000000000000", "1000000000000000000", "-3", "1000000000000000000") === null &&
  app.compoundSnapshot("100", "1000000000000000000", "1000000000000000000", "", "1000000000000000000") === null &&
  app.compoundSnapshot(null, "1000000000000000000", "1000000000000000000", "0", "1000000000000000000") === null &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundSnapshot(M, "1000000000000000000", "2", "0", "0") === null; })() &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundSnapshot("0", "0", "1000000000000000000", M, "2") === null; })());
check("compound snapshot tool section present in index.html", html.includes("csnap-btn") && html.includes("Compound account snapshot calculator"));

/* Compound interest rate model — expected values produced by an
   independent pure-Python transcription of BaseJumpRateModelV2's
   utilizationRate and JumpRateModelV2's getBorrowRate / getSupplyRate
   over the model's stored per-block parameters
   (hidden_files/oracle-compound-rate-model.py): utilization is 0 if
   borrows is 0, else borrows x 1e18 // (cash + borrows - reserves);
   the borrow rate is the two-slope kink curve, truncating at each
   division; the supply rate is utilization x (borrowRate x
   (1e18 - reserveFactor) // 1e18) // 1e18.
   Vectors are [cash, borrows, reserves, base, mult, jump, kink,
   reserveFactor] -> [utilization, borrowRate, supplyRate]. */
check("compound rate model controls labelled in index.html",
  ["cirm-cash", "cirm-borrows", "cirm-reserves", "cirm-base", "cirm-mult", "cirm-jump", "cirm-kink", "cirm-factor"]
    .every(id => html.includes(`for="${id}"`)));
check("compound rate model matches the Python oracle (prefill, zero borrows, kink boundary, above kink, truncation, util above 1e18, reserve-factor extremes, 2^150 scale)",
  (() => { const V = [
    [["9100000", "3000000", "100000", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "100000000000000000"], ["250000000000000000", "400000000000", "90000000000"]],
    [["0", "0", "0", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "100000000000000000"], ["0", "100000000000", "0"]],
    [["500", "0", "500", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "100000000000000000"], ["0", "100000000000", "0"]],
    [["1000000", "4000000", "0", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "100000000000000000"], ["800000000000000000", "1060000000000", "763200000000"]],
    [["1000000", "9000000", "0", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "100000000000000000"], ["900000000000000000", "1460000000000", "1182600000000"]],
    [["7", "5", "3", "7", "11", "13", "400000000000000000", "3"], ["555555555555555555", "13", "6"]],
    [["100", "1000", "500", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "100000000000000000"], ["1666666666666666666", "4526666666666", "6789999999998"]],
    [["9100000", "3000000", "100000", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "1000000000000000000"], ["250000000000000000", "400000000000", "0"]],
    [["9100000", "3000000", "100000", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "0"], ["250000000000000000", "400000000000", "100000000000"]],
    [["1427247692705959881058285969449495136382746624", "1427247692705959881058285969449495136382746624", "0", "0", "1152921504606846976", "4611686018427387904", "800000000000000000", "100000000000000000"], ["500000000000000000", "576460752303423488", "259407338536540569"]]
  ]; return V.every(([inp, exp]) => { const r = app.compoundRateModel(...inp);
    return r !== null && r.utilization === exp[0] && r.borrowRate === exp[1] && r.supplyRate === exp[2]; }); })());
check("compound rate model: zero borrows short-circuits even when cash equals reserves",
  (() => { const r = app.compoundRateModel("500", "0", "500", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "100000000000000000");
    return r !== null && r.utilization === "0" && r.borrowRate === "100000000000" && r.supplyRate === "0"; })());
check("compound rate model: prefilled page values produce exactly the accrual tool's prefilled per-block rate (400000000000)",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.compoundRateModel(g("cirm-cash"), g("cirm-borrows"), g("cirm-reserves"), g("cirm-base"), g("cirm-mult"), g("cirm-jump"), g("cirm-kink"), g("cirm-factor"));
    return r !== null && r.utilization === "250000000000000000" && r.borrowRate === "400000000000" && r.supplyRate === "90000000000" && r.regime === "at or below the kink"; })());
check("compound rate model refuses reserves above cash + borrows, a zero denominator, a reserve factor above 1e18, malformed and overflowing inputs",
  app.compoundRateModel("100", "200", "301", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "100000000000000000") === null &&
  app.compoundRateModel("0", "5", "5", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "100000000000000000") === null &&
  app.compoundRateModel("9100000", "3000000", "100000", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "1000000000000000001") === null &&
  app.compoundRateModel("9100000", "3000000", "100000", "100000000000", "1.5", "4000000000000", "800000000000000000", "100000000000000000") === null &&
  app.compoundRateModel("9100000", "3000000", "100000", "100000000000", "1200000000000", "-3", "800000000000000000", "100000000000000000") === null &&
  app.compoundRateModel("9100000", "3000000", "100000", "", "1200000000000", "4000000000000", "800000000000000000", "100000000000000000") === null &&
  app.compoundRateModel(null, "3000000", "100000", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "100000000000000000") === null &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundRateModel("0", M, "0", "100000000000", "1200000000000", "4000000000000", "800000000000000000", "100000000000000000") === null; })() &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundRateModel("1000000", "9000000", "0", "0", M, "4000000000000", "800000000000000000", "100000000000000000") === null; })());
check("compound rate model tool section present in index.html", html.includes("cirm-btn") && html.includes("Compound interest rate model calculator"));

/* Compound liquidation seize tokens — expected values produced by an
   independent pure-Python transcription of Comptroller's
   liquidateCalculateSeizeTokens over ExponentialNoError's Exp
   helpers (hidden_files/oracle-compound-seize.py): numerator =
   incentive x priceBorrowed // 1e18, denominator = priceCollateral x
   exchangeRate // 1e18, ratio = numerator x 1e18 // denominator,
   seizeTokens = ratio x repay // 1e18, each step truncating;
   seizeUnderlying is the redeem conversion seizeTokens x rate // 1e18.
   Vectors are [repay, incentive, priceBorrowed, priceCollateral,
   exchangeRate] -> [seizeTokens, seizeUnderlying, ratio]. */
check("compound seize controls labelled in index.html",
  ["cseize-repay", "cseize-incentive", "cseize-price-borrowed", "cseize-price-collateral", "cseize-rate"]
    .every(id => html.includes(`for="${id}"`)));
check("compound seize matches the Python oracle (prefill, stored-rate chain, pricier borrow, stepwise truncation, zero repay, zero incentive, truncated numerator, odd values, 2^100 repay)",
  (() => { const V = [
    [["100000", "1080000000000000000", "1000000000000000000", "2000000000000000000", "50000000000000000"], ["1080000", "54000", "10800000000000000000"]],
    [["10000", "1080000000000000000", "1000000000000000000", "1000000000000000000", "21800000000000000"], ["495412", "10799", "49541284403669724770"]],
    [["2000000", "1080000000000000000", "3000000000000000000000", "1000000000000000000", "20000000000000000"], ["324000000000", "6480000000", "162000000000000000000000"]],
    [["100000", "1080000000000000001", "999999999999999999", "2000000000000000000", "50000000000000000"], ["1079999", "53999", "10799999999999999990"]],
    [["0", "1080000000000000000", "1000000000000000000", "2000000000000000000", "50000000000000000"], ["0", "0", "10800000000000000000"]],
    [["100000", "0", "1000000000000000000", "2000000000000000000", "50000000000000000"], ["0", "0", "0"]],
    [["7", "11", "13", "1000000000000000000", "1000000000000000000"], ["0", "0", "0"]],
    [["123456789", "1234567890123456789", "987654321987654321", "555555555555555555", "33333333333333333"], ["8128842009", "270961400", "65843620873251029971"]],
    [["1267650600228229401496703205376", "1080000000000000000", "3000000000000000000", "7000000000000000000", "100000000000000000"], ["5867411349627804657812890293356", "586741134962780465781289029335", "4628571428571428571"]]
  ]; return V.every(([inp, exp]) => { const r = app.compoundSeizeTokens(...inp);
    return r !== null && r.seizeTokens === exp[0] && r.seizeUnderlying === exp[1] && r.ratio === exp[2]; }); })());
check("compound seize: Exp steps truncate individually, so the stepwise result differs from the one-line formula",
  (() => { const r = app.compoundSeizeTokens("100000", "1080000000000000001", "999999999999999999", "2000000000000000000", "50000000000000000");
    return r !== null && r.ratio === "10799999999999999990" && r.seizeTokens === "1079999" && r.seizeUnderlying === "53999"; })());
check("compound seize: prefilled page values seize exactly 1,080,000 cTokens worth exactly 54,000 underlying",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.compoundSeizeTokens(g("cseize-repay"), g("cseize-incentive"), g("cseize-price-borrowed"), g("cseize-price-collateral"), g("cseize-rate"));
    return r !== null && r.seizeTokens === "1080000" && r.seizeUnderlying === "54000" && r.ratio === "10800000000000000000"; })());
check("compound seize refuses a zero price for either market, a zero or truncated-to-zero denominator, malformed and overflowing inputs",
  app.compoundSeizeTokens("100000", "1080000000000000000", "0", "2000000000000000000", "50000000000000000") === null &&
  app.compoundSeizeTokens("100000", "1080000000000000000", "1000000000000000000", "0", "50000000000000000") === null &&
  app.compoundSeizeTokens("100000", "1080000000000000000", "1000000000000000000", "2000000000000000000", "0") === null &&
  app.compoundSeizeTokens("100000", "1080000000000000000", "1000000000000000000", "3", "7") === null &&
  app.compoundSeizeTokens("7", "11", "13", "17", "19") === null &&
  app.compoundSeizeTokens("100000", "1.5", "1000000000000000000", "2000000000000000000", "50000000000000000") === null &&
  app.compoundSeizeTokens("100000", "1080000000000000000", "1000000000000000000", "-3", "50000000000000000") === null &&
  app.compoundSeizeTokens("", "1080000000000000000", "1000000000000000000", "2000000000000000000", "50000000000000000") === null &&
  app.compoundSeizeTokens(null, "1080000000000000000", "1000000000000000000", "2000000000000000000", "50000000000000000") === null &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundSeizeTokens("100000", M, "2", "2000000000000000000", "50000000000000000") === null; })() &&
  (() => { const P = (2n ** 200n).toString(); return app.compoundSeizeTokens("1", P, "1000000000000000000", "1000000000000000000", "1000000000000000000") === null; })() &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundSeizeTokens(M, "1080000000000000000", "1000000000000000000", "1000000000000000000", "1000000000000000000") === null; })());
check("compound seize tool section present in index.html", html.includes("cseize-btn") && html.includes("Compound liquidation seize calculator"));

/* Compound hypothetical account liquidity — expected values produced
   by an independent pure-Python transcription of Comptroller's
   getHypotheticalAccountLiquidityInternal for one market over
   ExponentialNoError's Exp helpers
   (hidden_files/oracle-compound-liquidity.py): tokensToDenom =
   (factor x rate // 1e18) x price // 1e18 in two truncating steps,
   collateral = tokensToDenom x balance // 1e18, borrowPlusEffects =
   price x borrow // 1e18 + tokensToDenom x redeem // 1e18 + price x
   borrowAmount // 1e18, then liquidity/shortfall by comparison
   (equality lands in the shortfall branch with both 0). Vectors are
   [balance, borrowBalance, factor, rate, price, redeem, borrowAmt]
   -> [tokensToDenom, collateral, borrowPlusEffects, liquidity,
   shortfall]. */
check("compound liquidity controls labelled in index.html",
  ["cliq-balance", "cliq-borrow-balance", "cliq-factor", "cliq-rate", "cliq-price", "cliq-redeem", "cliq-borrow-amt"]
    .every(id => html.includes(`for="${id}"`)));
check("compound liquidity matches the Python oracle (prefill, shortfall, equality, redeem effect, borrow effect, snapshot chain, stepwise truncation, zero balances, zero factor, 2^100 balance, odd values)",
  (() => { const V = [
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "0", "0"], ["15000000000000000", "750000", "500000", "250000", "0"]],
    [["50000000", "900000", "750000000000000000", "20000000000000000", "1000000000000000000", "0", "0"], ["15000000000000000", "750000", "900000", "0", "150000"]],
    [["50000000", "750000", "750000000000000000", "20000000000000000", "1000000000000000000", "0", "0"], ["15000000000000000", "750000", "750000", "0", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "10000000", "0"], ["15000000000000000", "750000", "650000", "100000", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "0", "100000"], ["15000000000000000", "750000", "600000", "150000", "0"]],
    [["45871559", "1004000", "800000000000000000", "21800000000000000", "2000000000000000000", "0", "0"], ["34880000000000000", "1599999", "2008000", "0", "408001"]],
    [["45871559", "1004", "750000000000000001", "21800000000000000", "3000000000000000000000", "0", "0"], ["49050000000000000000", "2249999968", "3012000", "2246987968", "0"]],
    [["0", "0", "750000000000000000", "20000000000000000", "1000000000000000000", "0", "0"], ["15000000000000000", "0", "0", "0", "0"]],
    [["50000000", "500000", "0", "20000000000000000", "1000000000000000000", "0", "0"], ["0", "0", "500000", "0", "500000"]],
    [["1267650600228229401496703205376", "1000000", "500000000000000000", "100000000000000000", "3000000000000000000", "0", "0"], ["150000000000000000", "190147590034234410224505480806", "3000000", "190147590034234410224502480806", "0"]],
    [["123456789", "987654", "777777777777777777", "33333333333333333", "555555555555555555", "1000000", "50000"], ["14403292181069958", "1778184", "590876", "1187308", "0"]]
  ]; return V.every(([inp, exp]) => { const r = app.compoundLiquidity(...inp);
    return r !== null && r.tokensToDenom === exp[0] && r.collateral === exp[1] && r.borrowPlusEffects === exp[2] && r.liquidity === exp[3] && r.shortfall === exp[4]; }); })());
check("compound liquidity: the two Exp steps truncate individually, so tokensToDenom differs from the one-line product at a $3000 price",
  (() => { const r = app.compoundLiquidity("45871559", "1004", "750000000000000001", "21800000000000000", "3000000000000000000000", "0", "0");
    return r !== null && r.tokensToDenom === "49050000000000000000" && r.tokensToDenom !== "49050000000000000065"; })());
check("compound liquidity: prefilled page values hold exactly 250,000 of liquidity with no shortfall",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.compoundLiquidity(g("cliq-balance"), g("cliq-borrow-balance"), g("cliq-factor"), g("cliq-rate"), g("cliq-price"), g("cliq-redeem"), g("cliq-borrow-amt"));
    return r !== null && r.tokensToDenom === "15000000000000000" && r.collateral === "750000" && r.borrowPlusEffects === "500000" && r.liquidity === "250000" && r.shortfall === "0"; })());
check("compound liquidity refuses a zero oracle price, malformed and overflowing inputs",
  app.compoundLiquidity("50000000", "500000", "750000000000000000", "20000000000000000", "0", "0", "0") === null &&
  app.compoundLiquidity("50000000", "500000", "1.5", "20000000000000000", "1000000000000000000", "0", "0") === null &&
  app.compoundLiquidity("50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "-3", "0") === null &&
  app.compoundLiquidity("", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "0", "0") === null &&
  app.compoundLiquidity(null, "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "0", "0") === null &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundLiquidity("1", "0", M, "2000000000000000000", "1000000000000000000", "0", "0") === null; })() &&
  (() => { const P = (2n ** 200n).toString(); const Q = (2n ** 100n).toString(); return app.compoundLiquidity("0", P, "1000000000000000000", "1000000000000000000", Q, "0", "0") === null; })() &&
  (() => { const P = (2n ** 200n).toString(); const Q = (2n ** 100n).toString(); return app.compoundLiquidity(P, "0", "1000000000000000000", "1000000000000000000", Q, "0", "0") === null; })());
check("compound liquidity tool section present in index.html", html.includes("cliq-btn") && html.includes("Compound account liquidity calculator"));

/* Compound liquidation allowed — expected values produced by an
   independent pure-Python transcription of Comptroller's
   liquidateBorrowAllowed (hidden_files/
   oracle-compound-liquidate-allowed.py): standard path requires
   shortfall > 0 (checked BEFORE the close-factor product, so an
   overflowing product there still yields the shortfall verdict),
   then maxClose = closeFactor x borrowBalance // 1e18 truncating
   once and repay <= maxClose; the deprecated path reads neither
   shortfall nor factor and caps the repay at the borrow balance.
   Vectors are [borrowBalance, closeFactor, shortfall, repay,
   deprecated] -> [allowed, verdict, maxClose]. */
check("compound liquidate-allowed controls labelled in index.html",
  ["clqa-borrow-balance", "clqa-close-factor", "clqa-shortfall", "clqa-repay", "clqa-deprecated"]
    .every(id => html.includes(`for="${id}"`)));
check("compound liquidate-allowed matches the Python oracle (prefill, maxClose boundary, too much, no shortfall, truncation, zero cases, factor above 1e18, 2^100 borrow, deprecated paths)",
  (() => { const V = [
    [["900000", "500000000000000000", "150000", "100000", false], [true, "allowed", "450000"]],
    [["900000", "500000000000000000", "150000", "450000", false], [true, "allowed", "450000"]],
    [["900000", "500000000000000000", "150000", "450001", false], [false, "too-much-repay", "450000"]],
    [["900000", "500000000000000000", "0", "1", false], [false, "insufficient-shortfall", null]],
    [["1606938044258990275541962092341162602522202993782792835301376", "1267650600228229401496703205376", "0", "1", false], [false, "insufficient-shortfall", null]],
    [["999999", "333333333333333333", "1", "333332", false], [true, "allowed", "333332"]],
    [["999999", "333333333333333333", "1", "333333", false], [false, "too-much-repay", "333332"]],
    [["0", "500000000000000000", "1", "0", false], [true, "allowed", "0"]],
    [["0", "500000000000000000", "1", "1", false], [false, "too-much-repay", "0"]],
    [["1000000", "0", "7", "0", false], [true, "allowed", "0"]],
    [["1000", "1500000000000000000", "5", "1200", false], [true, "allowed", "1500"]],
    [["1267650600228229401496703205376", "500000000000000000", "1", "633825300114114700748351602688", false], [true, "allowed", "633825300114114700748351602688"]],
    [["987654321", "425000000000000000", "42", "400000000", false], [true, "allowed", "419753086"]],
    [["5000", "0", "0", "5000", true], [true, "allowed", null]],
    [["5000", "0", "0", "5001", true], [false, "exceeds-borrow", null]],
    [["5000", "1000000000000000000", "999", "1", true], [true, "allowed", null]]
  ]; return V.every(([inp, exp]) => { const r = app.compoundLiquidateAllowed(...inp);
    return r !== null && r.allowed === exp[0] && r.verdict === exp[1] && r.maxClose === exp[2]; }); })());
check("compound liquidate-allowed: prefilled page values allow the seize tool's 100,000 repay with a 450,000 maximum close amount",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.compoundLiquidateAllowed(g("clqa-borrow-balance"), g("clqa-close-factor"), g("clqa-shortfall"), g("clqa-repay"), false);
    return r !== null && r.allowed === true && r.verdict === "allowed" && r.maxClose === "450000" &&
      html.includes('id="clqa-deprecated"') && html.includes('<option value="no" selected>'); })());
check("compound liquidate-allowed refuses malformed inputs, a non-boolean deprecated flag, and an overflowing close-factor product when a shortfall makes it reachable",
  app.compoundLiquidateAllowed("900000", "1.5", "150000", "100000", false) === null &&
  app.compoundLiquidateAllowed("900000", "500000000000000000", "150000", "-1", false) === null &&
  app.compoundLiquidateAllowed("", "500000000000000000", "150000", "100000", false) === null &&
  app.compoundLiquidateAllowed(null, "500000000000000000", "150000", "100000", false) === null &&
  app.compoundLiquidateAllowed("900000", "500000000000000000", "150000", "100000", "no") === null &&
  (() => { const P = (2n ** 200n).toString(); const Q = (2n ** 100n).toString(); return app.compoundLiquidateAllowed(P, Q, "1", "1", false) === null; })() &&
  (() => { const P = (2n ** 128n).toString(); return app.compoundLiquidateAllowed(P, P, "1", "1", false) === null; })());
check("compound liquidate-allowed tool section present in index.html", html.includes("clqa-btn") && html.includes("Compound liquidation allowed"));

/* Compound borrow allowed — expected values produced by an
   independent pure-Python transcription of Comptroller's
   borrowAllowed (hidden_files/oracle-compound-borrow-allowed.py)
   in the contract's branch order: a zero oracle price returns the
   price error FIRST (shielding an overflowing cap addition or
   liquidity product), then the borrow cap — 0 is unlimited and
   skips the addition, otherwise nextTotalBorrows = totalBorrows +
   borrowAmount must stay strictly below the cap, so landing
   exactly on it is cap-reached, a verdict that also precedes (and
   shields) the liquidity check — then the liquidity calculator's
   hypothetical check with the borrow applied, where shortfall > 0
   blocks and shortfall == 0 (liquidity exhausted exactly) allows.
   Vectors are [balance, borrowBalance, factor, rate, price,
   borrowAmt, totalBorrows, borrowCap] -> [allowed, verdict,
   nextTotalBorrows, liquidity, shortfall]. */
check("compound borrow-allowed controls labelled in index.html",
  ["cbqa-balance", "cbqa-borrow-balance", "cbqa-factor", "cbqa-rate", "cbqa-price", "cbqa-borrow-amt", "cbqa-total-borrows", "cbqa-borrow-cap"]
    .every(id => html.includes(`for="${id}"`)));
check("compound borrow-allowed matches the Python oracle (prefill exhausting liquidity, shortfall 1, cap exact and one under, unlimited cap at uint256-max totals, price-error and cap verdicts shielding overflows, market already at cap, snapshot chain shortfall, 2^100 balance, odd values, zero cases)",
  (() => { const M = (2n ** 256n - 1n).toString(); const V = [
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "250000", "9000000", "10000000"], [true, "allowed", "9250000", "0", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "250001", "9000000", "10000000"], [false, "insufficient-liquidity", "9250001", "0", "1"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "0", "9000000", "10000000"], [true, "allowed", "9000000", "250000", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "250000", "9750000", "10000000"], [false, "borrow-cap-reached", "10000000", null, null]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "250000", "9749999", "10000000"], [true, "allowed", "9999999", "0", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "250000", M, "0"], [true, "allowed", null, "0", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "0", "1", M, "5"], [false, "price-error", null, null, null]],
    [["1", "0", M, "2000000000000000000", "1000000000000000000", "10", "100", "105"], [false, "borrow-cap-reached", "110", null, null]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "0", "10000000", "10000000"], [false, "borrow-cap-reached", "10000000", null, null]],
    [["45871559", "1004000", "800000000000000000", "21800000000000000", "2000000000000000000", "0", "0", "0"], [false, "insufficient-liquidity", null, "0", "408001"]],
    [["1267650600228229401496703205376", "1000000", "500000000000000000", "100000000000000000", "3000000000000000000", "1000000", "0", "0"], [true, "allowed", null, "190147590034234410224499480806", "0"]],
    [["123456789", "987654", "777777777777777777", "33333333333333333", "555555555555555555", "50000", "777000000", "888000000"], [true, "allowed", "777050000", "1201711", "0"]],
    [["0", "0", "750000000000000000", "20000000000000000", "1000000000000000000", "0", "0", "0"], [true, "allowed", null, "0", "0"]],
    [["50000000", "0", "0", "20000000000000000", "1000000000000000000", "1", "0", "0"], [false, "insufficient-liquidity", null, "0", "1"]]
  ]; return V.every(([inp, exp]) => { const r = app.compoundBorrowAllowed(...inp);
    return r !== null && r.allowed === exp[0] && r.verdict === exp[1] && r.nextTotalBorrows === exp[2] && r.liquidity === exp[3] && r.shortfall === exp[4]; }); })());
check("compound borrow-allowed: prefilled page values allow a borrow of exactly 250,000, exhausting the liquidity tool's 250,000 with the market total under its cap",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.compoundBorrowAllowed(g("cbqa-balance"), g("cbqa-borrow-balance"), g("cbqa-factor"), g("cbqa-rate"), g("cbqa-price"), g("cbqa-borrow-amt"), g("cbqa-total-borrows"), g("cbqa-borrow-cap"));
    return r !== null && r.allowed === true && r.verdict === "allowed" && r.nextTotalBorrows === "9250000" && r.liquidity === "0" && r.shortfall === "0"; })());
check("compound borrow-allowed refuses malformed inputs, an overflowing cap addition, and an overflowing liquidity product when the liquidity check is reached",
  app.compoundBorrowAllowed("50000000", "500000", "1.5", "20000000000000000", "1000000000000000000", "250000", "9000000", "10000000") === null &&
  app.compoundBorrowAllowed("50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "-1", "9000000", "10000000") === null &&
  app.compoundBorrowAllowed("", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "250000", "9000000", "10000000") === null &&
  app.compoundBorrowAllowed("50000000", "500000", "750000000000000000", "20000000000000000", null, "250000", "9000000", "10000000") === null &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundBorrowAllowed("50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "1", M, "100") === null; })() &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundBorrowAllowed("1", "0", M, "2000000000000000000", "1000000000000000000", "10", "100", "0") === null; })() &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundBorrowAllowed("1", "0", M, "2000000000000000000", "1000000000000000000", "10", "100", "1000000") === null; })());
check("compound borrow-allowed tool section present in index.html", html.includes("cbqa-btn") && html.includes("Compound borrow allowed calculator"));

/* Compound redeem allowed — expected values produced by an
   independent pure-Python transcription of Comptroller's
   redeemAllowed / redeemAllowedInternal
   (hidden_files/oracle-compound-redeem-allowed.py) in the
   contract's branch order: a redeemer who has NOT entered the
   market bypasses the liquidity check entirely (no error at
   once — a zero price or an overflowing product is never
   computed, and the redeem amount is never weighed by this
   gate), while a member runs the liquidity calculator's
   hypothetical check with the redeem applied, where shortfall
   > 0 blocks and shortfall == 0 (liquidity exhausted exactly)
   allows. Because each cToken's effect (0.015 underlying at the
   prefill) truncates once over the whole redeem, exhaustion at
   16,666,667 cTokens is a plateau — the next cToken still floors
   to the same effect — and the first shortfall of 1 appears
   only at 16,666,734. Vectors are [balance, borrowBalance,
   factor, rate, price, redeemTokens, isMember] -> [allowed,
   verdict, liquidity, shortfall]. */
check("compound redeem-allowed controls labelled in index.html",
  ["crqa-balance", "crqa-borrow-balance", "crqa-factor", "crqa-rate", "crqa-price", "crqa-redeem", "crqa-member"]
    .every(id => html.includes(`for="${id}"`)));
check("compound redeem-allowed matches the Python oracle (prefill, exact exhaustion and its truncation plateau, first shortfall 1, non-member bypass incl. shielding zero price plus overflow and a redeem above the balance, snapshot chain account in shortfall blocked at zero redeem, full-balance redeem blocked, 2^100 balance, odd values, zero cases)",
  (() => { const M = (2n ** 256n - 1n).toString(); const V = [
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "10000000", true], [true, "allowed", "100000", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "16666667", true], [true, "allowed", "0", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "16666668", true], [true, "allowed", "0", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "16666734", true], [false, "insufficient-liquidity", "0", "1"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "0", true], [true, "allowed", "250000", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "10000000", false], [true, "not-in-market-bypass", null, null]],
    [["1", "0", M, "2000000000000000000", "0", "10", false], [true, "not-in-market-bypass", null, null]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "60000000", false], [true, "not-in-market-bypass", null, null]],
    [["45871559", "1004000", "800000000000000000", "21800000000000000", "2000000000000000000", "0", true], [false, "insufficient-liquidity", "0", "408001"]],
    [["1267650600228229401496703205376", "1000000", "500000000000000000", "100000000000000000", "3000000000000000000", "1000000", true], [true, "allowed", "190147590034234410224502330806", "0"]],
    [["123456789", "987654", "777777777777777777", "33333333333333333", "555555555555555555", "50000", true], [true, "allowed", "1228768", "0"]],
    [["0", "0", "750000000000000000", "20000000000000000", "1000000000000000000", "0", true], [true, "allowed", "0", "0"]],
    [["50000000", "0", "0", "20000000000000000", "1000000000000000000", "1", true], [true, "allowed", "0", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "50000000", true], [false, "insufficient-liquidity", "0", "500000"]]
  ]; return V.every(([inp, exp]) => { const r = app.compoundRedeemAllowed(...inp);
    return r !== null && r.allowed === exp[0] && r.verdict === exp[1] && r.liquidity === exp[2] && r.shortfall === exp[3]; }); })());
check("compound redeem-allowed: prefilled page values (a member redeeming 10,000,000 cTokens) leave exactly 100,000 of the liquidity tool's 250,000",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.compoundRedeemAllowed(g("crqa-balance"), g("crqa-borrow-balance"), g("crqa-factor"), g("crqa-rate"), g("crqa-price"), g("crqa-redeem"), true);
    return r !== null && r.allowed === true && r.verdict === "allowed" && r.liquidity === "100000" && r.shortfall === "0"; })());
check("compound redeem-allowed refuses malformed inputs, a non-boolean membership flag, and — only on the member path that reaches it — a zero price and an overflowing liquidity product",
  app.compoundRedeemAllowed("50000000", "500000", "1.5", "20000000000000000", "1000000000000000000", "10000000", true) === null &&
  app.compoundRedeemAllowed("50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "-1", true) === null &&
  app.compoundRedeemAllowed("", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "10000000", true) === null &&
  app.compoundRedeemAllowed("50000000", "500000", "750000000000000000", "20000000000000000", null, "10000000", true) === null &&
  app.compoundRedeemAllowed("50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "10000000", "yes") === null &&
  app.compoundRedeemAllowed("50000000", "500000", "750000000000000000", "20000000000000000", "0", "10", true) === null &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundRedeemAllowed("1", "0", M, "2000000000000000000", "1000000000000000000", "10", true) === null; })());
check("compound redeem-allowed tool section present in index.html", html.includes("crqa-btn") && html.includes("Compound redeem allowed calculator"));

/* Compound transfer allowed — expected values produced by an
   independent pure-Python transcription of Comptroller's
   transferAllowed (hidden_files/oracle-compound-transfer-allowed.py):
   apart from the pause guardian (a boolean on chain state, out of
   scope), the gate runs the internal redeem check on the SOURCE
   account with transferTokens as the redeem amount and returns
   its verdict unchanged — the destination is never read by the
   gate and there is no self-transfer shortcut. So a source that
   has NOT entered the market bypasses the liquidity check
   entirely, while a member source runs the liquidity calculator's
   hypothetical check with the transfer applied as a redeem, where
   shortfall > 0 blocks and shortfall == 0 allows; the truncation
   plateau carries over (exhaustion at 16,666,667 cTokens, first
   shortfall of 1 only at 16,666,734). Vectors are [balance,
   borrowBalance, factor, rate, price, transferTokens,
   srcIsMember] -> [allowed, verdict, liquidity, shortfall]. */
check("compound transfer-allowed controls labelled in index.html",
  ["ctqa-balance", "ctqa-borrow-balance", "ctqa-factor", "ctqa-rate", "ctqa-price", "ctqa-transfer", "ctqa-member"]
    .every(id => html.includes(`for="${id}"`)));
check("compound transfer-allowed matches the Python oracle (prefill, exact exhaustion and its truncation plateau, first shortfall 1, non-member source bypass incl. shielding zero price plus overflow with a 2^100 transfer and a transfer above the balance, snapshot chain account in shortfall blocked at zero transfer, full-balance transfer blocked, 2^100 balance, odd values, zero cases)",
  (() => { const M = (2n ** 256n - 1n).toString(); const V = [
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "10000000", true], [true, "allowed", "100000", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "16666667", true], [true, "allowed", "0", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "16666668", true], [true, "allowed", "0", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "16666734", true], [false, "insufficient-liquidity", "0", "1"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "0", true], [true, "allowed", "250000", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "10000000", false], [true, "not-in-market-bypass", null, null]],
    [["1", "0", M, "2000000000000000000", "0", "1267650600228229401496703205376", false], [true, "not-in-market-bypass", null, null]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "60000000", false], [true, "not-in-market-bypass", null, null]],
    [["45871559", "1004000", "800000000000000000", "21800000000000000", "2000000000000000000", "0", true], [false, "insufficient-liquidity", "0", "408001"]],
    [["1267650600228229401496703205376", "1000000", "500000000000000000", "100000000000000000", "3000000000000000000", "1000000", true], [true, "allowed", "190147590034234410224502330806", "0"]],
    [["123456789", "987654", "777777777777777777", "33333333333333333", "555555555555555555", "50000", true], [true, "allowed", "1228768", "0"]],
    [["0", "0", "750000000000000000", "20000000000000000", "1000000000000000000", "0", true], [true, "allowed", "0", "0"]],
    [["50000000", "0", "0", "20000000000000000", "1000000000000000000", "1", true], [true, "allowed", "0", "0"]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "50000000", true], [false, "insufficient-liquidity", "0", "500000"]]
  ]; return V.every(([inp, exp]) => { const r = app.compoundTransferAllowed(...inp);
    return r !== null && r.allowed === exp[0] && r.verdict === exp[1] && r.liquidity === exp[2] && r.shortfall === exp[3]; }); })());
check("compound transfer-allowed: prefilled page values (a member source transferring 10,000,000 cTokens) leave exactly 100,000 of the liquidity tool's 250,000",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.compoundTransferAllowed(g("ctqa-balance"), g("ctqa-borrow-balance"), g("ctqa-factor"), g("ctqa-rate"), g("ctqa-price"), g("ctqa-transfer"), true);
    return r !== null && r.allowed === true && r.verdict === "allowed" && r.liquidity === "100000" && r.shortfall === "0"; })());
check("compound transfer-allowed refuses malformed inputs, a non-boolean source-membership flag, and — only on the member path that reaches it — a zero price and an overflowing liquidity product",
  app.compoundTransferAllowed("50000000", "500000", "1.5", "20000000000000000", "1000000000000000000", "10000000", true) === null &&
  app.compoundTransferAllowed("50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "-1", true) === null &&
  app.compoundTransferAllowed("", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "10000000", true) === null &&
  app.compoundTransferAllowed("50000000", "500000", "750000000000000000", "20000000000000000", null, "10000000", true) === null &&
  app.compoundTransferAllowed("50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", "10000000", "yes") === null &&
  app.compoundTransferAllowed("50000000", "500000", "750000000000000000", "20000000000000000", "0", "10", true) === null &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundTransferAllowed("1", "0", M, "2000000000000000000", "1000000000000000000", "10", true) === null; })());
check("compound transfer-allowed tool section present in index.html", html.includes("ctqa-btn") && html.includes("Compound transfer allowed calculator"));

/* Compound exit market — expected values produced by an
   independent pure-Python transcription of Comptroller's
   exitMarket (hidden_files/oracle-compound-exit-market.py):
   the contract reads the account's snapshot, refuses at once
   if the amount owed in the market is non-zero (before every
   membership step, price never read), and otherwise runs the
   internal redeem check with the redeem amount set to the
   account's FULL cToken balance. A non-member bypasses the
   liquidity check; a member runs it, but its borrow balance is
   the amount owed (zero on that path) and its redeem term is
   the collateral term computed from identical inputs, so the
   two cancel and the check completes at liquidity 0 /
   shortfall 0 — its only remaining refusals are the zero-price
   error and uint256 overflow. Vectors are [balance, amountOwed,
   factor, rate, price, isMember] -> [allowed, verdict,
   liquidity, shortfall]. */
check("compound exit-market controls labelled in index.html",
  ["cxqa-balance", "cxqa-owed", "cxqa-factor", "cxqa-rate", "cxqa-price", "cxqa-member"]
    .every(id => html.includes(`for="${id}"`)));
check("compound exit-market matches the Python oracle (prefill chain at exactly 0/0, owed of 1 refused, owed refused for member and non-member alike and shielding a zero price, non-member bypass incl. shielding zero price plus overflow with a 2^100 balance, snapshot chain account owing 1,004,000 refused, 2^100 member at 0/0, odd values, zero account, zero factor, zero balance with a borrow owed)",
  (() => { const M = (2n ** 256n - 1n).toString(); const V = [
    [["50000000", "0", "750000000000000000", "20000000000000000", "1000000000000000000", true], [true, "allowed", "0", "0"]],
    [["50000000", "1", "750000000000000000", "20000000000000000", "1000000000000000000", true], [false, "nonzero-borrow-balance", null, null]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", true], [false, "nonzero-borrow-balance", null, null]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "1000000000000000000", false], [false, "nonzero-borrow-balance", null, null]],
    [["50000000", "500000", "750000000000000000", "20000000000000000", "0", true], [false, "nonzero-borrow-balance", null, null]],
    [["50000000", "0", "750000000000000000", "20000000000000000", "1000000000000000000", false], [true, "not-in-market-bypass", null, null]],
    [["1267650600228229401496703205376", "0", M, "2000000000000000000", "0", false], [true, "not-in-market-bypass", null, null]],
    [["45871559", "1004000", "800000000000000000", "21800000000000000", "2000000000000000000", true], [false, "nonzero-borrow-balance", null, null]],
    [["1267650600228229401496703205376", "0", "500000000000000000", "100000000000000000", "3000000000000000000", true], [true, "allowed", "0", "0"]],
    [["123456789", "0", "777777777777777777", "33333333333333333", "555555555555555555", true], [true, "allowed", "0", "0"]],
    [["0", "0", "750000000000000000", "20000000000000000", "1000000000000000000", true], [true, "allowed", "0", "0"]],
    [["50000000", "0", "0", "20000000000000000", "1000000000000000000", true], [true, "allowed", "0", "0"]],
    [["0", "250000", "750000000000000000", "20000000000000000", "1000000000000000000", true], [false, "nonzero-borrow-balance", null, null]]
  ]; return V.every(([inp, exp]) => { const r = app.compoundExitMarket(...inp);
    return r !== null && r.allowed === exp[0] && r.verdict === exp[1] && r.liquidity === exp[2] && r.shortfall === exp[3]; }); })());
check("compound exit-market: prefilled page values (a member owing nothing) are allowed with the check completing at exactly 0 liquidity and 0 shortfall",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.compoundExitMarket(g("cxqa-balance"), g("cxqa-owed"), g("cxqa-factor"), g("cxqa-rate"), g("cxqa-price"), true);
    return r !== null && r.allowed === true && r.verdict === "allowed" && r.liquidity === "0" && r.shortfall === "0"; })());
check("compound exit-market refuses malformed inputs, a non-boolean membership flag, and — only on the member path that reaches it — a zero price and an overflowing liquidity product",
  app.compoundExitMarket("50000000", "0", "1.5", "20000000000000000", "1000000000000000000", true) === null &&
  app.compoundExitMarket("50000000", "-1", "750000000000000000", "20000000000000000", "1000000000000000000", true) === null &&
  app.compoundExitMarket("", "0", "750000000000000000", "20000000000000000", "1000000000000000000", true) === null &&
  app.compoundExitMarket("50000000", "0", "750000000000000000", "20000000000000000", null, true) === null &&
  app.compoundExitMarket("50000000", "0", "750000000000000000", "20000000000000000", "1000000000000000000", "yes") === null &&
  app.compoundExitMarket("50000000", "0", "750000000000000000", "20000000000000000", "0", true) === null &&
  (() => { const M = (2n ** 256n - 1n).toString(); return app.compoundExitMarket("1", "0", M, "2000000000000000000", "1000000000000000000", true) === null; })());
check("compound exit-market tool section present in index.html", html.includes("cxqa-btn") && html.includes("Compound exit market calculator"));

/* ModExp precompile gas — expected values produced by an
   independent pure-Python transcription of the pricing
   pseudocode published in EIP-2565 and EIP-7883
   (hidden_files/oracle-modexp.py), itself anchored in-script
   on the two EIPs' own test tables: a 64-byte base and modulus
   with exponent 0x10001 reproduces the nagydani_1_pow0x10001
   row under both schedules (341 / 2,048) and a 1,024-byte pair
   the nagydani_5 row (87,381 / 524,288). Vectors are
   [baseLength, exponentLength, modulusLength, exponentHeadHex]
   -> [complexity2565, iteration2565, gas2565, complexity7883,
   iteration7883, gas7883], the head being the exponent's first
   min(exponentLength, 32) bytes. */
check("modexp controls labelled in index.html",
  ["mxg-base-len", "mxg-exp-len", "mxg-mod-len", "mxg-exp-head"]
    .every(id => html.includes(`for="${id}"`)));
check("modexp gas matches the Python oracle under both schedules (prefill and large nagydani anchors, square minimums, zero exponent and exponent 1 floored to iteration 1, empty call, the 32/33-byte complexity boundary, a full 32-byte head at iteration 255, a 33-byte exponent under both per-byte rates, a zero head contributing -1, a 64-byte exponent, odd asymmetric lengths, tiny operands with a maximal head, and 100,000-byte lengths — whose EIP-7883 price is null under the EIP-7823 cap below)",
  (() => { const V = [
    [["64", "3", "64", "0x010001"], ["64", "16", "341", "128", "16", "2048"]],
    [["64", "1", "64", "0x02"], ["64", "1", "200", "128", "1", "500"]],
    [["32", "32", "32", "0x" + "00".repeat(32)], ["16", "1", "200", "16", "1", "500"]],
    [["32", "1", "32", "0x01"], ["16", "1", "200", "16", "1", "500"]],
    [["0", "0", "0", "0x"], ["0", "1", "200", "16", "1", "500"]],
    [["32", "1", "32", "0x02"], ["16", "1", "200", "16", "1", "500"]],
    [["33", "1", "33", "0x02"], ["25", "1", "200", "50", "1", "500"]],
    [["32", "32", "32", "0x80" + "00".repeat(31)], ["16", "255", "1360", "16", "255", "4080"]],
    [["64", "33", "64", "0x80" + "00".repeat(31)], ["64", "263", "5610", "128", "271", "34688"]],
    [["64", "33", "64", "0x" + "00".repeat(32)], ["64", "7", "200", "128", "15", "1920"]],
    [["128", "64", "128", "0x" + "ff".repeat(32)], ["256", "511", "43605", "512", "767", "392704"]],
    [["1024", "3", "1024", "0x010001"], ["16384", "16", "87381", "32768", "16", "524288"]],
    [["100", "7", "55", "0xabcdef01234567"], ["169", "55", "3098", "338", "55", "18590"]],
    [["8", "32", "8", "0x" + "ff".repeat(32)], ["1", "255", "200", "16", "255", "4080"]],
    [["100000", "40", "99999", "0x" + "ab".repeat(32)], ["156250000", "319", "16614583333", "312500000", "383", null]]
  ]; return V.every(([inp, exp]) => { const r = app.modexpGas(...inp);
    return r !== null && r.complexity2565 === exp[0] && r.iteration2565 === exp[1] && r.gas2565 === exp[2] &&
      r.complexity7883 === exp[3] && r.iteration7883 === exp[4] && r.gas7883 === exp[5] &&
      r.capped7823 === (exp[5] === null); }); })());
check("modexp: prefilled page values reproduce the nagydani_1_pow0x10001 row of the EIPs' test tables (341 under EIP-2565, 2,048 under EIP-7883)",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.modexpGas(g("mxg-base-len"), g("mxg-exp-len"), g("mxg-mod-len"), g("mxg-exp-head"));
    return r !== null && r.gas2565 === "341" && r.gas7883 === "2048" && r.iteration2565 === "16" && r.iteration7883 === "16"; })());
/* EIP-7823 cap — expected values produced by an independent
   pure-Python transcription of the cap layered on the pricing
   (hidden_files/oracle-modexp-7823.py), itself anchored
   in-script on hand values before any vector was generated:
   exactly 1,024 in every field is NOT capped (the nagydani_5
   prices 87,381 / 524,288), 1,025 in the base or modulus alone
   is capped with an EIP-2565 price of 88,752 (words 129,
   complexity 16,641, iteration 16), and 1,025 in the exponent
   alone is capped at 174,912 (complexity 64, iteration 8,199).
   A capped call has gas7883 null — the precompile stops,
   returns an error and consumes all gas forwarded to it — and
   capped7823 true, while its EIP-2565 price is still quoted. */
check("modexp EIP-7823 cap matches the Python oracle (prefill and the empty call uncapped, exactly 1,024 in one or all fields uncapped, 1,025 in each field alone capped, all three over capped, and the 100,000-byte lengths capped with the old schedule's price intact)",
  (() => { const V = [
    [["64", "3", "64", "0x010001"], ["341", "2048", false]],
    [["1024", "3", "1024", "0x010001"], ["87381", "524288", false]],
    [["1024", "1024", "1024", "0x" + "ff".repeat(32)], ["44733781", "528449536", false]],
    [["1025", "3", "64", "0x010001"], ["88752", null, true]],
    [["64", "1025", "64", "0x80" + "00".repeat(31)], ["174912", null, true]],
    [["64", "3", "1025", "0x010001"], ["88752", null, true]],
    [["1025", "1025", "1025", "0x" + "00".repeat(32)], ["44059821", null, true]],
    [["100000", "40", "99999", "0x" + "ab".repeat(32)], ["16614583333", null, true]],
    [["0", "0", "0", "0x"], ["200", "500", false]]
  ]; return V.every(([inp, exp]) => { const r = app.modexpGas(...inp);
    return r !== null && r.gas2565 === exp[0] && r.gas7883 === exp[1] && r.capped7823 === exp[2]; }); })());
check("modexp: the EIP-7823 boundary is per length at exactly 1,024 bytes — 1,024 allowed in any single field, 1,025 refused a Fusaka price in any single field",
  (() => { const H3 = "0x010001", H32 = "0x" + "ff".repeat(32);
    return app.modexpGas("1024", "3", "64", H3).capped7823 === false &&
      app.modexpGas("64", "1024", "64", H32).capped7823 === false &&
      app.modexpGas("64", "3", "1024", H3).capped7823 === false &&
      app.modexpGas("1025", "3", "64", H3).gas7883 === null &&
      app.modexpGas("64", "1025", "64", H32).gas7883 === null &&
      app.modexpGas("64", "3", "1025", H3).gas7883 === null; })());
check("modexp refuses malformed lengths and a head whose byte count is not exactly min(exponent length, 32)",
  app.modexpGas("-1", "3", "64", "0x010001") === null &&
  app.modexpGas("64", "3.5", "64", "0x010001") === null &&
  app.modexpGas("", "3", "64", "0x010001") === null &&
  app.modexpGas("64", "3", "64", "0x0100") === null &&
  app.modexpGas("64", "3", "64", "0x01000100") === null &&
  app.modexpGas("64", "33", "64", "0x010001") === null &&
  app.modexpGas("64", "33", "64", "0x" + "00".repeat(33)) === null &&
  app.modexpGas("64", "0", "64", "0x00") === null &&
  app.modexpGas("64", "3", "64", "0xZZZZZZ") === null &&
  app.modexpGas("64", "3", "64", null) === null &&
  app.modexpGas("64", null, "64", "0x010001") === null);
check("modexp tool section present in index.html", html.includes("mxg-btn") && html.includes("ModExp precompile gas calculator"));

/* Uniswap V3 tick ⇄ sqrtPriceX96 — expected values produced by an
   independent pure-Python transcription of TickMath (the Q128.128
   factor product forward; the log2-based inverse with the EVM's
   wrapping 256-bit multiply), cross-checked three ways in Python:
   the published MIN/MAX_SQRT_RATIO anchors at ticks ∓887272, an
   exact-integer isqrt evaluation of sqrt(1.0001^tick) × 2^96 (the
   library result is that value's floor or floor + 1, as it rounds
   up), and a round-trip over 361 sampled ticks (the maximum tick
   excluded: its ratio is not a valid input to the inverse, which
   requires sqrt < MAX_SQRT_RATIO). The price is (sqrt / 2^96)^2
   truncated to 12 significant digits. */
check("v3t controls labelled in index.html",
  html.includes('for="v3t-mode"') && html.includes('for="v3t-value"'));
check("v3t: tick → sqrtPriceX96 + price match the Python oracle",
  (() => { const V = [
    ["0", "79228162514264337593543950336", "1.00000000000"],
    ["1", "79232123823359799118286999568", "1.00010000000"],
    ["-1", "79224201403219477170569942574", "0.999900009999"],
    ["60", "79466191966197645195421774833", "1.00601773426"],
    ["-60", "78990846045029531151608375686", "0.994018262239"],
    ["200", "80024378775772204256025656563", "1.02020031989"],
    ["-200", "78439868342809377387252074393", "0.980199653440"],
    ["1000", "83290069058676223003182343270", "1.10516539260"],
    ["-1000", "75364347830767020784054125655", "0.904841941932"],
    ["10000", "130621891405341611593710811006", "2.71814592682"],
    ["-10000", "48055510970269007215549348797", "0.367897834377"],
    ["100000", "11755562826496067164730007768450", "22015.4560485"],
    ["-100000", "533968626430936354154228408", "0.0000454226338893"],
    ["200000", "1744244129640337381386292603617838", "484680305.025"],
    ["-200000", "3598751819609688046946419", "2.06321566944e-9"],
    ["85176", "5602223755577321903022134995689", "4999.90478577"],
    ["-85176", "1120466087977560823015148755", "0.000200003808641"],
    ["887271", "1461373636630004318706518188784493106690254656249", "3.40222764559e38"],
    ["-887272", "4295128739", "2.93895680877e-39"],
    ["887272", "1461446703485210103287273052203988822378723970342", "3.40256786836e38"]
  ]; return V.every(([t, s, p]) => { const r = app.uniswapV3Tick("tick", t);
    return r !== null && r.tick === t && r.sqrtPriceX96 === s && r.price === p; }); })());
check("v3t: sqrtPriceX96 → tick + price match the Python oracle",
  (() => { const V = [
    ["4295128739", "-887272", "2.93895680877e-39"],
    ["4295128740", "-887272", "2.93895681014e-39"],
    ["79228162514264337593543950336", "0", "1.00000000000"],
    ["79228162514264337593543950335", "-1", "0.999999999999"],
    ["79228162514264337593543950337", "0", "1.00000000000"],
    ["123456789012345678901234567890", "8871", "2.42812358246"],
    ["33954926791827573254375978715", "-16947", "0.183673469387"],
    ["1461446703485210103287273052203988822378723970341", "887271", "3.40256786836e38"],
    ["5602223755577321903022134995689", "85176", "4999.90478577"],
    ["1120466087977560823015148755", "-85176", "0.000200003808641"],
    ["1744244129640337381386292603617838", "200000", "484680305.025"]
  ]; return V.every(([s, t, p]) => { const r = app.uniswapV3Tick("sqrt", s);
    return r !== null && r.tick === t && r.sqrtPriceX96 === s && r.price === p; }); })());
check("v3t: published MIN/MAX sqrt ratio constants are the boundary ticks' ratios",
  String(app.V3_MIN_SQRT) === "4295128739" && String(app.V3_MAX_SQRT) === "1461446703485210103287273052203988822378723970342" &&
  app.uniswapV3Tick("tick", "-887272").sqrtPriceX96 === String(app.V3_MIN_SQRT) &&
  app.uniswapV3Tick("tick", "887272").sqrtPriceX96 === String(app.V3_MAX_SQRT));
check("v3t: round trip tick → sqrt → tick is the identity (max tick excluded by the inverse's range)",
  ["-887272", "-200000", "-85176", "-1000", "-1", "0", "1", "60", "1000", "10000", "85176", "200000", "887271"]
    .every(t => app.uniswapV3Tick("sqrt", app.uniswapV3Tick("tick", t).sqrtPriceX96).tick === t));
check("v3t: sqrt input accepts 0x hex and trims whitespace",
  app.uniswapV3Tick("sqrt", "0x" + (1n << 96n).toString(16)).tick === "0" &&
  app.uniswapV3Tick("sqrt", "0X" + (1n << 96n).toString(16).toUpperCase()).sqrtPriceX96 === "79228162514264337593543950336" &&
  app.uniswapV3Tick("tick", " 1000 ").sqrtPriceX96 === "83290069058676223003182343270");
check("v3t: prefilled page values reproduce tick 1000's oracle values",
  (() => { const m = /id="v3t-value"[^>]*value="([^"]+)"/.exec(html);
    const r = m && app.uniswapV3Tick("tick", m[1]);
    return r !== null && r.sqrtPriceX96 === "83290069058676223003182343270" && r.price === "1.10516539260"; })());
check("v3t converter refuses out-of-range and malformed inputs",
  app.uniswapV3Tick("tick", "887273") === null &&
  app.uniswapV3Tick("tick", "-887273") === null &&
  app.uniswapV3Tick("tick", "1.5") === null &&
  app.uniswapV3Tick("tick", "") === null &&
  app.uniswapV3Tick("tick", "0x10") === null &&
  app.uniswapV3Tick("sqrt", "4295128738") === null &&
  app.uniswapV3Tick("sqrt", "1461446703485210103287273052203988822378723970342") === null &&
  app.uniswapV3Tick("sqrt", "0") === null &&
  app.uniswapV3Tick("sqrt", "-5") === null &&
  app.uniswapV3Tick("sqrt", "1.5") === null &&
  app.uniswapV3Tick("sqrt", "0xzz") === null &&
  app.uniswapV3Tick("sqrt", "1".repeat(50)) === null &&
  app.uniswapV3Tick("price", "1000") === null &&
  app.uniswapV3Tick("tick", null) === null);
check("v3t tool section present in index.html", html.includes("v3t-btn") && html.includes("Uniswap V3 tick"));
check("TickMath linked from index.html", html.includes("https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/TickMath.sol"));

/* Uniswap V3 liquidity amounts — vectors from an independent pure-Python
   transcription of LiquidityAmounts + SqrtPriceMath (floor rounding),
   with sqrt ratios taken from the TickMath verified above. */
check("v3l controls labelled in index.html",
  ["v3l-mode", "v3l-lower", "v3l-upper", "v3l-current", "v3l-liquidity", "v3l-amount0", "v3l-amount1"]
    .every(id => html.includes(`for="${id}"`)));
check("v3l: amounts for liquidity match the Python oracle",
  [[-1000, 1000, 0, "1000000", "48768", "48768"],
   [-1000, 1000, -1000, "1000000", "100036", "0"],
   [-1000, 1000, 1000, "1000000", "0", "100036"],
   [-1000, 1000, -2000, "123456789", "12350205", "0"],
   [-1000, 1000, 5000, "987654321", "0", "98801645"],
   [-10000, 10000, 100, "1000000000000000000", "388466905771416146", "398466447465216445"],
   [0, 100, 50, "1", "0", "0"],
   [-100, 0, -50, "7777777", "19467", "19370"],
   [-100000, 100000, 0, "555", "551", "551"],
   [-887272, 887272, 0, "1000", "999", "999"],
   [-1000, 1000, 999, "170141183460469231731687303715884105728", "8091982935921660856338047221399851", "17011414203158618009553105060947296256"],
   [-1000, 1000, -999, "3", "0", "0"]]
    .every(([lo, hi, cur, liq, a0, a1]) => {
      const r = app.uniswapV3Liquidity("amounts", String(lo), String(hi), String(cur), liq, "0", "0");
      return r !== null && r.amount0 === a0 && r.amount1 === a1 && r.liquidity === liq;
    }));
check("v3l: liquidity for amounts matches the Python oracle (L and amounts actually used)",
  [[-1000, 1000, 0, "10000", "10000", "205051", "9999", "9999"],
   [-1000, 1000, 0, "500", "100000", "10252", "499", "499"],
   [-1000, 1000, -2000, "12345", "99999", "123404", "12344", "0"],
   [-1000, 1000, 5000, "99999", "54321", "543010", "0", "54320"],
   [-1000, 1000, -1000, "1000", "1000", "9996", "999", "0"],
   [-1000, 1000, 1000, "1000", "1000", "9996", "0", "999"],
   [-10000, 10000, 100, "1000000000000", "1000000000000", "2509621591382", "974904934261", "999999999999"],
   [0, 100, 50, "123456", "654321", "49570387", "123455", "124074"]]
    .every(([lo, hi, cur, d0, d1, liq, u0, u1]) => {
      const r = app.uniswapV3Liquidity("liquidity", String(lo), String(hi), String(cur), "0", d0, d1);
      return r !== null && r.liquidity === liq && r.amount0 === u0 && r.amount1 === u1 &&
        r.desiredAmount0 === d0 && r.desiredAmount1 === d1;
    }));
check("v3l: 1 base unit of each token in-range mints L=20 (per-unit-L amount ≈0.048, so it is NOT too small — oracle-verified)",
  (() => { const r = app.uniswapV3Liquidity("liquidity", "-1000", "1000", "0", "0", "1", "1");
    return r !== null && r.liquidity === "20" && r.amount0 === "0" && r.amount1 === "0"; })());
check("v3l: round trip amounts → liquidity never exceeds the original L and is exact on the oracle cases",
  [[-1000, 1000, 0, "1000000", "999995"],
   [-1000, 1000, -1000, "1000000", "999993"],
   [-1000, 1000, 1000, "1000000", "999993"],
   [-10000, 10000, 100, "1000000000000000000", "999999999999999998"]]
    .every(([lo, hi, cur, liq, liq2]) => {
      const a = app.uniswapV3Liquidity("amounts", String(lo), String(hi), String(cur), liq, "0", "0");
      const back = a && app.uniswapV3Liquidity("liquidity", String(lo), String(hi), String(cur), "0", a.amount0, a.amount1);
      return back !== null && back.liquidity === liq2 && BigInt(back.liquidity) <= BigInt(liq);
    }));
check("v3l: sqrt ratios in the result are the TickMath ratios of the three ticks",
  (() => { const r = app.uniswapV3Liquidity("amounts", "-1000", "1000", "0", "1000000", "0", "0");
    return r !== null && r.sqrtLower === "75364347830767020784054125655" &&
      r.sqrtUpper === "83290069058676223003182343270" && r.sqrtCurrent === "79228162514264337593543950336"; })());
check("v3l: prefilled page values reproduce the oracle's 48768 / 48768",
  (() => { const g = id => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = g("v3l-lower") !== null && app.uniswapV3Liquidity("amounts", g("v3l-lower"), g("v3l-upper"), g("v3l-current"), g("v3l-liquidity"), "0", "0");
    return r !== null && r !== false && r.amount0 === "48768" && r.amount1 === "48768"; })());
check("v3l calculator refuses invalid ranges, bounds and malformed inputs",
  app.uniswapV3Liquidity("amounts", "1000", "-1000", "0", "100", "0", "0") === null &&
  app.uniswapV3Liquidity("amounts", "1000", "1000", "0", "100", "0", "0") === null &&
  app.uniswapV3Liquidity("amounts", "-887273", "1000", "0", "100", "0", "0") === null &&
  app.uniswapV3Liquidity("amounts", "-1000", "1000", "887273", "100", "0", "0") === null &&
  app.uniswapV3Liquidity("amounts", "-1000", "1000", "0", "0", "0", "0") === null &&
  app.uniswapV3Liquidity("amounts", "-1000", "1000", "0", "340282366920938463463374607431768211456", "0", "0") === null &&
  app.uniswapV3Liquidity("amounts", "-1000", "1000", "0", "1.5", "0", "0") === null &&
  app.uniswapV3Liquidity("amounts", "-1000", "1000", "0", "-5", "0", "0") === null &&
  app.uniswapV3Liquidity("amounts", "-1000", "1000", "1.5", "100", "0", "0") === null &&
  app.uniswapV3Liquidity("liquidity", "-1000", "1000", "0", "0", "0", "0") === null &&
  app.uniswapV3Liquidity("liquidity", "-1000", "1000", "-2000", "0", "0", "99999") === null &&
  app.uniswapV3Liquidity("liquidity", "-1000", "1000", "5000", "0", "99999", "0") === null &&
  app.uniswapV3Liquidity("liquidity", "-1000", "1000", "0", "0", "0", "100") === null &&
  app.uniswapV3Liquidity("liquidity", "-1000", "1000", "0", "0", "-1", "100") === null &&
  app.uniswapV3Liquidity("liquidity", "-1000", "1000", "0", "0", "1".repeat(79), "100") === null &&
  app.uniswapV3Liquidity("swap", "-1000", "1000", "0", "100", "0", "0") === null &&
  app.uniswapV3Liquidity("amounts", "-1000", "1000", "0", null, "0", "0") === null);
check("v3l tool section present in index.html", html.includes("v3l-btn") && html.includes("Uniswap V3 liquidity amounts"));
check("LiquidityAmounts linked from index.html", html.includes("https://github.com/Uniswap/v3-periphery/blob/main/contracts/libraries/LiquidityAmounts.sol"));
check("SqrtPriceMath linked from index.html", html.includes("https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/SqrtPriceMath.sol"));

/* Uniswap V3 swap step — vectors from an independent pure-Python
   transcription of SwapMath.computeSwapStep over SqrtPriceMath
   (hidden_files/oracle-v3swap.py), covering exact-in/out in both
   directions, steps that reach the target and steps that stop short,
   the capped-output branch, the exact-in fee-remainder rule, a zero
   fee tier, a 1-unit input taken entirely as fee, the minimum tick as
   target, and 2^100 liquidity. */
check("v3s controls labelled in index.html",
  ["v3s-mode", "v3s-current", "v3s-target", "v3s-liquidity", "v3s-amount", "v3s-fee"]
    .every(id => html.includes(`for="${id}"`) && html.includes(`id="${id}"`)));
const V3S_VECTORS = [
  // mode, curTick, tgtTick, liquidity, amount, feePips, sqrtNext, amountIn, amountOut, feeAmount, reached
  ["in", 0, -1000, "1000000000", "10000", 3000, "79227372617359342520899016973", "9970", "9969", "30", false],
  ["in", 0, -1000, "1000000000", "1000000000000", 3000, "75364347830767020784054125655", "51268469", "48768197", "154269", true],
  ["in", 0, 1000, "1000000000", "10000", 3000, "79228952419044604808989757969", "9970", "9969", "30", false],
  ["in", 0, 1000, "1000000000", "1000000000000", 500, "83290069058676223003182343270", "51268469", "48768197", "25648", true],
  ["out", 0, -1000, "1000000000", "5000", 3000, "79227766373451766271855982616", "5001", "5000", "16", false],
  ["out", 0, -1000, "1000000000", "1000000000000", 3000, "75364347830767020784054125655", "51268469", "48768197", "154269", true],
  ["out", 0, 1000, "1000000000", "5000", 10000, "79228558657057622881658358628", "5001", "5000", "51", false],
  ["out", 0, 1000, "1000000000", "1000000000000", 10000, "83290069058676223003182343270", "51268469", "48768197", "517864", true],
  ["in", 100000, 90000, "1000000000000000", "123456789", 500, "11755347599327602481328037511066", "123395060", "2716548783091", "61729", false],
  ["out", -50000, -40000, "1000000000000", "987654321", 100, "6504783957206221884726103341", "6656967", "987654321", "666", false],
  ["in", 0, -100, "1000000", "1", 3000, "79228162514264337593543950336", "0", "0", "1", false],
  ["in", 0, 100, "1000000000000000000", "1000000000000000", 0, "79307390676778601931137494286", "1000000000000000", "999000999000999", "0", false],
  ["in", 0, -887272, "1000", "1000000", 3000, "79386936387038414422388728", "997000", "998", "3000", false],
  ["in", 200000, 190000, "1267650600228229401496703205376", "100000000000000000000", 3000, "1744241109481416104375801925340153", "99700000000000000000", "48322542740432167850852442960", "300000000000000000", false],
  ["in", -40000, -50000, "1000000000000", "555555555", 100, "10722631838229971806050207512", "555499999", "10175607", "55556", false],
  ["out", 90000, 100000, "1000000000000000", "424242424242", 500, "7413332213026423895921960239844", "3572526290134867", "424242424242", "1787156723430", false]
];
check("v3s: swap steps match the Python oracle (sqrtNext, amountIn, amountOut, fee, reached)",
  V3S_VECTORS.every(([mode, cur, tgt, liq, amt, fee, sqrtNext, ain, aout, feeAmt, reached]) => {
    const r = app.uniswapV3SwapStep(mode, String(cur), String(tgt), liq, amt, String(fee));
    return r !== null && r.sqrtNext === sqrtNext && r.amountIn === ain && r.amountOut === aout &&
      r.feeAmount === feeAmt && r.reachedTarget === reached && r.zeroForOne === (tgt < cur);
  }));
check("v3s: accounting identities — exact-in total input never exceeds the specified amount, exact-out output never exceeds it",
  V3S_VECTORS.every(([mode, cur, tgt, liq, amt, fee]) => {
    const r = app.uniswapV3SwapStep(mode, String(cur), String(tgt), liq, amt, String(fee));
    if (r === null) return false;
    const spec = BigInt(amt);
    return mode === "in"
      ? BigInt(r.totalInput) + BigInt(r.remaining) === spec
      : BigInt(r.amountOut) + BigInt(r.remaining) === spec;
  }));
check("v3s: sqrtNext stays between the current and target prices, and tickNext agrees with it",
  V3S_VECTORS.every(([mode, cur, tgt, liq, amt, fee]) => {
    const r = app.uniswapV3SwapStep(mode, String(cur), String(tgt), liq, amt, String(fee));
    if (r === null) return false;
    const c = BigInt(r.sqrtCurrent), t = BigInt(r.sqrtTarget), n = BigInt(r.sqrtNext);
    const between = c <= t ? (c <= n && n <= t) : (t <= n && n <= c);
    const tickOk = r.reachedTarget ? r.tickNext === String(tgt)
      : app.uniswapV3Tick("sqrt", r.sqrtNext).tick === r.tickNext;
    return between && tickOk;
  }));
check("v3s: prefilled page values reproduce the oracle step (9970 in, 30 fee, 9969 out, tick −1)",
  (() => { const g = id => { const m = html.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`)); return m && m[1]; };
    const r = g("v3s-current") !== null && app.uniswapV3SwapStep("in", g("v3s-current"), g("v3s-target"), g("v3s-liquidity"), g("v3s-amount"), g("v3s-fee"));
    return r && r.amountIn === "9970" && r.feeAmount === "30" && r.totalInput === "10000" &&
      r.amountOut === "9969" && r.tickNext === "-1" && r.remaining === "0" && r.reachedTarget === false; })());
check("v3s calculator refuses equal/out-of-range ticks, bad bounds and malformed inputs",
  app.uniswapV3SwapStep("in", "0", "0", "1000", "100", "3000") === null &&
  app.uniswapV3SwapStep("in", "0", "-887273", "1000", "100", "3000") === null &&
  app.uniswapV3SwapStep("in", "887273", "0", "1000", "100", "3000") === null &&
  app.uniswapV3SwapStep("in", "0", "-1000", "0", "100", "3000") === null &&
  app.uniswapV3SwapStep("in", "0", "-1000", "340282366920938463463374607431768211456", "100", "3000") === null &&
  app.uniswapV3SwapStep("in", "0", "-1000", "1000", "0", "3000") === null &&
  app.uniswapV3SwapStep("in", "0", "-1000", "1000", "-5", "3000") === null &&
  app.uniswapV3SwapStep("in", "0", "-1000", "1000", "1.5", "3000") === null &&
  app.uniswapV3SwapStep("in", "0", "-1000", "1000", "100", "1000000") === null &&
  app.uniswapV3SwapStep("in", "0", "-1000", "1000", "100", "-1") === null &&
  app.uniswapV3SwapStep("in", "0", "-1000", "1000", "100", "0.3") === null &&
  app.uniswapV3SwapStep("swap", "0", "-1000", "1000", "100", "3000") === null &&
  app.uniswapV3SwapStep("in", "0", "-1000", "1000", null, "3000") === null);
check("v3s tool section present in index.html", html.includes("v3s-btn") && html.includes("Uniswap V3 swap step"));
check("SwapMath linked from index.html", html.includes("https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/SwapMath.sol"));

/* SSTORE gas & refund — expected values produced by an
   independent pure-Python transcription of the net-metering
   branch table with current-mainnet parameters
   (hidden_files/oracle-sstore.py), itself anchored in-script
   on the EIPs' published write-sequence tables: 17 cumulative
   refund rows and 3 warm gas sums reproduced exactly
   (including the 0→1→0 restore at 19,900 and the 1→0→1→0
   sequence at 7,600). Vectors are [original, current, new,
   cold] -> [gas, refundDelta, branch], spanning every
   zero/equality class of the three values. */
check("sstore controls labelled in index.html",
  ["sst-original", "sst-current", "sst-new", "sst-access"]
    .every(id => html.includes(`for="${id}"`)));
check("sstore gas & refund match the Python oracle across every zero/equality class (no-op warm and cold, clean set warm and cold, clean clear warm and cold at exactly 5,000/4,800, clean reset, dirty restore to a zero original at 19,900, dirty restore to a non-zero original at the net −2,000 after the clears removal, dirty re-clear at 4,800, dirty restore at 2,800, a negative-only dirty change at −4,800, plain dirty writes, and 2^255-scale values)",
  (() => { const V = [
    [["0", "0", "0", false], ["100", "0", "no-op"]],
    [["0", "0", "0", true], ["2200", "0", "no-op"]],
    [["0", "0", "1", true], ["22100", "0", "clean-set"]],
    [["0", "0", "1", false], ["20000", "0", "clean-set"]],
    [["1", "1", "1", false], ["100", "0", "no-op"]],
    [["1", "1", "0", false], ["2900", "4800", "clean-clear"]],
    [["1", "1", "0", true], ["5000", "4800", "clean-clear"]],
    [["1", "1", "2", false], ["2900", "0", "clean-reset"]],
    [["0", "1", "0", false], ["100", "19900", "dirty"]],
    [["0", "1", "2", false], ["100", "0", "dirty"]],
    [["0", "1", "1", false], ["100", "0", "no-op"]],
    [["1", "0", "1", false], ["100", "-2000", "dirty"]],
    [["1", "0", "2", false], ["100", "-4800", "dirty"]],
    [["1", "0", "0", false], ["100", "0", "no-op"]],
    [["1", "2", "0", false], ["100", "4800", "dirty"]],
    [["1", "2", "1", false], ["100", "2800", "dirty"]],
    [["1", "2", "3", false], ["100", "0", "dirty"]],
    [["1", "2", "2", true], ["2200", "0", "no-op"]],
    [[(2n ** 255n).toString(), (2n ** 255n).toString(), "0", true], ["5000", "4800", "clean-clear"]],
    [["0", "5", "0", true], ["2200", "19900", "dirty"]]
  ]; return V.every(([inp, exp]) => { const r = app.sstoreGas(...inp);
    return r !== null && r.gas === exp[0] && r.refundDelta === exp[1] && r.branch === exp[2]; }); })());
check("sstore: prefilled page values clear a cold untouched slot (5,000 gas, 4,800 refund credit, hex inputs agree)",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const cold = new RegExp(`id="sst-access"[^>]*>[\\s\\S]*?<option value="cold" selected`).test(html);
    const r = app.sstoreGas(g("sst-original"), g("sst-current"), g("sst-new"), cold);
    const h = app.sstoreGas("0x1", "0x01", "0x0", true);
    return r !== null && r.gas === "5000" && r.refundDelta === "4800" && r.branch === "clean-clear" &&
      h !== null && h.gas === "5000" && h.refundDelta === "4800"; })());
check("sstore refuses malformed words, a word above 2^256 − 1, and a non-boolean cold flag",
  app.sstoreGas("-1", "0", "0", false) === null &&
  app.sstoreGas("1.5", "0", "0", false) === null &&
  app.sstoreGas("", "0", "0", false) === null &&
  app.sstoreGas("0x", "0", "0", false) === null &&
  app.sstoreGas("0xZZ", "0", "0", false) === null &&
  app.sstoreGas((2n ** 256n).toString(), "0", "0", false) === null &&
  app.sstoreGas("0x" + "ff".repeat(33), "0", "0", false) === null &&
  app.sstoreGas("1", "1", "0", "yes") === null &&
  app.sstoreGas("1", "1", null, true) === null &&
  app.sstoreGas(null, "1", "0", true) === null);
check("sstore tool section present in index.html", html.includes("sst-btn") && html.includes("SSTORE gas"));

/* Memory expansion gas — expected values produced by an
   independent pure-Python transcription of the Yellow Paper
   memory-cost function C(w) = 3w + floor(w^2 / 512) charged
   as the difference on growth (hidden_files/oracle-memory.py),
   itself anchored in-script on hand values (1 word = 3,
   32 words = 98, 512 words = 2,048, the quadratic term first
   non-zero at 23 words), the no-growth rule, byte-to-word
   rounding, and a telescoping assert that stepwise expansions
   sum to the one-shot delta. Vectors are
   [currentBytes, newBytes] -> the full result object. */
check("memory controls labelled in index.html",
  ["mem-current", "mem-new"].every(id => html.includes(`for="${id}"`)));
check("memory expansion gas matches the Python oracle (empty and one-shot growths, word rounding on both sides, no-growth and shrink at 0, the 23-word quadratic onset inside the 33-to-65 step, 512 words at exactly 2,048, MiB-scale growth, and the client's 0x1FFFFFFFE0-byte maximum held and reached)",
  (() => { const V = [
    [["0", "0"], ["0", "0", "0", "0", "0", "0", "0"]],
    [["0", "1"], ["0", "1", "0", "1", "0", "3", "3"]],
    [["0", "32"], ["0", "32", "0", "1", "0", "3", "3"]],
    [["0", "33"], ["0", "33", "0", "2", "0", "6", "6"]],
    [["0", "1024"], ["0", "1024", "0", "32", "0", "98", "98"]],
    [["1024", "1024"], ["1024", "1024", "32", "32", "98", "98", "0"]],
    [["1024", "2048"], ["1024", "2048", "32", "64", "98", "200", "102"]],
    [["33", "65"], ["33", "65", "2", "3", "6", "9", "3"]],
    [["1", "32768"], ["1", "32768", "1", "1024", "3", "5120", "5117"]],
    [["0", "16384"], ["0", "16384", "0", "512", "0", "2048", "2048"]],
    [["16384", "16385"], ["16384", "16385", "512", "513", "2048", "2053", "5"]],
    [["0", "1048576"], ["0", "1048576", "0", "32768", "0", "2195456", "2195456"]],
    [["999", "100000"], ["999", "100000", "32", "3125", "98", "28448", "28350"]],
    [["0", "2097152"], ["0", "2097152", "0", "65536", "0", "8585216", "8585216"]],
    [["123456789", "987654321"], ["123456789", "987654321", "3858025", "30864198", "29082583646", "1860636964045", "1831554380399"]],
    [["137438953440", "137438953440"], ["137438953440", "137438953440", "4294967295", "4294967295", "36028809887088637", "36028809887088637", "0"]],
    [["0", "137438953440"], ["0", "137438953440", "0", "4294967295", "0", "36028809887088637", "36028809887088637"]]
  ]; return V.every(([inp, exp]) => { const r = app.memoryGas(...inp);
    return r !== null && [r.currentBytes, r.newBytes, r.currentWords, r.newWords, r.totalBefore, r.totalAfter, r.expansionGas].join(",") === exp.join(","); }); })());
check("memory: prefilled page values grow empty memory to 1,024 bytes (32 words, exactly 98 gas)",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.memoryGas(g("mem-current"), g("mem-new"));
    return r !== null && r.expansionGas === "98" && r.newWords === "32" && r.totalAfter === "98"; })());
check("memory refuses malformed sizes and any size above 0x1FFFFFFFE0 bytes",
  app.memoryGas("-1", "0") === null &&
  app.memoryGas("1.5", "0") === null &&
  app.memoryGas("", "0") === null &&
  app.memoryGas("0", "137438953441") === null &&
  app.memoryGas("9999999999999", "0") === null &&
  app.memoryGas("0x10", "0") === null &&
  app.memoryGas(null, "0") === null &&
  app.memoryGas("0", 1024) === null);
check("memory tool section present in index.html", html.includes("mem-btn") && html.includes("Memory expansion gas"));

/* CALL gas — expected values produced by an independent
   pure-Python transcription of the published rules
   (hidden_files/oracle-call-gas.py): EIP-2929 access
   (2,600 cold / 100 warm, charged before forwarding),
   9,000 value transfer and 25,000 empty-target surcharge
   (the latter only with value), memory expansion over the
   larger region end with zero-size regions touching
   nothing, EIP-150 forwarding capped at R - floor(R/64)
   of the post-cost remainder, and the 2,300 value stipend
   added for the callee without being deducted from the
   caller. The oracle is anchored in-script on hand values
   (the prefilled call's 11,600 / 87,019 / 89,319 / 1,381
   split, remainder 63 forwarding whole and 64 forwarding
   63, the empty-target surcharge's value condition) and on
   a conservation assert (base + forwarded + retained =
   available, stipend extra) over every non-OOG vector.
   Vectors are [available, requested, value, cold, empty,
   curMem, inOff, inSize, outOff, outSize] -> the full
   result object. */
check("call controls labelled in index.html",
  ["call-available", "call-requested", "call-value", "call-access", "call-target", "call-mem", "call-in-off", "call-in-size", "call-out-off", "call-out-size"].every(id => html.includes(`for="${id}"`)));
check("CALL gas matches the Python oracle (prefill cap-bound split, warm/cold access, empty-target surcharge only with value, requested at/above/under the cap, remainders 63 and 64, memory as the larger region end with zero-size regions inert, growth vs already-held memory, out-of-gas below the base, exactly-the-base forwarding 0, a zero request still delivering the stipend, and 10^12-scale gas)",
  (() => { const V = [
    [["100000", "1000000", "1000000000000000000", true, false, "0", "0", "0", "0", "0"], ["2600", "9000", "0", "0", "11600", "0", "false", "88400", "87019", "87019", "2300", "89319", "1381"]],
    [["10000", "5000", "0", false, false, "0", "0", "0", "0", "0"], ["100", "0", "0", "0", "100", "0", "false", "9900", "9746", "5000", "0", "5000", "4900"]],
    [["10000", "5000", "0", true, true, "0", "0", "0", "0", "0"], ["2600", "0", "0", "0", "2600", "0", "false", "7400", "7285", "5000", "0", "5000", "2400"]],
    [["100000", "5000", "1", true, true, "0", "0", "0", "0", "0"], ["2600", "9000", "25000", "0", "36600", "0", "false", "63400", "62410", "5000", "2300", "7300", "58400"]],
    [["100000", "5000", "1", false, true, "0", "0", "0", "0", "0"], ["100", "9000", "25000", "0", "34100", "0", "false", "65900", "64871", "5000", "2300", "7300", "60900"]],
    [["100000", "87019", "1000000000000000000", true, false, "0", "0", "0", "0", "0"], ["2600", "9000", "0", "0", "11600", "0", "false", "88400", "87019", "87019", "2300", "89319", "1381"]],
    [["100000", "87020", "1000000000000000000", true, false, "0", "0", "0", "0", "0"], ["2600", "9000", "0", "0", "11600", "0", "false", "88400", "87019", "87019", "2300", "89319", "1381"]],
    [["163", "1000", "0", false, false, "0", "0", "0", "0", "0"], ["100", "0", "0", "0", "100", "0", "false", "63", "63", "63", "0", "63", "0"]],
    [["164", "1000", "0", false, false, "0", "0", "0", "0", "0"], ["100", "0", "0", "0", "100", "0", "false", "64", "63", "63", "0", "63", "1"]],
    [["100000", "1000", "0", false, false, "0", "0", "64", "128", "32"], ["100", "0", "0", "15", "115", "160", "false", "99885", "98325", "1000", "0", "1000", "98885"]],
    [["100000", "1000", "0", false, false, "0", "999999", "0", "0", "0"], ["100", "0", "0", "0", "100", "0", "false", "99900", "98340", "1000", "0", "1000", "98900"]],
    [["100000", "1000", "0", false, false, "1024", "0", "2048", "0", "0"], ["100", "0", "0", "102", "202", "2048", "false", "99798", "98239", "1000", "0", "1000", "98798"]],
    [["100000", "1000", "0", false, false, "2048", "0", "1024", "0", "0"], ["100", "0", "0", "0", "100", "1024", "false", "99900", "98340", "1000", "0", "1000", "98900"]],
    [["1000", "5000", "0", true, false, "0", "0", "0", "0", "0"], ["2600", "0", "0", "0", "2600", "0", "true", "0", "0", "0", "0", "0", "0"]],
    [["2600", "5000", "0", true, false, "0", "0", "0", "0", "0"], ["2600", "0", "0", "0", "2600", "0", "false", "0", "0", "0", "0", "0", "0"]],
    [["100000", "0", "7", true, false, "0", "0", "0", "0", "0"], ["2600", "9000", "0", "0", "11600", "0", "false", "88400", "87019", "0", "2300", "2300", "88400"]],
    [["1000000000000", "100000000000", "5", true, true, "1024", "0", "4096", "8192", "4096"], ["2600", "9000", "25000", "1342", "37942", "12288", "false", "999999962058", "984374962651", "100000000000", "2300", "100000002300", "899999962058"]],
    [["50000", "44100", "0", true, false, "0", "0", "0", "0", "0"], ["2600", "0", "0", "0", "2600", "0", "false", "47400", "46660", "44100", "0", "44100", "3300"]]
  ]; return V.every(([inp, exp]) => { const r = app.callGasCalc(...inp);
    return r !== null && [r.accessGas, r.transferGas, r.newAccountGas, r.memoryGas, r.baseGas, r.newMemBytes, String(r.outOfGas), r.remaining, r.capGas, r.forwardedGas, r.stipend, r.calleeGas, r.callerRetained].join(",") === exp.join(","); }); })());
check("call: prefilled page values split 100,000 into an 11,600 base, 87,019 forwarded, 89,319 delivered and the 1,381 reserve",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.callGasCalc(g("call-available"), g("call-requested"), g("call-value"),
      html.includes('id="call-access"><option value="cold" selected'),
      html.includes('id="call-target"><option value="empty" selected'),
      g("call-mem"), g("call-in-off"), g("call-in-size"), g("call-out-off"), g("call-out-size"));
    return r !== null && r.baseGas === "11600" && r.forwardedGas === "87019" && r.calleeGas === "89319" && r.callerRetained === "1381"; })());
check("call refuses malformed gas, value and memory inputs and region ends past the client's bound",
  app.callGasCalc("-1", "0", "0", true, false, "0", "0", "0", "0", "0") === null &&
  app.callGasCalc("100000", "1.5", "0", true, false, "0", "0", "0", "0", "0") === null &&
  app.callGasCalc("100000", "0", "0x" + "ff".repeat(33), true, false, "0", "0", "0", "0", "0") === null &&
  app.callGasCalc("100000", "0", "0", "yes", false, "0", "0", "0", "0", "0") === null &&
  app.callGasCalc("100000", "0", "0", true, false, "137438953441", "0", "0", "0", "0") === null &&
  app.callGasCalc("100000", "0", "0", true, false, "0", "137438953440", "32", "0", "0") === null &&
  app.callGasCalc("100000", "0", "0", true, false, "0", "0", "0", "0", null) === null &&
  app.callGasCalc(null, "0", "0", true, false, "0", "0", "0", "0", "0") === null);
check("call tool section present in index.html", html.includes("call-btn") && html.includes("CALL gas calculator"));

/* CREATE / CREATE2 gas — expected values produced by an
   independent pure-Python transcription of the published
   rules (hidden_files/oracle-create-gas.py): an upfront
   cost of 32,000 plus initcode metering at 2 per word
   (EIP-3860), 6 more per word under CREATE2 for the address
   hash, plus memory expansion over the initcode region end
   with zero-size regions touching nothing; of the remainder
   the initcode receives R - floor(R/64) (EIP-150); a code
   deposit of 200 per deployed byte lands on success, with
   initcode above 49,152 (EIP-3860) and deployed code above
   24,576 (EIP-170) failing the creation outright. The oracle
   is anchored in-script on hand values (the prefilled
   creation's 32,162 / 460,529 / 7,309 / 160,000 figures,
   remainders 63 and 64, both size-limit boundaries) and on
   a conservation assert (upfront + forwarded + retained =
   available) over every forwarded vector. Vectors are
   [available, opcode, initSize, initOff, curMem, deployed]
   -> the full result object. */
check("create controls labelled in index.html",
  ["crg-available", "crg-opcode", "crg-init-size", "crg-init-off", "crg-mem", "crg-deployed"].every(id => html.includes(`for="${id}"`)));
check("CREATE / CREATE2 gas matches the Python oracle (prefill split and deposit, CREATE2 word premium, empty initcode, zero-size region inert at any offset, both size maxima at once, initcode one byte over the EIP-3860 limit refused, deployed code one byte over the EIP-170 limit failing at the deposit, out-of-gas one below and exactly at the upfront cost, remainders 63 and 64, already-held vs growing memory, a 33-byte CREATE2 initcode, and a 10^12-scale CREATE2 at both maxima)",
  (() => { const V = [
    [["500000", "create", "1000", "0", "0", "800"], ["32", "64", "98", "32162", "1000", "false", "false", "467838", "460529", "7309", "false", "160000", "192162"]],
    [["500000", "create2", "1000", "0", "0", "800"], ["32", "256", "98", "32354", "1000", "false", "false", "467646", "460340", "7306", "false", "160000", "192354"]],
    [["100000", "create", "0", "0", "0", "0"], ["0", "0", "0", "32000", "0", "false", "false", "68000", "66938", "1062", "false", "0", "32000"]],
    [["100000", "create", "0", "999999", "0", "0"], ["0", "0", "0", "32000", "0", "false", "false", "68000", "66938", "1062", "false", "0", "32000"]],
    [["10000000", "create", "49152", "0", "0", "24576"], ["1536", "3072", "9216", "44288", "49152", "false", "false", "9955712", "9800154", "155558", "false", "4915200", "4959488"]],
    [["10000000", "create", "49153", "0", "0", "0"], ["1537", "3074", "9225", "44299", "49153", "true", "false", "0", "0", "0", "false", "0", "0"]],
    [["500000", "create", "1000", "0", "0", "24577"], ["32", "64", "98", "32162", "1000", "false", "false", "467838", "460529", "7309", "true", "0", "32162"]],
    [["32161", "create", "1000", "0", "0", "800"], ["32", "64", "98", "32162", "1000", "false", "true", "0", "0", "0", "false", "160000", "192162"]],
    [["32162", "create", "1000", "0", "0", "800"], ["32", "64", "98", "32162", "1000", "false", "false", "0", "0", "0", "false", "160000", "192162"]],
    [["32063", "create", "0", "0", "0", "0"], ["0", "0", "0", "32000", "0", "false", "false", "63", "63", "0", "false", "0", "32000"]],
    [["32064", "create", "0", "0", "0", "0"], ["0", "0", "0", "32000", "0", "false", "false", "64", "63", "1", "false", "0", "32000"]],
    [["100000", "create", "1024", "0", "2048", "0"], ["32", "64", "0", "32064", "1024", "false", "false", "67936", "66875", "1061", "false", "0", "32064"]],
    [["100000", "create", "1024", "1024", "1024", "0"], ["32", "64", "102", "32166", "2048", "false", "false", "67834", "66775", "1059", "false", "0", "32166"]],
    [["100000", "create2", "33", "0", "0", "0"], ["2", "16", "6", "32022", "33", "false", "false", "67978", "66916", "1062", "false", "0", "32022"]],
    [["1000000000000", "create2", "49152", "0", "0", "24576"], ["1536", "12288", "9216", "53504", "49152", "false", "false", "999999946496", "984374947332", "15624999164", "false", "4915200", "4968704"]]
  ]; return V.every(([inp, exp]) => { const r = app.createGasCalc(...inp);
    return r !== null && [r.initcodeWords, r.wordGas, r.memoryGas, r.upfrontGas, r.newMemBytes, String(r.initcodeTooLarge), String(r.outOfGas), r.remaining, r.forwardedGas, r.creatorRetained, String(r.codeTooLarge), r.depositGas, r.fixedGas].join(",") === exp.join(","); }); })());
check("create: prefilled page values pay 32,162 upfront, forward 460,529, keep the 7,309 reserve and owe a 160,000 deposit (192,162 fixed)",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.createGasCalc(g("crg-available"),
      html.includes('id="crg-opcode"><option value="create2" selected') ? "create2" : "create",
      g("crg-init-size"), g("crg-init-off"), g("crg-mem"), g("crg-deployed"));
    return r !== null && r.upfrontGas === "32162" && r.forwardedGas === "460529" && r.creatorRetained === "7309" && r.depositGas === "160000" && r.fixedGas === "192162"; })());
check("create refuses malformed gas, size and opcode inputs and region ends past the client's bound",
  app.createGasCalc("-1", "create", "0", "0", "0", "0") === null &&
  app.createGasCalc("100000", "create3", "0", "0", "0", "0") === null &&
  app.createGasCalc("100000", null, "0", "0", "0", "0") === null &&
  app.createGasCalc("100000", "create", "1.5", "0", "0", "0") === null &&
  app.createGasCalc("100000", "create", "32", "137438953440", "0", "0") === null &&
  app.createGasCalc("100000", "create", "0", "0", "0", "137438953441") === null &&
  app.createGasCalc("100000", "create", "0", "0", "0", null) === null &&
  app.createGasCalc(null, "create", "0", "0", "0", "0") === null);
check("create tool section present in index.html", html.includes("crg-btn") && html.includes("CREATE &amp; CREATE2 gas calculator"));

/* LOG0-LOG4 gas — expected values produced by an independent
   pure-Python transcription of the Yellow Paper's log-cost
   terms (hidden_files/oracle-log-gas.py): 375 flat, 375 per
   topic, 8 per data byte, plus memory expansion over the data
   region end with zero-size regions touching nothing. The
   oracle is anchored in-script on hand values (the prefilled
   Transfer-shaped LOG3 at 1,759, a bare LOG0 at 375, LOG4 at
   1,875, 1 and 33 data bytes). Vectors are
   [topics, dataOff, dataSize, curMem] -> the full result. */
check("log controls labelled in index.html",
  ["log-topics", "log-off", "log-size", "log-mem"].every(id => html.includes(`for="${id}"`)));
check("LOG gas matches the Python oracle (prefill Transfer-shaped LOG3, bare LOG0, max topics, 1 and 33 data bytes, zero-size region inert at a large offset, region already held, partial growth, 100,000-byte payload, region ending exactly at the client's bound, region inside large memory, and a 1 MB payload)",
  (() => { const V = [
    [["3", "0", "32", "0"], ["3", "375", "1125", "256", "3", "1759", "32"]],
    [["0", "0", "0", "0"], ["0", "375", "0", "0", "0", "375", "0"]],
    [["4", "0", "0", "0"], ["4", "375", "1500", "0", "0", "1875", "0"]],
    [["0", "0", "1", "0"], ["0", "375", "0", "8", "3", "386", "1"]],
    [["0", "0", "33", "0"], ["0", "375", "0", "264", "6", "645", "33"]],
    [["2", "999999", "0", "0"], ["2", "375", "750", "0", "0", "1125", "0"]],
    [["0", "0", "32", "1024"], ["0", "375", "0", "256", "0", "631", "32"]],
    [["1", "32", "992", "32"], ["1", "375", "375", "7936", "95", "8781", "1024"]],
    [["4", "0", "100000", "0"], ["4", "375", "1500", "800000", "28448", "830323", "100000"]],
    [["0", "137438953408", "32", "0"], ["0", "375", "0", "256", "36028809887088637", "36028809887089268", "137438953440"]],
    [["3", "64", "128", "4096"], ["3", "375", "1125", "1024", "0", "2524", "192"]],
    [["2", "0", "1000000", "0"], ["2", "375", "750", "8000000", "2001098", "10002223", "1000000"]]
  ]; return V.every(([inp, exp]) => { const r = app.logGasCalc(...inp);
    return r !== null && [r.topics, r.baseGas, r.topicGas, r.dataGas, r.memoryGas, r.totalGas, r.newMemBytes].join(",") === exp.join(","); }); })());
check("log: prefilled page values (LOG3, 32 data bytes in fresh memory) cost exactly 1,759",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.logGasCalc(
      html.includes('value="3" selected') ? "3" : "0",
      g("log-off"), g("log-size"), g("log-mem"));
    return r !== null && r.baseGas === "375" && r.topicGas === "1125" && r.dataGas === "256" && r.memoryGas === "3" && r.totalGas === "1759"; })());
check("log refuses malformed topic, size and memory inputs and a non-zero region ending past the client's bound",
  app.logGasCalc("5", "0", "0", "0") === null &&
  app.logGasCalc("-1", "0", "0", "0") === null &&
  app.logGasCalc("1.5", "0", "0", "0") === null &&
  app.logGasCalc(null, "0", "0", "0") === null &&
  app.logGasCalc("0", "0", "1.5", "0") === null &&
  app.logGasCalc("0", "137438953440", "32", "0") === null &&
  app.logGasCalc("0", "0", "0", "137438953441") === null &&
  app.logGasCalc("0", null, "0", "0") === null);
check("log tool section present in index.html", html.includes("log-btn") && html.includes("LOG gas calculator"));

/* SHA3 (KECCAK256) gas — expected values produced by an independent
   pure-Python transcription of the Yellow Paper's hash-cost terms
   (hidden_files/oracle-sha3-gas.py): 30 flat, 6 per 32-byte word
   rounded up, plus memory expansion over the hashed region end
   with zero-size regions touching nothing. The oracle is anchored
   in-script on hand values (the prefilled 64-byte hash at 48, an
   empty hash at 30, 1 and 32 bytes at 39, 33 bytes at 48).
   Vectors are [dataOff, dataSize, curMem] -> the full result. */
check("sha3 controls labelled in index.html",
  ["sha3-off", "sha3-size", "sha3-mem"].every(id => html.includes(`for="${id}"`)));
check("SHA3 gas matches the Python oracle (prefill 64-byte mapping-style hash, empty hash, 1 and 32 and 33 bytes, zero-size region inert at a large offset, region already held, partial growth, 100,000-byte payload, region ending exactly at the client's bound, region inside large memory, and a 1 MB payload)",
  (() => { const V = [
    [["0", "64", "0"], ["30", "2", "12", "6", "48", "64"]],
    [["0", "0", "0"], ["30", "0", "0", "0", "30", "0"]],
    [["0", "32", "0"], ["30", "1", "6", "3", "39", "32"]],
    [["0", "1", "0"], ["30", "1", "6", "3", "39", "1"]],
    [["0", "33", "0"], ["30", "2", "12", "6", "48", "33"]],
    [["999999", "0", "0"], ["30", "0", "0", "0", "30", "0"]],
    [["0", "32", "1024"], ["30", "1", "6", "0", "36", "32"]],
    [["32", "992", "32"], ["30", "31", "186", "95", "311", "1024"]],
    [["0", "100000", "0"], ["30", "3125", "18750", "28448", "47228", "100000"]],
    [["137438953408", "32", "0"], ["30", "1", "6", "36028809887088637", "36028809887088673", "137438953440"]],
    [["64", "128", "4096"], ["30", "4", "24", "0", "54", "192"]],
    [["0", "1000000", "0"], ["30", "31250", "187500", "2001098", "2188628", "1000000"]]
  ]; return V.every(([inp, exp]) => { const r = app.sha3GasCalc(...inp);
    return r !== null && [r.baseGas, r.words, r.wordGas, r.memoryGas, r.totalGas, r.newMemBytes].join(",") === exp.join(","); }); })());
check("sha3: prefilled page values (64 bytes in fresh memory) cost exactly 48, and 42 once held",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.sha3GasCalc(g("sha3-off"), g("sha3-size"), g("sha3-mem"));
    const held = app.sha3GasCalc("0", "64", "64");
    return r !== null && r.baseGas === "30" && r.words === "2" && r.wordGas === "12" && r.memoryGas === "6" && r.totalGas === "48" &&
      held !== null && held.memoryGas === "0" && held.totalGas === "42"; })());
check("sha3 refuses malformed size and memory inputs and a non-zero region ending past the client's bound",
  app.sha3GasCalc("0", "1.5", "0") === null &&
  app.sha3GasCalc("-1", "0", "0") === null &&
  app.sha3GasCalc("0", null, "0") === null &&
  app.sha3GasCalc(null, "0", "0") === null &&
  app.sha3GasCalc("137438953440", "32", "0") === null &&
  app.sha3GasCalc("0", "0", "137438953441") === null);
check("sha3 tool section present in index.html", html.includes("sha3-btn") && html.includes("SHA3 (KECCAK256) gas calculator"));

/* COPY gas (CALLDATACOPY / CODECOPY / RETURNDATACOPY) — expected
   values produced by an independent pure-Python transcription of
   the Yellow Paper's copy-cost group (hidden_files/oracle-copy-gas.py):
   3 flat, 3 per 32-byte word rounded up, plus memory expansion over
   the DESTINATION region end with zero-size copies touching nothing;
   the three opcodes price identically. The oracle is anchored
   in-script on hand values (the prefilled 128-byte copy at 27, an
   empty copy at 3, 1 and 32 bytes at 9, 33 bytes at 15).
   Vectors are [opcode, destOff, size, curMem] -> the full result. */
check("copy controls labelled in index.html",
  ["copy-op", "copy-dest", "copy-size", "copy-mem"].every(id => html.includes(`for="${id}"`)));
check("COPY gas matches the Python oracle (prefill four-word copy, empty copy, 1 and 32 and 33 bytes, zero-size copy inert at a large offset, destination already held, partial growth, 100,000-byte payload, destination ending exactly at the client's bound, destination inside large memory, and a 1 MB payload — across all three opcodes)",
  (() => { const V = [
    [["CALLDATACOPY", "0", "128", "0"], ["CALLDATACOPY", "3", "4", "12", "12", "27", "128"]],
    [["CODECOPY", "0", "0", "0"], ["CODECOPY", "3", "0", "0", "0", "3", "0"]],
    [["RETURNDATACOPY", "0", "32", "0"], ["RETURNDATACOPY", "3", "1", "3", "3", "9", "32"]],
    [["CALLDATACOPY", "0", "1", "0"], ["CALLDATACOPY", "3", "1", "3", "3", "9", "1"]],
    [["CALLDATACOPY", "0", "33", "0"], ["CALLDATACOPY", "3", "2", "6", "6", "15", "33"]],
    [["CODECOPY", "999999", "0", "0"], ["CODECOPY", "3", "0", "0", "0", "3", "0"]],
    [["CODECOPY", "0", "32", "1024"], ["CODECOPY", "3", "1", "3", "0", "6", "32"]],
    [["CALLDATACOPY", "32", "992", "32"], ["CALLDATACOPY", "3", "31", "93", "95", "191", "1024"]],
    [["RETURNDATACOPY", "0", "100000", "0"], ["RETURNDATACOPY", "3", "3125", "9375", "28448", "37826", "100000"]],
    [["CALLDATACOPY", "137438953408", "32", "0"], ["CALLDATACOPY", "3", "1", "3", "36028809887088637", "36028809887088643", "137438953440"]],
    [["RETURNDATACOPY", "64", "128", "4096"], ["RETURNDATACOPY", "3", "4", "12", "0", "15", "192"]],
    [["CODECOPY", "0", "1000000", "0"], ["CODECOPY", "3", "31250", "93750", "2001098", "2094851", "1000000"]]
  ]; return V.every(([inp, exp]) => { const r = app.copyGasCalc(...inp);
    return r !== null && [r.opcode, r.baseGas, r.words, r.wordGas, r.memoryGas, r.totalGas, r.newMemBytes].join(",") === exp.join(","); }); })());
check("copy: prefilled page values (128 bytes in fresh memory) cost exactly 27 for every opcode",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const r = app.copyGasCalc("CALLDATACOPY", g("copy-dest"), g("copy-size"), g("copy-mem"));
    const all = ["CALLDATACOPY", "CODECOPY", "RETURNDATACOPY"].map(op => app.copyGasCalc(op, "0", "128", "0"));
    return r !== null && r.baseGas === "3" && r.words === "4" && r.wordGas === "12" && r.memoryGas === "12" && r.totalGas === "27" &&
      all.every(x => x !== null && x.totalGas === "27"); })());
check("copy refuses malformed opcode, size and memory inputs and a non-zero destination ending past the client's bound",
  app.copyGasCalc("EXTCODECOPY", "0", "0", "0") === null &&
  app.copyGasCalc("calldatacopy", "0", "0", "0") === null &&
  app.copyGasCalc(null, "0", "0", "0") === null &&
  app.copyGasCalc("CALLDATACOPY", "0", "1.5", "0") === null &&
  app.copyGasCalc("CALLDATACOPY", "-1", "0", "0") === null &&
  app.copyGasCalc("CALLDATACOPY", "0", null, "0") === null &&
  app.copyGasCalc("CALLDATACOPY", "137438953440", "32", "0") === null &&
  app.copyGasCalc("CALLDATACOPY", "0", "0", "137438953441") === null);
check("copy tool section present in index.html", html.includes("copy-btn") && html.includes("COPY gas calculator"));

/* EXTCODECOPY gas — expected values produced by an independent
   pure-Python transcription of EIP-2929 access pricing combined
   with the Yellow Paper's copy-cost group
   (hidden_files/oracle-extcodecopy-gas.py): NO flat base --
   access 2,600 cold / 100 warm, 3 per 32-byte word rounded up,
   plus memory expansion over the DESTINATION region end with
   zero-size copies touching no memory but still paying access.
   The oracle is anchored in-script on hand values (prefilled
   cold 2,624 / warm 124, empty copy at access alone, cold-warm
   difference exactly 2,500). Vectors are
   [isCold, destOff, size, curMem] -> the full result. */
check("extcodecopy controls labelled in index.html",
  ["ext-copy-access", "ext-copy-dest", "ext-copy-size", "ext-copy-mem"].every(id => html.includes(`for="${id}"`)));
check("EXTCODECOPY gas matches the Python oracle (prefill cold and warm, empty copy cold and warm, 32 bytes cold, 1 byte warm, 33 bytes cold, zero-size copy inert in memory at a large offset, destination already held warm, partial growth cold, 100,000-byte payload cold, destination ending exactly at the client's bound, destination inside large memory warm, and a 1 MB payload warm)",
  (() => { const V = [
    [[true, "0", "128", "0"], ["2600", "4", "12", "12", "2624", "128"]],
    [[false, "0", "128", "0"], ["100", "4", "12", "12", "124", "128"]],
    [[true, "0", "0", "0"], ["2600", "0", "0", "0", "2600", "0"]],
    [[false, "0", "0", "0"], ["100", "0", "0", "0", "100", "0"]],
    [[true, "0", "32", "0"], ["2600", "1", "3", "3", "2606", "32"]],
    [[false, "0", "1", "0"], ["100", "1", "3", "3", "106", "1"]],
    [[true, "0", "33", "0"], ["2600", "2", "6", "6", "2612", "33"]],
    [[true, "999999", "0", "0"], ["2600", "0", "0", "0", "2600", "0"]],
    [[false, "0", "32", "1024"], ["100", "1", "3", "0", "103", "32"]],
    [[true, "32", "992", "32"], ["2600", "31", "93", "95", "2788", "1024"]],
    [[true, "0", "100000", "0"], ["2600", "3125", "9375", "28448", "40423", "100000"]],
    [[true, "137438953408", "32", "0"], ["2600", "1", "3", "36028809887088637", "36028809887091240", "137438953440"]],
    [[false, "64", "128", "4096"], ["100", "4", "12", "0", "112", "192"]],
    [[false, "0", "1000000", "0"], ["100", "31250", "93750", "2001098", "2094948", "1000000"]]
  ]; return V.every(([inp, exp]) => { const r = app.extCodeCopyGasCalc(...inp);
    return r !== null && [r.accessGas, r.words, r.wordGas, r.memoryGas, r.totalGas, r.newMemBytes].join(",") === exp.join(","); }); })());
check("extcodecopy: prefilled page values (128 bytes in fresh memory, cold) cost exactly 2,624, warm 124, differing by exactly 2,500",
  (() => { const g = (id) => { const m = new RegExp(`id="${id}"[^>]*value="([^"]+)"`).exec(html); return m && m[1]; };
    const cold = app.extCodeCopyGasCalc(true, g("ext-copy-dest"), g("ext-copy-size"), g("ext-copy-mem"));
    const warm = app.extCodeCopyGasCalc(false, g("ext-copy-dest"), g("ext-copy-size"), g("ext-copy-mem"));
    return cold !== null && warm !== null && html.includes('id="ext-copy-access"') && html.includes('<option value="cold" selected>') &&
      cold.accessGas === "2600" && cold.words === "4" && cold.wordGas === "12" && cold.memoryGas === "12" && cold.totalGas === "2624" &&
      warm.totalGas === "124" && (BigInt(cold.totalGas) - BigInt(warm.totalGas)).toString() === "2500"; })());
check("extcodecopy refuses a non-boolean warmth flag, malformed size and memory inputs, and a non-zero destination ending past the client's bound",
  app.extCodeCopyGasCalc("cold", "0", "0", "0") === null &&
  app.extCodeCopyGasCalc(null, "0", "0", "0") === null &&
  app.extCodeCopyGasCalc(true, "0", "1.5", "0") === null &&
  app.extCodeCopyGasCalc(true, "-1", "0", "0") === null &&
  app.extCodeCopyGasCalc(true, "0", null, "0") === null &&
  app.extCodeCopyGasCalc(true, "137438953440", "32", "0") === null &&
  app.extCodeCopyGasCalc(false, "0", "0", "137438953441") === null);
check("extcodecopy tool section present in index.html", html.includes("ext-copy-btn") && html.includes("EXTCODECOPY gas calculator"));

/* Account-access gas (BALANCE / EXTCODESIZE / EXTCODEHASH) —
   expected values produced by an independent pure-Python
   transcription of EIP-2929's account-access pricing
   (hidden_files/oracle-account-access-gas.py): the access
   charge is the whole cost -- 2,600 cold / 100 warm, no other
   term. The oracle is anchored in-script on hand values
   (prefilled BALANCE cold 2,600 / warm 100, all three opcodes
   agreeing at each warmth, cold-warm difference exactly
   2,500). Vectors are [opcode, isCold] -> the full result. */
check("account access controls labelled in index.html",
  ["acct-op", "acct-access"].every(id => html.includes(`for="${id}"`)));
check("account access gas matches the Python oracle (all three opcodes, cold and warm)",
  (() => { const V = [
    [["BALANCE", true], ["BALANCE", "2600", "2600"]],
    [["BALANCE", false], ["BALANCE", "100", "100"]],
    [["EXTCODESIZE", true], ["EXTCODESIZE", "2600", "2600"]],
    [["EXTCODESIZE", false], ["EXTCODESIZE", "100", "100"]],
    [["EXTCODEHASH", true], ["EXTCODEHASH", "2600", "2600"]],
    [["EXTCODEHASH", false], ["EXTCODEHASH", "100", "100"]]
  ]; return V.every(([inp, exp]) => { const r = app.accountAccessGasCalc(...inp);
    return r !== null && [r.opcode, r.accessGas, r.totalGas].join(",") === exp.join(","); }); })());
check("account access: prefilled page values (BALANCE, cold) cost exactly 2,600, warm 100, differing by exactly 2,500, with all three opcodes agreeing at each warmth",
  (() => { const cold = app.accountAccessGasCalc("BALANCE", true);
    const warm = app.accountAccessGasCalc("BALANCE", false);
    const ops = ["BALANCE", "EXTCODESIZE", "EXTCODEHASH"];
    return cold !== null && warm !== null && html.includes('id="acct-op"') && html.includes('<option value="BALANCE" selected>') &&
      html.includes('id="acct-access"') && html.includes('<option value="cold" selected>') &&
      cold.accessGas === "2600" && cold.totalGas === "2600" && warm.totalGas === "100" &&
      (BigInt(cold.totalGas) - BigInt(warm.totalGas)).toString() === "2500" &&
      ops.every(op => app.accountAccessGasCalc(op, true).totalGas === "2600" && app.accountAccessGasCalc(op, false).totalGas === "100"); })());
check("account access refuses opcodes outside the three priced (EXTCODECOPY and the CALL family carry extra terms), a lowercase opcode, a null opcode, and a non-boolean warmth flag",
  app.accountAccessGasCalc("EXTCODECOPY", true) === null &&
  app.accountAccessGasCalc("CALL", true) === null &&
  app.accountAccessGasCalc("balance", true) === null &&
  app.accountAccessGasCalc(null, true) === null &&
  app.accountAccessGasCalc("BALANCE", "cold") === null &&
  app.accountAccessGasCalc("BALANCE", null) === null &&
  app.accountAccessGasCalc("BALANCE", 1) === null);
check("account access tool section present in index.html", html.includes("acct-btn") && html.includes("Account access gas calculator"));

/* SLOAD gas — expected values produced by an independent
   pure-Python transcription of EIP-2929's storage-read pricing
   (hidden_files/oracle-sload-gas.py): the access charge is the
   whole cost -- 2,100 cold / 100 warm, keyed by the (address,
   storage_key) pair, no other term. The oracle is anchored
   in-script on hand values (prefilled cold 2,100 / warm 100,
   cold-warm difference exactly 2,000, cold SLOAD exactly 500
   below cold account access). Vectors are [isCold] -> result. */
check("sload controls labelled in index.html",
  ["sload-access"].every(id => html.includes(`for="${id}"`)));
check("sload gas matches the Python oracle (cold and warm)",
  (() => { const V = [
    [[true], ["2100", "2100"]],
    [[false], ["100", "100"]]
  ]; return V.every(([inp, exp]) => { const r = app.sloadGasCalc(...inp);
    return r !== null && [r.accessGas, r.totalGas].join(",") === exp.join(","); }); })());
check("sload: prefilled page values (cold) cost exactly 2,100, warm 100, differing by exactly 2,000 and exactly 500 below a cold account access",
  (() => { const cold = app.sloadGasCalc(true);
    const warm = app.sloadGasCalc(false);
    return cold !== null && warm !== null && html.includes('id="sload-access"') && html.includes('<option value="cold" selected>') &&
      cold.accessGas === "2100" && cold.totalGas === "2100" && warm.totalGas === "100" &&
      (BigInt(cold.totalGas) - BigInt(warm.totalGas)).toString() === "2000" &&
      (BigInt(app.accountAccessGasCalc("BALANCE", true).totalGas) - BigInt(cold.totalGas)).toString() === "500"; })());
check("sload refuses a non-boolean warmth flag (string, null, number, undefined)",
  app.sloadGasCalc("cold") === null &&
  app.sloadGasCalc(null) === null &&
  app.sloadGasCalc(1) === null &&
  app.sloadGasCalc(0) === null &&
  app.sloadGasCalc(undefined) === null);
check("sload tool section present in index.html", html.includes("sload-btn") && html.includes("SLOAD gas calculator"));

/* Transient storage gas (TLOAD / TSTORE) — expected values
   produced by an independent pure-Python transcription of
   EIP-1153's pricing (hidden_files/oracle-transient-gas.py):
   a flat 100 for both opcodes, no cold price, no other term.
   The oracle is anchored in-script on hand values (both
   opcodes at exactly 100 and agreeing, the flat price
   equalling a warm SLOAD exactly, exactly 2,000 below a cold
   SLOAD and 2,500 below a cold account access). Vectors are
   [opcode] -> result. */
check("transient controls labelled in index.html",
  ["trans-op"].every(id => html.includes(`for="${id}"`)));
check("transient gas matches the Python oracle (TLOAD and TSTORE)",
  (() => { const V = [
    [["TLOAD"], ["TLOAD", "100", "100"]],
    [["TSTORE"], ["TSTORE", "100", "100"]]
  ]; return V.every(([inp, exp]) => { const r = app.transientGasCalc(...inp);
    return r !== null && [r.opcode, r.gas, r.totalGas].join(",") === exp.join(","); }); })());
check("transient: prefilled page values (TLOAD) cost exactly 100, TSTORE agrees, equalling a warm SLOAD and sitting exactly 2,000 below a cold SLOAD",
  (() => { const load = app.transientGasCalc("TLOAD");
    const store = app.transientGasCalc("TSTORE");
    return load !== null && store !== null && html.includes('id="trans-op"') && html.includes('<option value="TLOAD" selected>') &&
      load.gas === "100" && load.totalGas === "100" && store.totalGas === "100" &&
      load.totalGas === app.sloadGasCalc(false).totalGas &&
      (BigInt(app.sloadGasCalc(true).totalGas) - BigInt(load.totalGas)).toString() === "2000" &&
      (BigInt(app.accountAccessGasCalc("BALANCE", true).totalGas) - BigInt(store.totalGas)).toString() === "2500"; })());
check("transient refuses an unknown or malformed opcode (persistent-storage names, wrong case, null, number, undefined)",
  app.transientGasCalc("SLOAD") === null &&
  app.transientGasCalc("SSTORE") === null &&
  app.transientGasCalc("tload") === null &&
  app.transientGasCalc(null) === null &&
  app.transientGasCalc(100) === null &&
  app.transientGasCalc(undefined) === null);
check("transient tool section present in index.html", html.includes("trans-btn") && html.includes("Transient storage gas calculator"));

/* Other CALL opcodes gas (CALLCODE / DELEGATECALL / STATICCALL)
   — expected values produced by an independent pure-Python
   transcription of the CALL-family pricing (hidden_files/
   oracle-other-call-gas.py): all three share CALL's EIP-2929
   access, memory expansion and EIP-150 forwarding; CALLCODE
   keeps the 9,000 transfer and 2,300 stipend for non-zero
   value but never the 25,000 new-account charge, and
   DELEGATECALL / STATICCALL have no value terms at all. The
   oracle is anchored in-script on hand values (the prefilled
   CALLCODE split, DELEGATECALL at 95,879 forwarded,
   STATICCALL agreeing with DELEGATECALL, and CALL-to-empty
   basing exactly 25,000 above CALLCODE). Vectors are
   [opcode, available, requested, value, isCold, curMem,
   inOff, inSize, outOff, outSize] -> result fields. */
check("other-call controls labelled in index.html",
  ["ocall-op", "ocall-available", "ocall-requested", "ocall-value", "ocall-access", "ocall-mem", "ocall-in-off", "ocall-in-size", "ocall-out-off", "ocall-out-size"].every(id => html.includes(`for="${id}"`)));
check("other-call gas matches the Python oracle (CALLCODE / DELEGATECALL / STATICCALL)",
  (() => { const V = [
    [["CALLCODE", "100000", "1000000", "1000000000000000000", true, "0", "0", "0", "0", "0"], ["CALLCODE", "2600", "9000", "0", "0", "11600", "0", "false", "88400", "87019", "87019", "2300", "89319", "1381"]],
    [["DELEGATECALL", "100000", "1000000", "1000000000000000000", true, "0", "0", "0", "0", "0"], ["DELEGATECALL", "2600", "0", "0", "0", "2600", "0", "false", "97400", "95879", "95879", "0", "95879", "1521"]],
    [["STATICCALL", "100000", "1000000", "1000000000000000000", true, "0", "0", "0", "0", "0"], ["STATICCALL", "2600", "0", "0", "0", "2600", "0", "false", "97400", "95879", "95879", "0", "95879", "1521"]],
    [["CALLCODE", "100000", "1000000", "0", true, "0", "0", "0", "0", "0"], ["CALLCODE", "2600", "0", "0", "0", "2600", "0", "false", "97400", "95879", "95879", "0", "95879", "1521"]],
    [["CALLCODE", "100000", "1000000", "1000000000000000000", false, "0", "0", "0", "0", "0"], ["CALLCODE", "100", "9000", "0", "0", "9100", "0", "false", "90900", "89480", "89480", "2300", "91780", "1420"]],
    [["DELEGATECALL", "100000", "1000000", "0", false, "0", "0", "128", "0", "0"], ["DELEGATECALL", "100", "0", "0", "12", "112", "128", "false", "99888", "98328", "98328", "0", "98328", "1560"]],
    [["STATICCALL", "2000", "1000000", "0", true, "0", "0", "0", "0", "0"], ["STATICCALL", "2600", "0", "0", "0", "2600", "0", "true", "0", "0", "0", "0", "0", "0"]],
    [["CALLCODE", "100000", "5000", "1000000000000000000", true, "0", "0", "0", "0", "0"], ["CALLCODE", "2600", "9000", "0", "0", "11600", "0", "false", "88400", "87019", "5000", "2300", "7300", "83400"]]
  ]; return V.every(([inp, exp]) => { const r = app.otherCallGasCalc(...inp);
    return r !== null && [r.opcode, r.accessGas, r.transferGas, r.newAccountGas, r.memoryGas, r.baseGas, r.newMemBytes, String(r.outOfGas), r.remaining, r.capGas, r.forwardedGas, r.stipend, r.calleeGas, r.callerRetained].join(",") === exp.join(","); }); })());
check("other-call: prefilled CALLCODE split equals the CALL prefill, DELEGATECALL and STATICCALL agree with each other, and CALLCODE sits exactly 25,000 below a CALL to an empty target",
  (() => { const cc = app.otherCallGasCalc("CALLCODE", "100000", "1000000", "1000000000000000000", true, "0", "0", "0", "0", "0");
    const call = app.callGasCalc("100000", "1000000", "1000000000000000000", true, false, "0", "0", "0", "0", "0");
    const callEmpty = app.callGasCalc("100000", "1000000", "1000000000000000000", true, true, "0", "0", "0", "0", "0");
    const dc = app.otherCallGasCalc("DELEGATECALL", "100000", "1000000", "1000000000000000000", true, "0", "0", "0", "0", "0");
    const sc = app.otherCallGasCalc("STATICCALL", "100000", "1000000", "1000000000000000000", true, "0", "0", "0", "0", "0");
    return cc !== null && call !== null && callEmpty !== null && dc !== null && sc !== null &&
      html.includes('id="ocall-op"') && html.includes('<option value="CALLCODE" selected>') &&
      cc.baseGas === call.baseGas && cc.forwardedGas === call.forwardedGas && cc.calleeGas === call.calleeGas && cc.callerRetained === call.callerRetained &&
      cc.newAccountGas === "0" && callEmpty.newAccountGas === "25000" &&
      (BigInt(callEmpty.baseGas) - BigInt(cc.baseGas)).toString() === "25000" &&
      dc.baseGas === sc.baseGas && dc.forwardedGas === "95879" && dc.forwardedGas === sc.forwardedGas && dc.stipend === "0" && sc.stipend === "0"; })());
check("other-call refuses an unknown opcode, a non-boolean warmth flag, and (for CALLCODE) a malformed value, while DELEGATECALL ignores the value string entirely",
  app.otherCallGasCalc("CALL", "100000", "1000000", "0", true, "0", "0", "0", "0", "0") === null &&
  app.otherCallGasCalc("callcode", "100000", "1000000", "0", true, "0", "0", "0", "0", "0") === null &&
  app.otherCallGasCalc("CALLCODE", "100000", "1000000", "0", "cold", "0", "0", "0", "0", "0") === null &&
  app.otherCallGasCalc("CALLCODE", "100000", "1000000", "abc", true, "0", "0", "0", "0", "0") === null &&
  app.otherCallGasCalc("CALLCODE", "100000", "1000000", null, true, "0", "0", "0", "0", "0") === null &&
  app.otherCallGasCalc(null, "100000", "1000000", "0", true, "0", "0", "0", "0", "0") === null &&
  app.otherCallGasCalc("DELEGATECALL", "100000", "1000000", "not-a-value", true, "0", "0", "0", "0", "0") !== null &&
  app.otherCallGasCalc("DELEGATECALL", "100000", "1000000", "not-a-value", true, "0", "0", "0", "0", "0").transferGas === "0");
check("other-call tool section present in index.html", html.includes("ocall-btn") && html.includes("Other CALL opcodes gas calculator"));

/* SELFDESTRUCT gas — expected values produced by an independent
   pure-Python transcription of the pricing (hidden_files/
   oracle-selfdestruct-gas.py): 5,000 base, +2,600 for a cold
   beneficiary (EIP-2929, an addition to the base, not a
   2,600/100 whole cost), +25,000 only when the beneficiary is
   empty AND the transferred balance is positive, refund 0
   always (EIP-3529 removed the old 24,000). The oracle is
   anchored in-script on hand values (the prefilled 32,600,
   warm/existing 5,000, cold/existing 7,600, warm/empty 30,000,
   and a zero balance killing the new-account charge even
   against an empty beneficiary). Vectors are
   [isCold, beneficiaryEmpty, balance] -> result fields. */
check("selfdestruct controls labelled in index.html",
  ["sd-access", "sd-beneficiary", "sd-balance"].every(id => html.includes(`for="${id}"`)));
check("selfdestruct gas matches the Python oracle",
  (() => { const V = [
    [[true, true, "1000000000000000000"], ["5000", "2600", "25000", "0", "32600"]],
    [[false, false, "1000000000000000000"], ["5000", "0", "0", "0", "5000"]],
    [[true, false, "1000000000000000000"], ["5000", "2600", "0", "0", "7600"]],
    [[false, true, "1000000000000000000"], ["5000", "0", "25000", "0", "30000"]],
    [[true, true, "0"], ["5000", "2600", "0", "0", "7600"]],
    [[false, true, "0"], ["5000", "0", "0", "0", "5000"]],
    [[true, false, "0"], ["5000", "2600", "0", "0", "7600"]],
    [[false, false, "0"], ["5000", "0", "0", "0", "5000"]],
    [[true, true, "1"], ["5000", "2600", "25000", "0", "32600"]],
    [[true, true, "0xde0b6b3a7640000"], ["5000", "2600", "25000", "0", "32600"]],
    [[false, true, "123456789"], ["5000", "0", "25000", "0", "30000"]]
  ]; return V.every(([inp, exp]) => { const r = app.selfdestructGasCalc(...inp);
    return r !== null && [r.baseGas, r.accessGas, r.newAccountGas, r.refund, r.totalGas].join(",") === exp.join(","); }); })());
check("selfdestruct: cold exceeds warm by exactly 2,600, the new-account term is exactly 25,000 and needs BOTH an empty beneficiary and a positive balance, and the refund is always 0",
  (() => { const pre = app.selfdestructGasCalc(true, true, "1000000000000000000");
    const warm = app.selfdestructGasCalc(false, true, "1000000000000000000");
    const existing = app.selfdestructGasCalc(true, false, "1000000000000000000");
    const zeroBal = app.selfdestructGasCalc(true, true, "0");
    return pre !== null && warm !== null && existing !== null && zeroBal !== null &&
      html.includes('id="sd-access"') && html.includes('<option value="cold" selected>') &&
      html.includes('id="sd-beneficiary"') && html.includes('<option value="empty" selected>') &&
      pre.totalGas === "32600" &&
      (BigInt(pre.totalGas) - BigInt(warm.totalGas)).toString() === "2600" &&
      (BigInt(pre.totalGas) - BigInt(existing.totalGas)).toString() === "25000" &&
      zeroBal.newAccountGas === "0" && zeroBal.totalGas === "7600" &&
      [pre, warm, existing, zeroBal].every(r => r.refund === "0" && r.baseGas === "5000"); })());
check("selfdestruct refuses a non-boolean warmth or emptiness flag and a malformed, negative or over-uint256 balance",
  app.selfdestructGasCalc("cold", true, "0") === null &&
  app.selfdestructGasCalc(true, "empty", "0") === null &&
  app.selfdestructGasCalc(null, true, "0") === null &&
  app.selfdestructGasCalc(true, null, "0") === null &&
  app.selfdestructGasCalc(true, true, "abc") === null &&
  app.selfdestructGasCalc(true, true, "-1") === null &&
  app.selfdestructGasCalc(true, true, null) === null &&
  app.selfdestructGasCalc(true, true, (1n << 256n).toString()) === null);
check("selfdestruct tool section present in index.html", html.includes("sd-btn") && html.includes("SELFDESTRUCT gas calculator"));

/* Original precompile gas — expected values produced by an
   independent pure-Python transcription of the pricing
   (hidden_files/oracle-precompile-gas.py): ecrecover (0x01)
   flat 3,000 with no per-word term at any input length,
   SHA-256 (0x02) 60 + 12 per word, RIPEMD-160 (0x03)
   600 + 120 per word, identity (0x04) 15 + 3 per word, words
   the input length rounded UP to whole 32-byte words. The
   oracle is anchored in-script on hand values (the prefilled
   SHA-256 over 64 bytes at 84, 0 bytes paying each base alone,
   33 bytes costing exactly one more word than 32, RIPEMD-160
   at exactly 10x SHA-256's base and per-word, and ecrecover
   at 3,000 for lengths 0, 128 and 999,999). Vectors are
   [name, inputLen] -> result fields. */
check("precompile controls labelled in index.html",
  ["pc-name", "pc-len"].every(id => html.includes(`for="${id}"`)));
check("precompile gas matches the Python oracle",
  (() => { const V = [
    [["sha256", "64"], ["sha256", "0x0000000000000000000000000000000000000002", "60", "12", "2", "24", "84"]],
    [["sha256", "0"], ["sha256", "0x0000000000000000000000000000000000000002", "60", "12", "0", "0", "60"]],
    [["sha256", "1"], ["sha256", "0x0000000000000000000000000000000000000002", "60", "12", "1", "12", "72"]],
    [["sha256", "32"], ["sha256", "0x0000000000000000000000000000000000000002", "60", "12", "1", "12", "72"]],
    [["sha256", "33"], ["sha256", "0x0000000000000000000000000000000000000002", "60", "12", "2", "24", "84"]],
    [["sha256", "100"], ["sha256", "0x0000000000000000000000000000000000000002", "60", "12", "4", "48", "108"]],
    [["sha256", "1000000"], ["sha256", "0x0000000000000000000000000000000000000002", "60", "12", "31250", "375000", "375060"]],
    [["ripemd160", "0"], ["ripemd160", "0x0000000000000000000000000000000000000003", "600", "120", "0", "0", "600"]],
    [["ripemd160", "32"], ["ripemd160", "0x0000000000000000000000000000000000000003", "600", "120", "1", "120", "720"]],
    [["ripemd160", "33"], ["ripemd160", "0x0000000000000000000000000000000000000003", "600", "120", "2", "240", "840"]],
    [["ripemd160", "128"], ["ripemd160", "0x0000000000000000000000000000000000000003", "600", "120", "4", "480", "1080"]],
    [["identity", "0"], ["identity", "0x0000000000000000000000000000000000000004", "15", "3", "0", "0", "15"]],
    [["identity", "32"], ["identity", "0x0000000000000000000000000000000000000004", "15", "3", "1", "3", "18"]],
    [["identity", "33"], ["identity", "0x0000000000000000000000000000000000000004", "15", "3", "2", "6", "21"]],
    [["identity", "1024"], ["identity", "0x0000000000000000000000000000000000000004", "15", "3", "32", "96", "111"]],
    [["ecrecover", "0"], ["ecrecover", "0x0000000000000000000000000000000000000001", "3000", "0", "0", "0", "3000"]],
    [["ecrecover", "128"], ["ecrecover", "0x0000000000000000000000000000000000000001", "3000", "0", "4", "0", "3000"]],
    [["ecrecover", "999999"], ["ecrecover", "0x0000000000000000000000000000000000000001", "3000", "0", "31250", "0", "3000"]]
  ]; return V.every(([inp, exp]) => { const r = app.precompileGasCalc(...inp);
    return r !== null && [r.precompile, r.address, r.baseGas, r.perWordGas, r.words, r.wordGas, r.totalGas].join(",") === exp.join(","); }); })());
check("precompile: words round up (33 bytes pays one more word than 32), RIPEMD-160 is exactly 10x SHA-256's base and per-word, and ecrecover's price never moves with length",
  (() => { const s32 = app.precompileGasCalc("sha256", "32");
    const s33 = app.precompileGasCalc("sha256", "33");
    const r32 = app.precompileGasCalc("ripemd160", "32");
    const e0 = app.precompileGasCalc("ecrecover", "0");
    const eBig = app.precompileGasCalc("ecrecover", "999999");
    return s32 !== null && s33 !== null && r32 !== null && e0 !== null && eBig !== null &&
      html.includes('id="pc-name"') && html.includes('<option value="sha256" selected>') &&
      (BigInt(s33.totalGas) - BigInt(s32.totalGas)).toString() === "12" &&
      (BigInt(r32.baseGas) / BigInt(s32.baseGas)).toString() === "10" &&
      (BigInt(r32.perWordGas) / BigInt(s32.perWordGas)).toString() === "10" &&
      e0.totalGas === "3000" && eBig.totalGas === "3000" && eBig.wordGas === "0"; })());
check("precompile refuses an unknown or non-string precompile and a malformed, negative, hex or over-bound input length",
  app.precompileGasCalc("modexp", "64") === null &&
  app.precompileGasCalc("SHA256", "64") === null &&
  app.precompileGasCalc(null, "64") === null &&
  app.precompileGasCalc("sha256", "abc") === null &&
  app.precompileGasCalc("sha256", "-1") === null &&
  app.precompileGasCalc("sha256", "0x40") === null &&
  app.precompileGasCalc("sha256", null) === null &&
  app.precompileGasCalc("sha256", "137438953441") === null &&
  app.precompileGasCalc("sha256", "137438953440") !== null);
check("precompile tool section present in index.html", html.includes("pc-btn") && html.includes("Original precompile gas calculator"));

/* alt_bn128 precompile gas — expected values produced by an
   independent pure-Python transcription of the pricing
   (hidden_files/oracle-bn128-gas.py): ecAdd (0x06) flat 150,
   ecMul (0x07) flat 6,000, pairing (0x08) 45,000 + 34,000 per
   pair (a pair is 192 bytes of input), at the EIP-1108 prices
   current mainnet applies. The oracle is anchored in-script on
   hand values (the prefilled 2-pair check at 113,000, 0 pairs
   paying the 45,000 base alone, 1 pair at 79,000, ecMul at
   exactly 40x ecAdd, and each extra pair adding exactly
   34,000). Vectors are [name, pairs] -> result fields; the
   pair count is never read for ecAdd/ecMul. */
check("bn128 controls labelled in index.html",
  ["bn-name", "bn-pairs"].every(id => html.includes(`for="${id}"`)));
check("bn128 gas matches the Python oracle",
  (() => { const V = [
    [["pairing", "2"], ["pairing", "0x0000000000000000000000000000000000000008", "45000", "34000", "2", "68000", "384", "113000"]],
    [["pairing", "0"], ["pairing", "0x0000000000000000000000000000000000000008", "45000", "34000", "0", "0", "0", "45000"]],
    [["pairing", "1"], ["pairing", "0x0000000000000000000000000000000000000008", "45000", "34000", "1", "34000", "192", "79000"]],
    [["pairing", "3"], ["pairing", "0x0000000000000000000000000000000000000008", "45000", "34000", "3", "102000", "576", "147000"]],
    [["pairing", "4"], ["pairing", "0x0000000000000000000000000000000000000008", "45000", "34000", "4", "136000", "768", "181000"]],
    [["pairing", "10"], ["pairing", "0x0000000000000000000000000000000000000008", "45000", "34000", "10", "340000", "1920", "385000"]],
    [["pairing", "100"], ["pairing", "0x0000000000000000000000000000000000000008", "45000", "34000", "100", "3400000", "19200", "3445000"]],
    [["ecadd", "2"], ["ecadd", "0x0000000000000000000000000000000000000006", "150", "0", "0", "0", "128", "150"]],
    [["ecmul", "2"], ["ecmul", "0x0000000000000000000000000000000000000007", "6000", "0", "0", "0", "96", "6000"]]
  ]; return V.every(([inp, exp]) => { const r = app.bn128GasCalc(...inp);
    return r !== null && [r.precompile, r.address, r.baseGas, r.perPairGas, r.pairs, r.pairGas, r.inputBytes, r.totalGas].join(",") === exp.join(","); }); })());
check("bn128: each extra pair adds exactly 34,000, ecMul is exactly 40x ecAdd, and the flat two never read the pair count",
  (() => { const p2 = app.bn128GasCalc("pairing", "2");
    const p3 = app.bn128GasCalc("pairing", "3");
    const add = app.bn128GasCalc("ecadd", "abc");
    const mul = app.bn128GasCalc("ecmul", null);
    return p2 !== null && p3 !== null && add !== null && mul !== null &&
      html.includes('id="bn-name"') && html.includes('<option value="pairing" selected>') &&
      (BigInt(p3.totalGas) - BigInt(p2.totalGas)).toString() === "34000" &&
      (BigInt(mul.totalGas) / BigInt(add.totalGas)).toString() === "40" &&
      add.totalGas === "150" && mul.totalGas === "6000"; })());
check("bn128 refuses an unknown or non-string precompile and a malformed, negative, hex or over-bound pair count",
  app.bn128GasCalc("blake2f", "2") === null &&
  app.bn128GasCalc("PAIRING", "2") === null &&
  app.bn128GasCalc(null, "2") === null &&
  app.bn128GasCalc("pairing", "abc") === null &&
  app.bn128GasCalc("pairing", "-1") === null &&
  app.bn128GasCalc("pairing", "0x2") === null &&
  app.bn128GasCalc("pairing", null) === null &&
  app.bn128GasCalc("pairing", "715827883") === null &&
  app.bn128GasCalc("pairing", "715827882") !== null);
check("bn128 tool section present in index.html", html.includes("bn-btn") && html.includes("alt_bn128 precompile gas calculator"));

/* BLAKE2f precompile gas — expected values produced by an
   independent pure-Python transcription of the pricing
   (hidden_files/oracle-blake2f-gas.py): BLAKE2f (0x09) charges
   the rounds value itself, 1 gas per round with no other term,
   over a fixed 213-byte input whose first 4 bytes are the
   big-endian uint32 rounds count, at the EIP-152 price current
   mainnet applies. The oracle is anchored in-script on hand
   values (the prefilled 12 rounds at 12, 0 rounds at 0, 1 round
   at 1, each extra round adding exactly 1, and the uint32
   maximum at 4,294,967,295). Vectors are [rounds] -> fields. */
check("blake2f controls labelled in index.html",
  ["b2-rounds"].every(id => html.includes(`for="${id}"`)));
check("blake2f gas matches the Python oracle",
  (() => { const V = [
    [["12"], ["blake2f", "0x0000000000000000000000000000000000000009", "12", "1", "213", "12"]],
    [["0"], ["blake2f", "0x0000000000000000000000000000000000000009", "0", "1", "213", "0"]],
    [["1"], ["blake2f", "0x0000000000000000000000000000000000000009", "1", "1", "213", "1"]],
    [["2"], ["blake2f", "0x0000000000000000000000000000000000000009", "2", "1", "213", "2"]],
    [["10"], ["blake2f", "0x0000000000000000000000000000000000000009", "10", "1", "213", "10"]],
    [["100"], ["blake2f", "0x0000000000000000000000000000000000000009", "100", "1", "213", "100"]],
    [["1000000"], ["blake2f", "0x0000000000000000000000000000000000000009", "1000000", "1", "213", "1000000"]],
    [["4294967295"], ["blake2f", "0x0000000000000000000000000000000000000009", "4294967295", "1", "213", "4294967295"]]
  ]; return V.every(([inp, exp]) => { const r = app.blake2fGasCalc(...inp);
    return r !== null && [r.precompile, r.address, r.rounds, r.perRoundGas, r.inputBytes, r.totalGas].join(",") === exp.join(","); }); })());
check("blake2f: each extra round adds exactly 1 and the total equals the rounds count",
  (() => { const r12 = app.blake2fGasCalc("12");
    const r13 = app.blake2fGasCalc("13");
    return r12 !== null && r13 !== null &&
      html.includes('id="b2-rounds"') && html.includes('value="12"') &&
      (BigInt(r13.totalGas) - BigInt(r12.totalGas)).toString() === "1" &&
      r12.totalGas === r12.rounds && r13.totalGas === r13.rounds; })());
check("blake2f refuses a malformed, negative, hex, non-string or over-uint32 rounds count",
  app.blake2fGasCalc("abc") === null &&
  app.blake2fGasCalc("-1") === null &&
  app.blake2fGasCalc("0x12") === null &&
  app.blake2fGasCalc("1.5") === null &&
  app.blake2fGasCalc("") === null &&
  app.blake2fGasCalc(null) === null &&
  app.blake2fGasCalc(12) === null &&
  app.blake2fGasCalc("4294967296") === null &&
  app.blake2fGasCalc("4294967295") !== null);
check("blake2f tool section present in index.html", html.includes("b2-btn") && html.includes("BLAKE2f precompile gas calculator"));

/* KZG point evaluation precompile gas — expected values produced
   by an independent pure-Python transcription of the pricing
   (hidden_files/oracle-kzg-gas.py): the precompile at 0x0a
   (EIP-4844) charges a flat 50,000 over a fixed 192-byte input
   (versioned hash 32 + z 32 + y 32 + commitment 48 + proof 48),
   returning 64 bytes (4096 field elements per blob and the BLS
   modulus). The oracle is anchored in-script on hand values
   (the one valid length at 50,000, 0/191/193 bytes refused, the
   flat price 5,000 above the pairing check's 45,000 base).
   Vectors are [input length] -> result fields; 192 is the only
   length with a price, because any other length fails the
   precompile's own length check. */
check("kzg controls labelled in index.html",
  ["kzg-len"].every(id => html.includes(`for="${id}"`)));
check("kzg gas matches the Python oracle",
  (() => { const V = [
    [["192"], ["kzg-point-evaluation", "0x000000000000000000000000000000000000000a", "192", "64", "4096", "50000"]]
  ]; return V.every(([inp, exp]) => { const r = app.kzgGasCalc(...inp);
    return r !== null && [r.precompile, r.address, r.inputBytes, r.outputBytes, r.fieldElementsPerBlob, r.totalGas].join(",") === exp.join(","); }); })());
check("kzg: the flat 50,000 sits exactly 5,000 above the pairing base and the prefill is 192",
  (() => { const r = app.kzgGasCalc("192");
    const pairing = app.bn128GasCalc("pairing", "0");
    return r !== null && pairing !== null &&
      html.includes('id="kzg-len"') && html.includes('value="192"') &&
      (BigInt(r.totalGas) - BigInt(pairing.totalGas)).toString() === "5000" &&
      r.totalGas === "50000"; })());
check("kzg refuses a malformed, negative, hex, non-string or wrong-length input",
  app.kzgGasCalc("abc") === null &&
  app.kzgGasCalc("-1") === null &&
  app.kzgGasCalc("0xc0") === null &&
  app.kzgGasCalc("1.5") === null &&
  app.kzgGasCalc("") === null &&
  app.kzgGasCalc(null) === null &&
  app.kzgGasCalc(192) === null &&
  app.kzgGasCalc("0") === null &&
  app.kzgGasCalc("191") === null &&
  app.kzgGasCalc("193") === null &&
  app.kzgGasCalc("213") === null &&
  app.kzgGasCalc("137438953441") === null &&
  app.kzgGasCalc("192") !== null);
check("kzg tool section present in index.html", html.includes("kzg-btn") && html.includes("KZG point evaluation precompile gas calculator"));

/* BLS12-381 precompile gas — expected values produced by an
   independent pure-Python transcription of the pricing
   (hidden_files/oracle-bls-gas.py): the seven precompiles at
   0x0b-0x11 (EIP-2537, live since Prague/Electra). Four are
   flat (G1ADD 375, G2ADD 600, MAP_FP_TO_G1 5500,
   MAP_FP2_TO_G2 23800); the pairing check is 37700 + 32600
   per 384-byte pair; the MSMs are floor(k * mulCost *
   discount(k) / 1000) with mulCost 12000 (G1) / 22500 (G2)
   and the EIP's discount tables (cap 519 / 524 past k = 128).
   The oracle is anchored in-script on hand values (the
   prefilled G1MSM over 2 pairs at 22,776, k = 1 at exactly
   the single-multiplication cost, G2MSM at k = 3 flooring
   62,302.5 to 62,302, the pairing pair at 70,300, empty
   counts refused). Vectors are [name, count] -> result
   fields; the count is ignored for the flat operations. */
check("bls controls labelled in index.html",
  ["bls-name", "bls-pairs"].every(id => html.includes(`for="${id}"`)));
check("bls gas matches the Python oracle",
  (() => { const V = [
    [["g1add", ""], ["g1add", "0x000000000000000000000000000000000000000b", "375", "0", "0", "0", "0", "256", "375"]],
    [["g2add", ""], ["g2add", "0x000000000000000000000000000000000000000d", "600", "0", "0", "0", "0", "512", "600"]],
    [["map-fp-to-g1", ""], ["map-fp-to-g1", "0x0000000000000000000000000000000000000010", "5500", "0", "0", "0", "0", "64", "5500"]],
    [["map-fp2-to-g2", ""], ["map-fp2-to-g2", "0x0000000000000000000000000000000000000011", "23800", "0", "0", "0", "0", "128", "23800"]],
    [["g1msm", "1"], ["g1msm", "0x000000000000000000000000000000000000000c", "0", "12000", "1", "12000", "1000", "160", "12000"]],
    [["g1msm", "2"], ["g1msm", "0x000000000000000000000000000000000000000c", "0", "12000", "2", "22776", "949", "320", "22776"]],
    [["g1msm", "128"], ["g1msm", "0x000000000000000000000000000000000000000c", "0", "12000", "128", "797184", "519", "20480", "797184"]],
    [["g1msm", "129"], ["g1msm", "0x000000000000000000000000000000000000000c", "0", "12000", "129", "803412", "519", "20640", "803412"]],
    [["g2msm", "1"], ["g2msm", "0x000000000000000000000000000000000000000e", "0", "22500", "1", "22500", "1000", "288", "22500"]],
    [["g2msm", "2"], ["g2msm", "0x000000000000000000000000000000000000000e", "0", "22500", "2", "45000", "1000", "576", "45000"]],
    [["g2msm", "3"], ["g2msm", "0x000000000000000000000000000000000000000e", "0", "22500", "3", "62302", "923", "864", "62302"]],
    [["pairing", "1"], ["pairing", "0x000000000000000000000000000000000000000f", "37700", "32600", "1", "32600", "0", "384", "70300"]],
    [["pairing", "2"], ["pairing", "0x000000000000000000000000000000000000000f", "37700", "32600", "2", "65200", "0", "768", "102900"]]
  ]; return V.every(([inp, exp]) => { const r = app.blsGasCalc(...inp);
    return r !== null && [r.precompile, r.address, r.baseGas, r.perPairGas, r.pairs, r.pairGas, r.discount, r.inputBytes, r.totalGas].join(",") === exp.join(","); }); })());
check("bls: the prefill is g1msm over 2 pairs at 22,776 and one G1MSM pair is exactly one multiplication",
  (() => { const r = app.blsGasCalc("g1msm", "2");
    const one = app.blsGasCalc("g1msm", "1");
    return r !== null && one !== null &&
      html.includes('id="bls-pairs"') && html.includes('value="2"') &&
      html.includes('<option value="g1msm" selected>') &&
      r.totalGas === "22776" && one.totalGas === "12000" &&
      (BigInt(one.totalGas) * 2n - BigInt(r.totalGas)).toString() === "1224"; })());
check("bls refuses a malformed, empty, zero-count or over-bound input",
  app.blsGasCalc("bogus", "2") === null &&
  app.blsGasCalc("g1msm", "abc") === null &&
  app.blsGasCalc("g1msm", "-1") === null &&
  app.blsGasCalc("g1msm", "0x2") === null &&
  app.blsGasCalc("g1msm", "") === null &&
  app.blsGasCalc("g1msm", null) === null &&
  app.blsGasCalc(null, "2") === null &&
  app.blsGasCalc("g1msm", 2) === null &&
  app.blsGasCalc("g1msm", "0") === null &&
  app.blsGasCalc("g2msm", "0") === null &&
  app.blsGasCalc("pairing", "0") === null &&
  app.blsGasCalc("g1msm", "858993460") === null &&
  app.blsGasCalc("g1msm", "858993459") !== null &&
  app.blsGasCalc("g2msm", "477218589") === null &&
  app.blsGasCalc("pairing", "357913942") === null &&
  app.blsGasCalc("g1add", "not-a-count") !== null);
check("bls tool section present in index.html", html.includes("bls-btn") && html.includes("BLS12-381 precompile gas calculator"));

/* secp256r1 precompile gas — expected values produced by an
   independent pure-Python transcription of the pricing
   (hidden_files/oracle-p256-gas.py): P256VERIFY at 0x0100
   (EIP-7951, Final, live since the Fulu/Osaka upgrade —
   EIP-7607 lists it as a core EIP, mainnet epoch 411392)
   charges a flat 6,900 over a defined 160-byte input (five
   32-byte fields: hash, r, s, qx, qy). The precompile never
   reverts: a wrong length or a failed verification returns
   empty and burns the same 6,900, so every length has this
   price and only exactly 160 can succeed. The oracle is
   anchored in-script on hand values (6,900 at each of the
   lengths a client probe exercised — 0, 1, 159, 160, 161,
   320, 1024 — the price exactly double RIP-7212's 3,450 and
   exactly 3,900 above ecrecover's 3,000, 160 = 5 x 32).
   Vectors are [input length] -> result fields. */
check("p256 controls labelled in index.html",
  ["p256-len"].every(id => html.includes(`for="${id}"`)));
check("p256 gas matches the Python oracle",
  (() => { const V = [
    [["0"], ["p256verify", "0x0000000000000000000000000000000000000100", "0", "160", "no", "0", "6900"]],
    [["1"], ["p256verify", "0x0000000000000000000000000000000000000100", "1", "160", "no", "0", "6900"]],
    [["32"], ["p256verify", "0x0000000000000000000000000000000000000100", "32", "160", "no", "0", "6900"]],
    [["159"], ["p256verify", "0x0000000000000000000000000000000000000100", "159", "160", "no", "0", "6900"]],
    [["160"], ["p256verify", "0x0000000000000000000000000000000000000100", "160", "160", "yes", "32", "6900"]],
    [["161"], ["p256verify", "0x0000000000000000000000000000000000000100", "161", "160", "no", "0", "6900"]],
    [["192"], ["p256verify", "0x0000000000000000000000000000000000000100", "192", "160", "no", "0", "6900"]],
    [["320"], ["p256verify", "0x0000000000000000000000000000000000000100", "320", "160", "no", "0", "6900"]],
    [["1024"], ["p256verify", "0x0000000000000000000000000000000000000100", "1024", "160", "no", "0", "6900"]]
  ]; return V.every(([inp, exp]) => { const r = app.p256GasCalc(...inp);
    return r !== null && [r.precompile, r.address, r.inputBytes, r.requiredInputBytes, r.exactLength, r.outputBytesOnSuccess, r.totalGas].join(",") === exp.join(","); }); })());
check("p256: the prefill is 160 at 6,900, exactly double the RIP-7212 price and 3,900 above ecrecover",
  (() => { const r = app.p256GasCalc("160");
    const ec = app.precompileGasCalc("ecrecover", "128");
    return r !== null && ec !== null &&
      html.includes('id="p256-len"') && html.includes('value="160"') &&
      (BigInt(r.totalGas) / 2n).toString() === "3450" &&
      (BigInt(r.totalGas) - BigInt(ec.totalGas)).toString() === "3900" &&
      r.totalGas === "6900"; })());
check("p256 refuses only a malformed, negative, hex, non-string or over-bound length — never a wrong length",
  app.p256GasCalc("abc") === null &&
  app.p256GasCalc("-1") === null &&
  app.p256GasCalc("0xa0") === null &&
  app.p256GasCalc("1.5") === null &&
  app.p256GasCalc("") === null &&
  app.p256GasCalc(null) === null &&
  app.p256GasCalc(160) === null &&
  app.p256GasCalc("137438953441") === null &&
  app.p256GasCalc("0") !== null &&
  app.p256GasCalc("159") !== null &&
  app.p256GasCalc("161") !== null &&
  app.p256GasCalc("160") !== null);
check("p256 tool section present in index.html", html.includes("p256-btn") && html.includes("secp256r1 precompile gas calculator"));

/* CLZ opcode — expected values produced by an independent
   pure-Python transcription of the semantics
   (hidden_files/oracle-clz.py): CLZ at 0x1e (EIP-7939,
   Final, live since the Fulu/Osaka upgrade — EIP-7607
   lists it as a core EIP, mainnet epoch 411392) pops one
   256-bit word and pushes its count of leading zero bits,
   with zero defined as 256; the charge is a flat 5, the
   MUL tier. The oracle is anchored in-script on hand
   values (the EIP's own published test cases — 0 at 256,
   0x8000...00 and 0xffff...ff at 0, 0x4000...00 and
   0x7fff...ff at 1, 1 at 255 — plus 255 at 248, 256 at
   247, 10^18 at 196 and every sampled power of two at
   255 - k). Vectors are [input] -> result fields. */
check("clz controls labelled in index.html",
  ["clz-value"].every(id => html.includes(`for="${id}"`)));
check("clz matches the Python oracle",
  (() => { const V = [
    [["0"], ["clz", "0x1e", "0", "0x0000000000000000000000000000000000000000000000000000000000000000", "256", "0", "none", "5"]],
    [["1"], ["clz", "0x1e", "1", "0x0000000000000000000000000000000000000000000000000000000000000001", "255", "1", "0", "5"]],
    [["255"], ["clz", "0x1e", "255", "0x00000000000000000000000000000000000000000000000000000000000000ff", "248", "8", "7", "5"]],
    [["256"], ["clz", "0x1e", "256", "0x0000000000000000000000000000000000000000000000000000000000000100", "247", "9", "8", "5"]],
    [["1000000000000000000"], ["clz", "0x1e", "1000000000000000000", "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000", "196", "60", "59", "5"]],
    [["0xff"], ["clz", "0x1e", "255", "0x00000000000000000000000000000000000000000000000000000000000000ff", "248", "8", "7", "5"]],
    [["0x8000000000000000000000000000000000000000000000000000000000000000"], ["clz", "0x1e", "57896044618658097711785492504343953926634992332820282019728792003956564819968", "0x8000000000000000000000000000000000000000000000000000000000000000", "0", "256", "255", "5"]],
    [["0x4000000000000000000000000000000000000000000000000000000000000000"], ["clz", "0x1e", "28948022309329048855892746252171976963317496166410141009864396001978282409984", "0x4000000000000000000000000000000000000000000000000000000000000000", "1", "255", "254", "5"]],
    [["0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"], ["clz", "0x1e", "57896044618658097711785492504343953926634992332820282019728792003956564819967", "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", "1", "255", "254", "5"]],
    [["0x0000000000000000000000000000000000000000000000000000000000000001"], ["clz", "0x1e", "1", "0x0000000000000000000000000000000000000000000000000000000000000001", "255", "1", "0", "5"]],
    [["115792089237316195423570985008687907853269984665640564039457584007913129639935"], ["clz", "0x1e", "115792089237316195423570985008687907853269984665640564039457584007913129639935", "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", "0", "256", "255", "5"]],
    [["0x00000000000000000000000000000000000000000000000000000000000000ff"], ["clz", "0x1e", "255", "0x00000000000000000000000000000000000000000000000000000000000000ff", "248", "8", "7", "5"]]
  ]; return V.every(([inp, exp]) => { const r = app.clzCalc(...inp);
    return r !== null && [r.opcode, r.opcodeByte, r.value, r.valueHex, r.leadingZeros, r.bitLength, r.highestSetBit, r.totalGas].join(",") === exp.join(","); }); })());
check("clz: the prefill is 10^18 at 196 with bit length 60, zero is the 256 special case, and each power of two drops the count by exactly 1",
  (() => { const r = app.clzCalc("1000000000000000000");
    const z = app.clzCalc("0");
    return r !== null && z !== null &&
      html.includes('id="clz-value"') && html.includes('value="1000000000000000000"') &&
      r.leadingZeros === "196" && r.bitLength === "60" && r.highestSetBit === "59" &&
      z.leadingZeros === "256" && z.bitLength === "0" && z.highestSetBit === "none" &&
      [0, 1, 7, 8, 59, 128, 254, 255].every(k =>
        app.clzCalc((1n << BigInt(k)).toString()).leadingZeros === String(255 - k)) &&
      r.totalGas === "5" && z.totalGas === "5"; })());
check("clz: decimal and hex forms of the same word agree, and surrounding spaces are trimmed",
  app.clzCalc("255").valueHex === app.clzCalc("0xff").valueHex &&
  app.clzCalc("  0XFF  ").leadingZeros === "248" &&
  app.clzCalc("0").leadingZeros === "256");
check("clz refuses a malformed, negative, fractional, empty, non-string or over-256-bit word",
  app.clzCalc("abc") === null &&
  app.clzCalc("-1") === null &&
  app.clzCalc("1.5") === null &&
  app.clzCalc("") === null &&
  app.clzCalc("0x") === null &&
  app.clzCalc("0xzz") === null &&
  app.clzCalc(null) === null &&
  app.clzCalc(255) === null &&
  app.clzCalc("115792089237316195423570985008687907853269984665640564039457584007913129639936") === null &&
  app.clzCalc("0x10000000000000000000000000000000000000000000000000000000000000000") === null &&
  app.clzCalc("115792089237316195423570985008687907853269984665640564039457584007913129639935") !== null);
check("clz tool section present in index.html", html.includes("clz-btn") && html.includes("CLZ opcode calculator"));

console.log(`\n${total - failures}/${total} checks passed`);
process.exit(failures ? 1 : 0);
