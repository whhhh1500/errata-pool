#!/usr/bin/env node
// ErrataPool CLI for GenLayer Studio (studionet).
//
// Key handling: the signer is built in-process and never printed or written.
//   GENLAYER_PRIVATE_KEY=0x...            use a raw key, or
//   MNEMONIC_FILE=/path HD_INDEX=0         derive m/44'/60'/0'/0/<HD_INDEX> from a mnemonic file
// Public results (contract address, tx hashes) go to deployments/studionet.json.
//
// usage: node scripts/errata.mjs <cmd> [...args]
//   fund [address] [gen]                         free Studio faucet (sim_fundAccount)
//   deploy
//   pool <name> <template-with-{id}> <rules> <reward GEN> <min stake GEN> <window secs> <funding GEN>
//   report <pool> <item> <kind> <choice|-> <stake GEN> <fix> <justification> [evidence url]
//   adjudicate <report> | settle <report> | withdraw <report>
//   appeal <report> <reason>
//   fund-pool <pool> <GEN> | close <pool>
//   show <report> | pools | reports [pool] | errata <pool> | stats | solvency | balance [address]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { mnemonicToAccount } from "viem/accounts";
import { toHex } from "viem";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "deployments", "studionet.json");
const RPC = process.env.GENLAYER_RPC || "https://studio.genlayer.com/api";
const GEN = 10n ** 18n;
const gen = (x) => (BigInt(Math.round(Number(x) * 1e6)) * GEN) / 1000000n;

function signer() {
  if (process.env.GENLAYER_PRIVATE_KEY) return createAccount(process.env.GENLAYER_PRIVATE_KEY);
  if (process.env.MNEMONIC_FILE) {
    const phrase = readFileSync(process.env.MNEMONIC_FILE, "utf8").trim().split(/\s+/).join(" ");
    const hd = mnemonicToAccount(phrase, { addressIndex: Number(process.env.HD_INDEX || 0) });
    return createAccount(toHex(hd.getHdKey().privateKey));
  }
  return null;
}

const state = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { network: "studionet", txs: [] };
const save = () => writeFileSync(OUT, JSON.stringify(state, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
const account = signer();
const client = createClient({ chain: studionet, ...(account ? { account } : {}) });
const addr = () => process.env.ERRATA_ADDRESS || state.contract;
const j = (v) => JSON.stringify(v, (k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Map ? Object.fromEntries(x) : x), 2);

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "errata-pool-cli/0.1" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await r.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function wait(hash, label) {
  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, retries: 300, interval: 4000 });
  const lr = receipt?.consensus_data?.leader_receipt?.[0] ?? receipt?.consensus_data?.leader_receipt;
  const execution = lr?.execution_result ?? "?";
  const status = receipt.statusName || receipt.status;
  const payload = lr?.result?.payload;
  console.log(`${label}: ${hash}\n  status=${status} execution=${execution} result=${typeof payload === "string" ? payload : JSON.stringify(payload ?? null)}`);
  state.txs.push({ label, hash, status: String(status), execution, at: new Date().toISOString() });
  save();
  return receipt;
}

async function write(functionName, args, value = 0n, tag = "") {
  if (!account) throw new Error("set GENLAYER_PRIVATE_KEY or MNEMONIC_FILE");
  const label = tag || `${functionName}(${args.map((x) => (typeof x === "string" ? x.slice(0, 40) : typeof x === "bigint" ? x.toString() : JSON.stringify(x))).join(", ")})`;
  const hash = await client.writeContract({ address: addr(), functionName, args, value });
  console.log("sent", hash);
  return wait(hash, label);
}

const read = (functionName, args = []) => client.readContract({ address: addr(), functionName, args });

const [cmd, ...a] = process.argv.slice(2);
if (account) console.log("signer", account.address);
switch (cmd) {
  case "fund": {
    const who = a[0] || account.address;
    console.log("sim_fundAccount", who, await rpc("sim_fundAccount", [who, Number(BigInt(a[1] || 100) * GEN)]));
    console.log("balance", await rpc("eth_getBalance", [who, "latest"]));
    break;
  }
  case "deploy": {
    const code = readFileSync(path.join(ROOT, "contracts", "errata_pool.py"), "utf8");
    const hash = await client.deployContract({ code, args: [], leaderOnly: false });
    const receipt = await wait(hash, "deploy");
    state.contract = receipt?.data?.contract_address || receipt?.txDataDecoded?.contractAddress || receipt?.recipient;
    state.deployer = account.address;
    state.deployTx = hash;
    save();
    console.log("contract", state.contract);
    break;
  }
  case "pool": {
    const [name, template, rules, reward, stake, secs, funding] = a;
    await write("create_pool", [name, template, rules, gen(reward), gen(stake), BigInt(secs)], gen(funding), `create_pool "${name}"`);
    console.log(j(await read("list_pools")));
    break;
  }
  case "report": {
    const [pool, item, kind, choice, stake, fix, why, ev] = a;
    await write("file_report", [BigInt(pool), item, kind, choice === "-" ? "" : choice, fix, why, ev || ""], gen(stake), `file_report pool ${pool} item ${item} (${kind} ${choice})`);
    console.log(j(await read("get_stats")));
    break;
  }
  case "adjudicate": await write("adjudicate", [BigInt(a[0])], 0n, `adjudicate #${a[0]}`); console.log(j(await read("get_report", [BigInt(a[0])]))); break;
  case "appeal": await write("appeal", [BigInt(a[0]), a[1] || ""], 0n, `appeal #${a[0]}`); console.log(j(await read("get_report", [BigInt(a[0])]))); break;
  case "settle": await write("settle", [BigInt(a[0])], 0n, `settle #${a[0]}`); console.log(j(await read("get_report", [BigInt(a[0])]))); break;
  case "withdraw": await write("withdraw_report", [BigInt(a[0])], 0n, `withdraw_report #${a[0]}`); break;
  case "fund-pool": await write("fund_pool", [BigInt(a[0])], gen(a[1]), `fund_pool #${a[0]}`); break;
  case "close": await write("close_pool", [BigInt(a[0])], 0n, `close_pool #${a[0]}`); break;
  case "show": console.log(j(await read("get_report", [BigInt(a[0])]))); break;
  case "pools": console.log(j(await read("list_pools"))); break;
  case "reports": console.log(j(await read("list_reports", [BigInt(a[0] ?? -1)]))); break;
  case "errata": console.log(j(await read("get_errata", [BigInt(a[0])]))); break;
  case "stats": console.log(j(await read("get_stats"))); break;
  case "solvency": {
    const l = await read("get_liabilities");
    const owed = BigInt(l instanceof Map ? l.get("total") : l.total);
    const held = BigInt(await rpc("eth_getBalance", [addr(), "latest"]));
    console.log(j({ held: held.toString(), owed: owed.toString(), surplus: (held - owed).toString(), solvent: held >= owed }));
    break;
  }
  case "balance": console.log(await rpc("eth_getBalance", [a[0] || account.address, "latest"])); break;
  default:
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).join("\n"));
}
