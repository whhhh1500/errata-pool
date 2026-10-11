import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus, transactionsStatusNumberToName } from "genlayer-js/types";
import deployment from "../../deployments/studionet.json";
import { normalizeItem } from "./normalize.js";
import "./style.css";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const params = new URLSearchParams(location.search);
const CONTRACT = params.get("contract") || deployment.contract;
const GEN = 10n ** 18n;
const $ = (s) => document.querySelector(s);

let account = null;
const reader = createClient({ chain: studionet });
let pools = [];
let reports = [];
let errata = [];
let poolSel = params.has("pool") ? Number(params.get("pool")) : 0;
let reportSel = params.has("report") ? Number(params.get("report")) : null;

// ---------- helpers ----------
function plain(v) {
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [k, plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}
const big = (v) => (typeof v === "bigint" ? v : BigInt(v || 0));
function fmtGen(wei) {
  const w = big(wei);
  const frac = (w % GEN).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return `${w / GEN}${frac ? "." + frac : ""} GEN`;
}
const toWei = (x) => (BigInt(Math.round(Number(x || 0) * 1e6)) * GEN) / 1000000n;
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}
const link = (href, text) => el("a", { href, target: "_blank", rel: "noopener" }, text);
const addrLink = (a) => link(`${EXPLORER}/address/${a}`, short(a));
const txLink = (h) => link(`${EXPLORER}/tx/${h}`, short(h));
const badge = (st) => el("span", { class: `badge ${st.toLowerCase()}` }, st);
const stat = (k, v) => el("div", { class: "stat" }, el("span", {}, k), el("strong", {}, String(v)));
const KIND = { wrong_answer: "Wrong answer key", ambiguous: "Ambiguous", flawed_question: "Flawed question" };

async function rpc(method, p) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: p }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j.result;
}
function log(msg, hash, cls = "") {
  const li = el("li", { class: cls }, el("time", {}, new Date().toLocaleTimeString()), " ", msg, hash ? [" ", txLink(hash)] : null);
  $("#log").prepend(li);
  return li;
}
const read = async (fn, args = []) => plain(await reader.readContract({ address: CONTRACT, functionName: fn, args }));

// ---------- account ----------
async function useBurner() {
  let pk = localStorage.getItem("errata:burner");
  if (!pk) { pk = generatePrivateKey(); localStorage.setItem("errata:burner", pk); }
  const acc = createAccount(pk);
  account = { address: acc.address, kind: "demo account", client: createClient({ chain: studionet, account: acc }) };
  if (big(await rpc("eth_getBalance", [acc.address, "latest"])) < 3n * GEN) {
    log("Funding demo account from the Studio faucet (test GEN)…");
    await rpc("sim_fundAccount", [acc.address, Number(20n * GEN)]);
  }
  await renderAccount();
  renderAll();
}
async function useWallet() {
  if (!window.ethereum) return alert("No browser wallet found. Use the demo account instead.");
  const [address] = await window.ethereum.request({ method: "eth_requestAccounts" });
  const client = createClient({ chain: studionet, account: address, provider: window.ethereum });
  try { await client.connect("studionet"); } catch (e) { log(`Wallet network switch: ${e.message || e}`, null, "warn"); }
  account = { address, kind: "browser wallet", client };
  await renderAccount();
  renderAll();
}
async function renderAccount() {
  const box = $("#acct");
  box.replaceChildren();
  if (!account) {
    box.append(
      el("button", { class: "primary", type: "button", onclick: () => useBurner().catch((e) => log(e.message, null, "err")) }, "Use demo account"),
      el("button", { class: "ghost", type: "button", onclick: () => useWallet().catch((e) => log(e.message, null, "err")) }, "Connect wallet"),
    );
    return;
  }
  let bal = "…";
  try { bal = fmtGen(await rpc("eth_getBalance", [account.address, "latest"])); } catch {}
  box.append(el("span", { class: "pill" }, account.kind), " ", addrLink(account.address), " ", el("strong", {}, bal),
    account.kind === "demo account" ? el("button", { class: "ghost small", type: "button", onclick: async () => { await rpc("sim_fundAccount", [account.address, Number(20n * GEN)]); renderAccount(); } }, "+20 test GEN") : null);
}

// ---------- confirmation ----------
// Every write goes through this dialog: what is called, on which contract and network, from
// which account, how much GEN leaves the wallet and what can happen to it. Destructive owner
// actions need the pool id typed in. Nothing is signed until "Sign and send".
let busy = false;
function confirmTx({ title, value = 0n, rows = [], warnings = [], typed = null }) {
  const dlg = $("#confirm");
  $("#c-title").textContent = title;
  const all = [["Contract", `${CONTRACT} (GenLayer Studio, test GEN)`], ["From", `${account.address} · ${account.kind}`],
    ["Attached value", value > 0n ? fmtGen(value) : "none"], ...rows];
  $("#c-rows").replaceChildren(...all.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)]));
  $("#c-warn").replaceChildren(...warnings.map((w) => el("li", {}, w)));
  const box = $("#c-typed"), inp = $("#c-typed-in"), ok = $("#c-ok");
  box.hidden = !typed;
  inp.value = "";
  ok.disabled = !!typed;
  if (typed) {
    $("#c-typed-label").textContent = typed.label;
    inp.oninput = () => { ok.disabled = inp.value.trim() !== typed.expect; };
  }
  return new Promise((resolve) => {
    dlg.onclose = () => resolve(dlg.returnValue === "ok" && (!typed || inp.value.trim() === typed.expect));
    dlg.returnValue = "";
    dlg.showModal();
    (typed ? inp : $("#c-cancel")).focus();
  });
}
async function walletBalance() {
  try { return big(await rpc("eth_getBalance", [account.address, "latest"])); } catch { return null; }
}
// pre-flight checks mirror the contract; a failed check never reaches the wallet
async function preflight(value, checks) {
  const problems = checks.filter(([bad]) => bad).map(([, msg]) => msg);
  if (value > 0n) {
    const b = await walletBalance();
    if (b != null && b < value) problems.push(`Your balance is ${fmtGen(b)}, below the ${fmtGen(value)} you would attach.`);
  }
  if (problems.length) { log(`Not sent: ${problems.join(" ")}`, null, "err"); return false; }
  return true;
}

// ---------- writes ----------
function decodePayload(pl) {
  const s = typeof pl === "string" ? pl : pl?.readable;
  if (s == null) return null;
  try { return JSON.parse(s); } catch {}
  // GenVM's readable form of a dict omits commas between entries ({"id":0"ok":true}), so pick
  // out the fields the app needs instead of parsing it.
  const ok = s.match(/"ok":(true|false)/);
  if (!ok) return s;
  const id = s.match(/"id":(\d+)/);
  const err = s.match(/"error":"((?:[^"\\]|\\.)*)"/);
  return { ok: ok[1] === "true", ...(id ? { id: Number(id[1]) } : {}), ...(err ? { error: err[1] } : {}) };
}
async function send(label, functionName, args, value = 0n, confirm = {}) {
  if (busy) return false;
  if (!account) await useBurner();
  if (!(await confirmTx({ title: label, value, ...confirm, rows: [["Call", `${functionName}(${args.map((x) => (typeof x === "string" ? JSON.stringify(x.length > 40 ? x.slice(0, 40) + "…" : x) : String(x))).join(", ")})`], ...(confirm.rows || [])] }))) {
    log(`${label}: cancelled, nothing was signed`);
    return false;
  }
  busy = true;
  document.body.classList.add("busy");
  const item = log(`${label}: sending…`);
  try {
    const hash = await account.client.writeContract({ address: CONTRACT, functionName, args, value });
    item.replaceChildren(el("time", {}, new Date().toLocaleTimeString()), ` ${label}: waiting for validator consensus… `, txLink(hash));
    const receipt = await account.client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, retries: 200, interval: 3000 });
    const lr = Array.isArray(receipt?.consensus_data?.leader_receipt) ? receipt.consensus_data.leader_receipt[0] : receipt?.consensus_data?.leader_receipt;
    const executed = lr?.execution_result === "SUCCESS" && (lr?.result?.status ?? "return") === "return";
    const out = decodePayload(lr?.result?.payload);
    const bounced = executed && out && typeof out === "object" && out.ok === false;
    const why = bounced ? `refused and refunded: ${out.error}` : executed ? `ok${out != null && typeof out !== "object" ? " → " + out : ""}` : `reverted: ${typeof out === "string" ? out : lr?.genvm_result?.stderr || lr?.execution_result || "unknown"}`;
    item.className = executed && !bounced ? "ok" : "err";
    item.replaceChildren(el("time", {}, new Date().toLocaleTimeString()), ` ${label}: ${receipt.statusName || transactionsStatusNumberToName[String(receipt.status)] || receipt.status} · ${why} `, txLink(hash));
    await refresh();
    renderAccount();
    return executed && !bounced ? out ?? true : false;
  } catch (e) {
    item.className = "err";
    item.textContent = `${label}: ${e.shortMessage || e.message}`;
    return false;
  } finally {
    busy = false;
    document.body.classList.remove("busy");
  }
}

// ---------- reads ----------
async function refresh() {
  try {
    const [stats, list] = await Promise.all([read("get_stats"), read("list_pools")]);
    pools = list;
    $("#stats").replaceChildren(stat("Pools", stats.pools), stat("Reports", stats.reports), stat("Paid to reviewers", fmtGen(stats.total_paid)),
      stat("Stakes forfeited", fmtGen(stats.total_forfeited)), stat("Refunded bad calls", fmtGen(stats.total_bounced)));
    if (!params.has("pool") && !refresh.done && pools.some((p) => p.open)) poolSel = Number(pools.filter((p) => p.open).at(-1).id);
    refresh.done = true;
    if (pools.length && !pools.some((p) => Number(p.id) === poolSel)) poolSel = Number(pools[0].id);
    if (pools.length) [reports, errata] = await Promise.all([read("list_reports", [BigInt(poolSel)]), read("get_errata", [BigInt(poolSel)])]);
    renderAll();
  } catch (e) {
    $("#pools").replaceChildren(el("p", { class: "err" }, `Could not read the contract: ${e.message}`));
  }
}
function renderAll() {
  renderPools();
  renderPool();
  renderReport();
}

function renderPools() {
  const box = $("#pools");
  if (!pools.length) return box.replaceChildren(el("p", { class: "muted" }, "No pools yet. Open the first one below."));
  box.replaceChildren(...pools.slice().reverse().map((p) => el("button", {
    type: "button", class: `item ${Number(p.id) === poolSel ? "sel" : ""}`, "aria-pressed": Number(p.id) === poolSel ? "true" : "false",
    onclick: async () => { poolSel = Number(p.id); reportSel = null; await refresh(); },
  }, el("span", { class: "t" }, `#${p.id} ${p.name}`), badge(p.open ? "OPEN" : "CLOSED"),
    el("span", { class: "m" }, `${fmtGen(p.reward)} per erratum · ${p.errata} accepted / ${p.reports} reports · ${fmtGen(p.balance)} free`))));
}

function renderPool() {
  const box = $("#pool");
  const p = pools.find((x) => Number(x.id) === poolSel);
  if (!p) return box.replaceChildren(el("p", { class: "muted" }, "Select a pool."));
  const me = account?.address?.toLowerCase();
  const isOwner = me && me === p.owner.toLowerCase();
  const fundAmt = el("input", { id: "fund-amt", type: "number", step: "0.01", min: "0.01", value: "1", style: "max-width:8rem" });
  const exportBtn = el("button", { class: "ghost small", type: "button", onclick: () => {
    const blob = new Blob([JSON.stringify({ pool: p.name, template: p.template, contract: CONTRACT, errata }, null, 2)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: `errata-pool-${p.id}.json` }); a.click();
  } }, "Export errata JSON");
  box.replaceChildren(
    el("div", { class: "row" }, el("h3", {}, `#${p.id} ${p.name}`), badge(p.open ? "OPEN" : "CLOSED")),
    el("p", { class: "hint" }, "Rules: ", p.rules || "—"),
    el("dl", { class: "kv" },
      el("dt", {}, "Items"), el("dd", {}, el("code", {}, p.template)),
      el("dt", {}, "Reward"), el("dd", {}, `${fmtGen(p.reward)} per accepted erratum (min stake ${fmtGen(p.min_stake)})`),
      el("dt", {}, "Funds"), el("dd", {}, `${fmtGen(p.balance)} free · ${fmtGen(p.reserved)} reserved · ${fmtGen(p.paid)} paid`),
      el("dt", {}, "Review window"), el("dd", {}, `${p.window_secs} s`),
      el("dt", {}, "Adjudication timeout"), el("dd", {}, `${p.timeout_secs} s (stuck reports are recoverable after this)`),
      el("dt", {}, "Owner"), el("dd", {}, addrLink(p.owner)),
    ),
    el("div", { class: "row" }, el("h4", {}, `Accepted errata (${errata.length})`), errata.length ? exportBtn : null),
    errata.length ? el("table", { class: "report" },
      el("thead", {}, el("tr", {}, ...["Item", "Type", "Published", "Corrected", "Appealed"].map((h) => el("th", { scope: "col" }, h)))),
      el("tbody", {}, errata.map((e) => el("tr", {}, el("td", {}, e.item_id), el("td", {}, KIND[e.kind] || e.kind), el("td", { class: "fail" }, e.published_key || "—"), el("td", { class: "pass" }, e.corrected_key || "—"), el("td", {}, e.appealed ? "yes" : "no"))))) : el("p", { class: "muted" }, "None yet."),
    el("h4", {}, `Reports (${reports.length})`),
    reports.length ? el("div", { class: "list" }, reports.slice().reverse().map((r) => el("button", {
      type: "button", class: `item ${Number(r.id) === reportSel ? "sel" : ""}`, "aria-pressed": Number(r.id) === reportSel ? "true" : "false",
      onclick: () => { reportSel = Number(r.id); renderPool(); renderReport(); $("#report-wrap").scrollIntoView({ behavior: "smooth", block: "start" }); },
    }, el("span", { class: "t" }, `Report #${r.id} · item ${r.item_id} · ${KIND[r.kind]}${r.proposed ? " → " + r.proposed : ""}`), badge(r.status),
      el("span", { class: "m" }, `${short(r.reporter)} staked ${fmtGen(r.stake)}${r.verdict ? " · verdict " + r.verdict : ""}${r.appealed ? " · appealed" : ""}`)))) : el("p", { class: "muted" }, "No reports yet."),
    el("div", { class: "actions" },
      p.open ? el("div", { class: "row" }, el("label", { for: "fund-amt" }, "Top up (anyone)"), fundAmt,
        el("button", { class: "ghost small", type: "button", onclick: async () => {
          const v = toWei(fundAmt.value);
          if (!(await preflight(v, [[v <= 0n, "Enter an amount above 0."]]))) return;
          send(`fund_pool #${p.id}`, "fund_pool", [BigInt(p.id)], v, { warnings: [
            isOwner ? "You own this pool: unreserved funds stay withdrawable by you." : `This is a donation: only the pool owner (${short(p.owner)}) can withdraw unreserved funds.`] });
        } }, "Fund")) : null,
      isOwner && p.open ? el("button", { class: "ghost small", type: "button", onclick: () => send(`close_pool #${p.id}`, "close_pool", [BigInt(p.id)], 0n, {
        rows: [["Refund now", fmtGen(p.balance)], ["Stays reserved", `${fmtGen(p.reserved)} for reports in flight`]],
        warnings: ["Closing is permanent: no new reports and no top-ups.", "Rewards and forfeited stakes that come back later are collected with “Withdraw free funds”."],
        typed: { label: `Type the pool id (${p.id}) to close it`, expect: String(p.id) } }) }, "Close pool and refund free funds") : null,
      isOwner && big(p.balance) > 0n && !p.open ? el("button", { class: "ghost small", type: "button", onclick: () => send(`withdraw_free #${p.id}`, "withdraw_free", [BigInt(p.id), 0n], 0n, {
        rows: [["You receive", fmtGen(p.balance)], ["Untouched", `${fmtGen(p.reserved)} reserved for reports in flight`]],
        typed: { label: `Type the pool id (${p.id}) to withdraw`, expect: String(p.id) } }) }, `Withdraw free funds (${fmtGen(p.balance)})`) : null,
    ),
  );
  $("#f-stake").min = String(Number(big(p.min_stake)) / 1e18);
}

function renderReport() {
  const box = $("#report");
  const r = reports.find((x) => Number(x.id) === reportSel);
  if (!r) return box.replaceChildren(el("p", { class: "muted" }, "Select a report in the pool to see the validators' verdict."));
  const p = pools.find((x) => Number(x.id) === Number(r.pool_id));
  const me = account?.address?.toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const windowOpen = ["UPHELD", "REJECTED"].includes(r.status) && !r.appealed && Number(r.window_end) > now;
  const canAppeal = windowOpen && me && ((r.status === "UPHELD" && me === p.owner.toLowerCase()) || (r.status === "REJECTED" && me === r.reporter.toLowerCase()));
  const actions = el("div", { class: "actions" });
  if (r.status === "PENDING") {
    const withEvidence = r.evidence_url && now < Number(r.evidence_until);
    actions.append(el("button", { class: "primary", type: "button", onclick: () => send(`adjudicate #${r.id}`, "adjudicate", [BigInt(r.id)], 0n, {
      rows: [["Judged on", withEvidence ? "item + justification + evidence page" : "item + justification (evidence page no longer used)"]],
      warnings: ["The verdict is final for this step: an INVALID verdict puts the reporter's stake at risk; VALID commits the pool's reserved reward. Each side can appeal once."] }) }, "Adjudicate now (validators fetch the item and vote)"));
    if (me === r.reporter.toLowerCase()) actions.append(el("button", { class: "ghost", type: "button", onclick: () => send(`withdraw_report #${r.id}`, "withdraw_report", [BigInt(r.id)], 0n, { rows: [["Refund", fmtGen(r.stake)]] }) }, "Withdraw and refund stake"));
    if (now >= Number(r.recoverable_at)) actions.append(el("button", { class: "ghost", type: "button", onclick: () => send(`recover_stuck #${r.id}`, "recover_stuck", [BigInt(r.id)], 0n, {
      rows: [["Stake", `${fmtGen(r.stake)} → reporter ${short(r.reporter)}`], ["Reserved reward", `${fmtGen(r.reserved)} → pool #${r.pool_id} free balance`]],
      warnings: ["You receive nothing: recovery only unsticks the funds. The report becomes EXPIRED and the item can be reported again."] }) }, "Recover stuck report (timeout passed)"));
    else actions.append(el("p", { class: "hint" }, `If adjudication keeps failing, anyone can recover this report after ${new Date(Number(r.recoverable_at) * 1000).toLocaleString()}.`));
  }
  if (canAppeal) {
    const reason = el("textarea", { id: "appeal-reason", rows: 2, maxlength: 600, placeholder: "Why is the verdict wrong?" });
    actions.append(el("label", { for: "appeal-reason" }, `Appeal once (${r.status === "UPHELD" ? "pool owner" : "reporter"}); re-judged on the stored snapshot`), reason,
      el("button", { class: "ghost", type: "button", onclick: async () => {
        if (!(await preflight(0n, [[reason.value.trim().length < 10, "Give a reason of at least 10 characters."]]))) return;
        send(`appeal #${r.id}`, "appeal", [BigInt(r.id), reason.value], 0n, { warnings: ["You can appeal only once. Validators re-judge the stored snapshot and both statements; the new verdict replaces the first."] });
      } }, "Appeal"));
  }
  if (["UPHELD", "REJECTED"].includes(r.status)) {
    actions.append(el("button", { class: "primary", type: "button", disabled: windowOpen ? true : false, onclick: () => send(`settle #${r.id}`, "settle", [BigInt(r.id)], 0n, {
      rows: [["Pays", r.status === "UPHELD" ? `${fmtGen(big(r.reserved) + big(r.stake))} → reporter ${short(r.reporter)}` : `stake ${fmtGen(r.stake)} forfeited into pool #${r.pool_id}`]] }) },
      windowOpen ? `Settle (window closes ${new Date(Number(r.window_end) * 1000).toLocaleTimeString()})` : "Settle"));
  }
  box.replaceChildren(...[
    el("div", { class: "row" }, el("h3", {}, `Report #${r.id} · item ${r.item_id}`), badge(r.status)),
    el("p", {}, link(r.item_url, "Item source"), r.evidence_url ? [" · ", link(r.evidence_url, "Evidence")] : null),
    el("dl", { class: "kv" },
      el("dt", {}, "Claim"), el("dd", {}, `${KIND[r.kind]}${r.proposed ? `: correct choice is ${r.proposed}` : ""}`),
      el("dt", {}, "Fix"), el("dd", {}, r.fix || "—"),
      el("dt", {}, "Justification"), el("dd", {}, r.justification),
      el("dt", {}, "Reporter"), el("dd", {}, addrLink(r.reporter), ` · stake ${fmtGen(r.stake)} · reward reserved ${fmtGen(r.reserved)}`),
      el("dt", {}, "Filed"), el("dd", {}, new Date(Number(r.filed_at) * 1000).toLocaleString()),
    ),
    ...(r.item_text ? [el("h4", {}, "Item snapshot judged by validators"), el("pre", { class: "item" }, r.item_text), el("p", { class: "hint" }, `sha256 ${r.item_hash}`)] : []),
    r.verdict ? el("div", { class: `verdict ${r.verdict.toLowerCase()}` },
      el("strong", {}, `Verdict: ${r.verdict}`), r.correct_choice ? ` · validators' answer ${r.correct_choice} (published ${r.published_key || "?"})` : "",
      el("p", {}, r.reason),
      r.appealed ? el("p", { class: "hint" }, `First verdict ${r.first_verdict}; appealed by ${short(r.appeal_by)}: “${r.appeal_reason}”`) : null) : null,
    actions,
  ].filter(Boolean));
}

// ---------- forms ----------
$("#preview-btn").addEventListener("click", async () => {
  const p = pools.find((x) => Number(x.id) === poolSel);
  const id = $("#f-item").value.trim();
  const pre = $("#preview");
  pre.hidden = false;
  if (!p || !id) { pre.textContent = "Pick a pool and an item id first."; return; }
  pre.textContent = "Fetching…";
  try {
    const r = await fetch(p.template.replaceAll("{id}", id));
    pre.textContent = normalizeItem(await r.text()).text;
  } catch (e) { pre.textContent = `Could not fetch from the browser (${e.message}). Validators fetch server-side.`; }
});
$("#file-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const p = pools.find((x) => Number(x.id) === poolSel);
  const stake = toWei(f.get("stake"));
  const item = f.get("item").trim(), kind = f.get("kind"), choice = f.get("choice").trim().toUpperCase();
  const me = account?.address?.toLowerCase();
  const ok = await preflight(stake, [
    [!p, "Pick a pool first."],
    [p && !p.open, "This pool is closed."],
    [p && me && me === p.owner.toLowerCase(), "Pool owners cannot report into their own pool."],
    [p && stake < big(p.min_stake), `Stake must be at least ${p ? fmtGen(p.min_stake) : ""}.`],
    [p && big(p.balance) < big(p.reward), "The pool cannot cover another reward right now."],
    [kind === "wrong_answer" && !/^[A-J]$/.test(choice), "A wrong-answer report needs the correct choice letter (A-J)."],
    [f.get("why").trim().length < 10, "Explain the error (at least 10 characters)."],
    [reports.some((r) => r.item_id === item && ["PENDING", "UPHELD", "REJECTED", "PAID"].includes(r.status)), `Item ${item} already has an open or accepted report.`],
  ]);
  if (!ok) return;
  const res = await send(`file_report item ${item}`, "file_report",
    [BigInt(poolSel), item, kind, choice, f.get("fix"), f.get("why"), f.get("ev").trim()], stake, {
      rows: [["Claim", `${KIND[kind]}${kind === "wrong_answer" ? ` → ${choice}` : ""} on item ${item}`], ["If upheld", `you receive ${fmtGen(p.reward)} + your stake back`], ["If rejected", `your ${fmtGen(stake)} stake is forfeited to the pool`]],
      warnings: [`After ${p.timeout_secs} s without an adjudication anyone can recover the report and refund your stake.`] });
  if (res && typeof res === "object" && res.id != null) { reportSel = Number(res.id); await refresh(); $("#report-wrap").scrollIntoView({ behavior: "smooth" }); }
});
$("#pool-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const fund = toWei(f.get("fund")), reward = toWei(f.get("reward")), timeout = Number(f.get("timeout"));
  const ok = await preflight(fund, [
    [!f.get("tpl").includes("{id}") || !/^https?:\/\//.test(f.get("tpl").trim()), "The item URL must be http(s) and contain {id}."],
    [reward <= 0n, "Reward must be above 0."],
    [fund < reward, "Fund at least one reward."],
    [!(timeout >= 60 && timeout <= 2592000), "Adjudication timeout must be 60 s to 30 days."],
  ]);
  if (!ok) return;
  const res = await send(`create_pool "${f.get("name")}"`, "create_pool",
    [f.get("name"), f.get("tpl").trim(), f.get("rules"), reward, toWei(f.get("stake")), BigInt(f.get("window")), BigInt(timeout)], fund, {
      rows: [["Covers", `${fund / (reward || 1n)} reward(s) of ${fmtGen(reward)}`]],
      warnings: ["Rewards for filed reports are reserved and cannot be withdrawn until those reports settle or expire."] });
  if (res && typeof res === "object" && res.id != null) { poolSel = Number(res.id); await refresh(); }
});
$("#refresh").addEventListener("click", refresh);

// ---------- boot ----------
$("#contract-link").href = `${EXPLORER}/address/${CONTRACT}`;
$("#contract-link").textContent = short(CONTRACT);
renderAccount();
refresh();
setInterval(refresh, 30000);
