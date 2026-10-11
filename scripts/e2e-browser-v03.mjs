// v0.3 browser end-to-end run of the final-settlement confirmation against the live Studio contract.
// 1. the owner key opens a public demo pool (window 0) from Node;
// 2. the web app (demo burner account) files two reports and adjudicates them through the dialog;
// 3. settle #1: the dialog's Sign button stays disabled until "SETTLE <id>" is typed AND the
//    acknowledgement is ticked; while the dialog is open the owner settles the same report from
//    another client; confirming must then send NOTHING ("on-chain state changed");
// 4. settle #2 goes through the full dialog; 5. Claim withdraws the burner's credit.
// usage: npm run build && npx vite preview frontend --port 4173 &
//        MNEMONIC_FILE=... HD_INDEX=0 node scripts/e2e-browser-v03.mjs
import { readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { mnemonicToAccount } from "viem/accounts";
import { toHex } from "viem";

const state = JSON.parse(readFileSync(new URL("../deployments/studionet.json", import.meta.url), "utf8"));
const CONTRACT = state.contract;
const GEN = 10n ** 18n;
const phrase = readFileSync(process.env.MNEMONIC_FILE, "utf8").trim().split(/\s+/).join(" ");
const owner = createClient({ chain: studionet, account: createAccount(toHex(mnemonicToAccount(phrase, { addressIndex: Number(process.env.HD_INDEX || 0) }).getHdKey().privateKey)) });
const plain = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [k, plain(x)])) : v);
const read = async (fn, args = []) => plain(await owner.readContract({ address: CONTRACT, functionName: fn, args }));
const out = [];
const say = (s) => { console.log(s); out.push(s); };
async function ownerWrite(label, functionName, args, value = 0n) {
  const hash = await owner.writeContract({ address: CONTRACT, functionName, args, value });
  const rc = await owner.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, retries: 300, interval: 4000 });
  const lr = rc?.consensus_data?.leader_receipt?.[0] ?? rc?.consensus_data?.leader_receipt;
  say(`owner ${label}: ${lr?.execution_result} ${hash}`);
  state.txs.push({ label: `[v0.3 browser e2e] owner ${label}`, hash, status: String(rc.statusName || rc.status), execution: lr?.execution_result, at: new Date().toISOString() });
  return hash;
}

const pid = Number((await read("get_stats")).pools);
await ownerWrite(`create_pool #${pid} "MMLU · virology (test split) · v0.3 demo"`, "create_pool",
  ["MMLU · virology (test split) · v0.3 demo", "https://datasets-server.huggingface.co/rows?dataset=cais%2Fmmlu&config=virology&split=test&offset={id}&length=1",
    "Item id = 0-based row index in the test split. Report items whose key is wrong, ambiguous or flawed.", GEN, GEN / 5n, 0n, 259200n], 8n * GEN);

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--window-size=1300,2400"] });
const page = await browser.newPage();
await page.setViewport({ width: 1300, height: 2400 });
page.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
await page.goto((process.env.APP_URL || "http://localhost:4173/errata-pool/") + `?pool=${pid}`, { waitUntil: "networkidle0" });
const logText = async () => page.$$eval("#log li", (ls) => ls.map((l) => l.textContent));
const waitLog = async (re, ms = 400000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const hit = (await logText()).find((x) => re.test(x)); if (hit) return hit; await new Promise((r) => setTimeout(r, 3000)); }
  throw new Error("timeout " + re);
};
const okDisabled = () => page.$eval("#c-ok", (b) => b.disabled);
const clickReportButton = (prefix) => page.evaluate((p) => [...document.querySelectorAll("#report button")].find((b) => b.textContent.startsWith(p))?.click(), prefix);
async function accept() {
  await page.waitForFunction(() => !document.body.classList.contains("busy"), { timeout: 120000 }).catch(() => {});
  try { await page.waitForSelector("dialog#confirm[open]", { timeout: 60000 }); }
  catch (e) { await page.screenshot({ path: "/tmp/errata-e2e-fail.png" }); throw new Error("no confirmation dialog; app log: " + JSON.stringify((await logText()).slice(0, 6))); }
  await page.click("#c-ok");
}

await page.click("#acct button.primary");
await page.waitForFunction(() => document.querySelector("#acct .pill"), { timeout: 60000 });
say(`burner: ${await page.$eval("#acct", (e) => e.textContent)}`);

async function fileAndJudge(item, choice, why) {
  await page.$eval("#f-item", (e, v) => (e.value = v), item);
  await page.$eval("#f-choice", (e, v) => (e.value = v), choice);
  await page.$eval("#f-fix", (e, v) => (e.value = v), `Answer key should be ${choice}`);
  await page.$eval("#f-why", (e, v) => (e.value = v), why);
  await page.$eval("#f-ev", (e) => (e.value = ""));
  await page.$eval("#f-stake", (e) => (e.value = "0.5"));
  // Studio's gateway sometimes answers without CORS headers (the browser sees "Failed to fetch").
  // The app then logs the failure and nothing is filed; retry the same submission up to 3 times.
  const done = new RegExp(`file_report item ${item}: (?!sending|waiting)`);
  for (let attempt = 1; ; attempt++) {
    const before = (await logText()).filter((x) => done.test(x)).length;
    await page.waitForFunction(() => !document.body.classList.contains("busy"), { timeout: 120000 });
    await page.click("#file-form button[type=submit]");
    await accept();
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < 300000) {
      const hits = (await logText()).filter((x) => done.test(x));
      if (hits.length > before) { last = hits[0]; break; }
      await new Promise((r) => setTimeout(r, 3000));
    }
    say(`attempt ${attempt}: ${last ?? "no result within 300 s"}`);
    if (last && / ok /.test(last)) break;
    if (attempt >= 3) throw new Error(`file_report item ${item} failed 3 times`);
    await page.waitForFunction(() => !document.body.classList.contains("busy"), { timeout: 400000 });
  }
  await page.waitForFunction((it) => document.querySelector("#report h3")?.textContent.includes(`item ${it}`), { timeout: 60000 }, item);
  const rid = Number((await page.$eval("#report h3", (e) => e.textContent)).match(/#(\d+)/)[1]);
  await clickReportButton("Adjudicate");
  await accept();
  say(await waitLog(new RegExp(`adjudicate #${rid}: .*(ok|reverted)`)));
  await page.waitForFunction(() => [...document.querySelectorAll("#report button")].some((b) => b.textContent.startsWith("Review final settlement")), { timeout: 60000 });
  return rid;
}
const r1 = await fileAndJudge("77", "C", "A disease that emerges suddenly and spreads across continents is a pandemic; endemic means constant presence in one region.");
const r2 = await fileAndJudge("25", "A", "Measles was controlled by improved hygiene and nutrition, not vaccination; the key is wrong.");

// ---- settle #r1: gating, then a concurrent settlement from another client
const selectReport = async (rid) => {
  await page.evaluate((id) => [...document.querySelectorAll("#pool .list button")].find((b) => b.textContent.startsWith(`Report #${id} `))?.click(), rid);
  await page.waitForFunction((id) => document.querySelector("#report h3")?.textContent.includes(`#${id} `), { timeout: 30000 }, rid);
  await page.waitForFunction(() => [...document.querySelectorAll("#report button")].some((b) => b.textContent.startsWith("Review final settlement")), { timeout: 60000 });
};
await selectReport(r1);
await clickReportButton("Review final settlement");
await page.waitForSelector("dialog#confirm[open]");
const dlg = await page.$eval("dialog#confirm", (d) => d.innerText);
say(`settle dialog: ${dlg.replace(/\s+/g, " ").slice(0, 900)}`);
const g0 = await okDisabled();
await page.type("#c-typed-in", `SETTLE ${r1 + 1}`);
const g1 = await okDisabled();
await page.$eval("#c-typed-in", (e) => { e.value = ""; });
await page.type("#c-typed-in", `SETTLE ${r1}`);
const g2 = await okDisabled();
await page.click("#c-ack-in");
const g3 = await okDisabled();
say(`Sign disabled: empty=${g0}, wrong id=${g1}, right id without ack=${g2}, right id + ack=${g3}`);
if (!(g0 && g1 && g2 && !g3)) throw new Error("gating failed");
await (await page.$("dialog#confirm")).screenshot({ path: new URL("../media/v0.3-settle-confirm.png", import.meta.url).pathname });
await ownerWrite(`settle #${r1} while the burner's dialog is open (race)`, "settle", [BigInt(r1)]);
await page.click("#c-ok");
say(await waitLog(new RegExp(`settle #${r1}: not sent, the on-chain state changed`), 60000));
const sent = (await logText()).some((x) => new RegExp(`settle #${r1}: (waiting|ACCEPTED|FINALIZED)`).test(x));
say(`burner sent a settle tx for #${r1}: ${sent}`);
if (sent) throw new Error("stale settle was sent");

// ---- settle #r2 through the full dialog
await selectReport(r2);
await clickReportButton("Review final settlement");
await page.waitForSelector("dialog#confirm[open]");
say(`settle dialog #${r2}: ${(await page.$eval("dialog#confirm", (d) => d.innerText)).replace(/\s+/g, " ").slice(0, 600)}`);
await page.type("#c-typed-in", `SETTLE ${r2}`);
await page.click("#c-ack-in");
await page.click("#c-ok");
say(await waitLog(new RegExp(`settle #${r2}: .*(ok|reverted)`)));
await new Promise((r) => setTimeout(r, 3000));
say(`report #${r2}: ${(await page.$eval("#report", (e) => e.innerText)).replace(/\s+/g, " ").slice(0, 300)}`);

// ---- claim
await page.evaluate(() => document.querySelector("#acct").scrollIntoView());
// #r1 was settled by the owner's client, but its credit belongs to the burner (the recipient is
// fixed by the contract, not by the caller): the Claim button must appear for the burner.
const hasClaim = await page.waitForSelector("#claim-btn", { timeout: 90000 }).catch(() => null);
if (hasClaim) {
  await page.click("#claim-btn");
  await page.waitForSelector("dialog#confirm[open]");
  say(`claim dialog: ${(await page.$eval("dialog#confirm", (d) => d.innerText)).replace(/\s+/g, " ").slice(0, 300)}`);
  await page.click("#c-ok");
  say(await waitLog(/claim: .*(ok|reverted)/));
} else throw new Error("the burner's credit from the settled upheld report did not appear");
await page.screenshot({ path: new URL("../media/v0.3-e2e.png", import.meta.url).pathname });
const log = await logText();
say("APP LOG:\n" + log.map((l) => "  " + l).join("\n"));
await browser.close();
writeFileSync(new URL("../deployments/studionet.json", import.meta.url), JSON.stringify(state, null, 2) + "\n");
writeFileSync(new URL("../artifacts/e2e-browser-v03.txt", import.meta.url), out.join("\n") + "\n");
console.log(JSON.stringify({ pool: pid, r1, r2 }));
