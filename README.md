# ErrataPool

**Staked bug bounties for AI benchmark answer keys, adjudicated by GenLayer validators.**

Public benchmarks such as MMLU, GSM8K and ARC drive model releases, papers and procurement decisions, and they ship with wrong answer keys. [MMLU-Redux](https://arxiv.org/abs/2406.04127) had 14 experts re-annotate 5,700 MMLU questions and estimates that 6.49% of MMLU questions are erroneous (57% of the analysed Virology questions). Fixing a benchmark means *adjudicating* contested items one at a time. Today that is done by small expert teams with no incentive, no stake, and no public, machine-readable record.

ErrataPool turns this into a market with a referee:

| who | does what |
|---|---|
| **Maintainer / eval org** | opens a **pool** for a benchmark: escrows GEN, sets a reward per accepted erratum, a minimum stake, a review window, rules, and an item-URL template such as `https://datasets-server.huggingface.co/rows?dataset=cais%2Fmmlu&config=virology&split=test&offset={id}&length=1` |
| **Reviewer** | **files a report** on one item ("the key says B, the right answer is C", "ambiguous", "flawed question"), with a stake, a justification and an optional evidence URL. The reward is **reserved at filing**, so the sponsor cannot drain the pool while reports are pending |
| **Anyone** | calls **adjudicate**: every validator fetches the item, normalises it with the same deterministic adapter, reads the evidence page and asks its LLM for a verdict, under a **custom validator** |
| **Loser** | may **appeal once** inside the review window (the pool owner against an upheld report, the reporter against a rejected one). The appeal is judged on the **stored item snapshot**, with both sides' statements |
| **Anyone** | calls **settle**: an upheld erratum pays reward + stake to the reporter and is appended to the pool's public **errata list** (exportable JSON for eval harnesses); a rejected report's stake is forfeited **into the pool**, which funds future rewards and prices out spam |

**Live app:** https://whhhh1500.github.io/errata-pool/ (demo account funded by the Studio faucet, or any browser wallet)
**Contract v0.3 (GenLayer Studio / studionet):** [`0x78dFbB6174adA84cf88Fc3A41D82c7b6c05dB1Df`](https://explorer-studio.genlayer.com/address/0x78dFbB6174adA84cf88Fc3A41D82c7b6c05dB1Df) · [open in Studio](https://studio.genlayer.com/?import-contract=0x78dFbB6174adA84cf88Fc3A41D82c7b6c05dB1Df) · deploy tx `0x951ae0706d69dd5b669b4345f3b3a2561dc8495e3f6c133b4a24d73cfcc6a288`. Superseded: v0.2 `0xc1DA30D9…5C6E`, v0.1 `0xbf2Ab9B2…9b94` (kept for their recorded runs).

## v0.3: second round of the steward review (safe timeout, closed-pool forfeits, final-settlement UX, adversarial e2e)

Full delta: [`v0.2.0...v0.3.0`](https://github.com/whhhh1500/errata-pool/compare/v0.2.0...v0.3.0) (and [`v0.1.0...v0.3.0`](https://github.com/whhhh1500/errata-pool/compare/v0.1.0...v0.3.0) against the reviewed version).

| review item | v0.3 change | evidence |
|---|---|---|
| **(a) reports stuck PENDING because evidence/item can't be fetched: safe timeout + recovery** | Every report stores a **deadline** (`filed_at + pool.timeout_secs`, 60 s to 30 days, fixed at filing). Before it only `adjudicate` can move a PENDING report; from it on only `recover_stuck` can, so the two never race. `recover_stuck` is open to **anyone** (the reporter may be gone), but the caller gains nothing: the stake is credited to the **reporter**, the reserved reward returns to the **pool** (or to the owner's credit if the pool is closed). Only PENDING reports are recoverable, so a reporter cannot dodge a forfeit. A **missing item** (HTTP 404/410 or an empty datasets-server row, agreed by validators like a verdict) becomes **VOID** at once (stake refunded, reward released) instead of blocking the reward until the deadline; a transient 5xx stays PENDING. Evidence-page failure alone never blocks (validators judge without it); a page that *splits* validators is ignored from half the deadline on, and appeals never fetch it. | tests `test_evidence_fetch_failure_then_timeout_then_recovery`, `test_missing_item_is_void_at_once_not_stuck`, `test_transient_5xx_is_not_void`, `test_evidence_failure_alone_never_blocks_adjudication`, `test_split_evidence_cannot_force_a_free_refund`; live run in [evidence/v0.3-adversarial-e2e.md](evidence/v0.3-adversarial-e2e.md) |
| **(b) forfeited stakes stranded in a closed pool** | A closed pool **never holds free funds** (invariant checked after every random step). `close_pool` credits the free balance to the owner; anything that later returns to a closed pool (forfeited stakes, released rewards, recovered reservations) is **credited to the owner immediately** and withdrawn with `claim()`. `withdraw_free` stays for open pools and can never touch reserved rewards. | `test_forfeited_stake_after_close_is_credited_to_owner_and_claimable`, `test_recovery_and_withdrawal_after_close_also_reach_the_owner`, `test_withdraw_free_never_touches_rewards_reserved_for_reporters`; live run (settle on closed pool → owner credit → owner claims) |
| **Payout safety (re-entrancy, partial payouts, double pay)** | **Pull payments.** No call pushes GEN to a party except the same-transaction refund of an invalid payable call. settle / recover / withdraw / close only write `credits[address]` after the report is final (`_finish` before any money moves); `claim()` zeroes the credit, then emits one transfer. Emitted transfers run only after the call has finished, so there is no re-entrancy; a payout is one credit (reward + stake together), so there is no partial payment; a broken or hostile recipient cannot block anyone else. `get_liabilities()` now includes unclaimed credits. | `test_double_settle_and_cross_path_double_payout`, `test_settle_after_appeal_settles_once`, randomized solvency (3 seeds × 160 ops, native balance = liabilities after every step, ends at 0 wei after all claims) |
| **(c) stronger frontend confirmation before final settlement** | Settle and recover open a **final-settlement dialog**: an orange FINAL banner, the verdict and reason, the appeal status, and every credit with recipient and amount taken from the contract's own `preview_settle` / `preview_recover` views (the same `_settle_plan` that `settle` executes). Sign stays disabled until `SETTLE <id>` (or `RECOVER <id>`) is typed **and** an acknowledgement is ticked. Right before signing the app **re-reads the report and the preview**; if anything changed (someone settled, appealed or recovered meanwhile) nothing is sent. A preview that says the call would fail never opens the dialog. Claim has its own dialog; final reports show a "Final, no further action" note. | [media/v0.3-settle-confirm.png](media/v0.3-settle-confirm.png); `scripts/e2e-browser-v03.mjs` (gating checks, a concurrent settle from another client while the dialog is open → *not sent*, full settle, claim) → [evidence/v0.3-browser-e2e.md](evidence/v0.3-browser-e2e.md) |
| **(d) adversarial end-to-end tests** | 17 adversarial direct-mode tests (transfer ledger hooking every `EthSend`) + 15 flow tests + 22 unit tests. A live three-party run on Studio (`scripts/adversarial-e2e-v03.mjs`) with the deployer and two fresh faucet keys covers: evidence + item fetch failure → adjudication refused after the deadline → stranger recovers → reporter claims; missing item VOID (empty row and HTTP 404); forfeited stake after close → owner credit → owner claim; double settle, double recover, double claim; unauthorized withdraw / close / withdraw_free / appeal / claim. | [evidence/v0.3-adversarial-e2e.md](evidence/v0.3-adversarial-e2e.md) (every tx with expected vs actual and an explorer link) |

### Threat model (v0.3)

* **Who may trigger what.** `adjudicate`, `settle`, `recover_stuck`: anyone, because the outcome and the recipients are fixed by the contract; the caller earns nothing. `appeal`: only the losing side, once, inside the window. `withdraw_report`: only the reporter, only while PENDING. `close_pool`, `withdraw_free`: only the pool owner. `claim`: only for the caller's own credit.
* **Griefing.** A reporter cannot park a report forever: the deadline ends adjudication, and recovery returns the reward to the pool. A bogus item id is voided as soon as anyone adjudicates it. A reporter-controlled evidence page cannot force a free refund (ignored from half the deadline on). The owner cannot drain reserved rewards, report into their own pool from the same address, or withdraw a closed pool's later forfeits for anyone but themselves.
* **Residual.** An owner who controls the item host could take it offline (5xx) until the deadline: the reporter then gets the stake back but no reward. Use public dataset hosts. An appeal that cannot reach consensus leaves the first verdict, which settles after the window (no funds are stranded). Verdict quality is bounded by the validators' LLMs.

## v0.2: changes from the first steward review

| requested | what changed | evidence |
|---|---|---|
| **Secure recovery for reports stuck PENDING** | New `recover_stuck(id)`. Each pool sets an adjudication timeout (60 s to 30 days). After it, **anyone** can recover a report that is still PENDING: the stake goes to the **reporter**, the reserved reward goes back to the **pool**, and the caller gets nothing. Adjudicated reports can never be recovered, so a reporter cannot dodge a forfeit. Closing the hole this opens: a reporter-controlled evidence page that splits validators could otherwise force a free refund, so from half the timeout on, `adjudicate` ignores the evidence page, and appeals never fetch it. An out-of-range item (HF returns 200 with no rows) is now "no item" instead of being judged. | `tests/direct/test_adversarial.py::test_stuck_report_recovery_refunds_reporter_not_caller`, `test_adjudicated_reports_are_never_recoverable`, `test_flaky_evidence_page_cannot_force_a_free_refund`, `test_appeal_ignores_the_evidence_page`; live rows 7, 12, 17-19 of [evidence/adversarial-e2e.md](evidence/adversarial-e2e.md) |
| **Withdrawable forfeited stakes after pool closure** | Everything that returns to a pool (forfeited stakes, released rewards) now always lands in its free balance. A new owner-only `withdraw_free(pool, amount)` (0 = all) works on open or closed pools and can never touch rewards reserved for reports in flight. | `test_forfeits_after_close_are_withdrawable_by_owner_only`, `test_withdraw_free_never_touches_rewards_reserved_for_reporters`; live rows 23-25 (owner collects 4.5 GEN from a closed pool, attacker refused) |
| **Stronger frontend confirmation** | Every write opens a confirmation dialog: contract, network, sender, the exact call, attached GEN and what can happen to it (upheld/rejected payouts, who receives a recovery). Closing a pool and withdrawing need the pool id typed in. Pre-flight checks mirror the contract (min stake, balance, owner self-report, duplicate item, choice letter, timeout range), so a bad call never reaches the wallet. Cancel signs nothing, and a busy lock blocks double submits. New buttons: *Recover stuck report*, *Withdraw free funds*. | [media/confirm.png](media/confirm.png); `scripts/e2e-browser.mjs` checks the pre-flight block, cancel and confirm against the live contract (report #6) |
| **Adversarial end-to-end tests** | 12 new direct-mode tests with a ledger that hooks every `EthSend`, so they check real transfers: prompt injection in the report and in the evidence page (our delimiters are neutralised by `fence()`), an access-control matrix, forged leader results, and a randomized run (3 seeds × 160 ops across 2 pools and 3 actors) that checks `native balance == get_liabilities()` after every step and ends with every report final and 0 wei left. A live run on Studio with three parties (owner + two fresh faucet keys) sends 25 real transactions, including every attack, and checks each one. | `tests/direct/test_adversarial.py`; `scripts/adversarial-e2e.mjs` → [evidence/adversarial-e2e.md](evidence/adversarial-e2e.md) run 2: **25/25**, contract balance 0 = liabilities 0 |

### Threat model (what is and is not covered)

* **Covered:** the caller of recovery or settlement cannot redirect funds. A reporter cannot exit after a verdict (`withdraw_report` is PENDING-only) or recover an adjudicated report. The owner cannot report into its own pool from the same address, withdraw reserved rewards, or appeal twice. Settle cannot pay twice. Forged leader verdicts, choices or item hashes are rejected by the validator. Injected `</report>`-style delimiters are neutralised. Invalid payable calls are refunded.
* **Residual:** an owner who controls the item host could take it offline to force a timeout. The reporter then gets the stake back but no reward. Use pools whose item source is a public dataset host (HF). An owner using a second address to self-report only pays itself out of its own pool. Verdict quality is bounded by the validators' LLMs; the appeal and the strict rule for `wrong_answer` (the letters must match) limit the damage.

![ErrataPool web app showing the MMLU virology pool, its accepted errata and an appealed report](media/app.png)

## Recorded live run on the v0.1 contract (real MMLU items, real Hugging Face fetches)

Pool #0, "MMLU · virology (test split)": 8 GEN, 2 GEN per erratum, 0.5 GEN minimum stake, 180 s review window. Sponsor `0xc7AC…8CEd`, reporter `0x1FD9…099d`. Every transaction below is **FINALIZED with leader execution SUCCESS**, verified with [genlayer-doctor](https://github.com/whhhh1500/genlayer-doctor) (full output in [`evidence/gldoctor-explain.txt`](evidence/gldoctor-explain.txt)).

| step | item (cais/mmlu virology) | outcome | tx |
|---|---|---|---|
| deploy v2 | | contract `0xbf2A…9b94` | `0xc8d7b47d19c910b0754cad1a44cb5b8e272529c8c71de8cb41be743c21cb392d` |
| create_pool | | pool #0 funded with 8 GEN | `0x079fd044e6f5d5e7176988e7af873533aec1903a26e79ac4b4f27768b3c41f9b` |
| file_report #0 | 77 "emerges suddenly and spreads globally" (key **B Endemic**), claims C | 2 GEN reserved | `0x58bc14a13f1d593dda84fb61313fdc0c624f26c8db15f62d455c547ba76c91a4` |
| file_report #1 | 136 "Nipah … where did it originate?" (key **C humans**), claims B | 2 GEN reserved | `0xa692a95499a08843164336ba5be671ae752d8c738a073b15bdbea0b791617aef` |
| file_report #2 | 25 "Measles has been controlled by…" (key **B MMR**, correct), bogus claim A | 2 GEN reserved | `0xb337a35e66eb165b64c94e48874ff6199eff3bad6051b3319ae7662df39ac090` |
| adjudicate #0 | 77 | **UPHELD**, validators' answer C | `0x2605f6aa173f0f274a2817bbe7d5d46601f6a64479eb92c3d887c18e8538d35f` |
| adjudicate #1 | 136 | **UPHELD**, validators' answer B | `0x43b0171574607114b14c34350460b6eb5e9d8ccbd69882bdd038eb2d1c837c82` |
| adjudicate #2 | 25 | **REJECTED** (MMR is right) | `0x7922732f391e444f102589f91ba9b43ae5af871a4add9d8ffec8de7628b05d60` |
| appeal #1 by the pool owner | 136 ("our textbook frames Nipah as a human disease") | still **UPHELD** on the snapshot | `0x6cb3ab6da831a69820d821d7d77d8f64eecea81a522d4754d518c7b44d54a5a2` |
| appeal #2 by the reporter | 25 ("McKeown thesis: hygiene") | still **REJECTED** | `0xa0af362d67405bba854b5ce04c6ffdf4a830d124a3c022fe05c362b6913e2553` |
| settle #0 | 77 | **PAID** 2 + 0.5 GEN, erratum listed | `0x88302fe3d6ec275174fddf01f827ef6bfb21857b1722eeaae08306c2f04f9345` |
| settle #1 | 136 | **PAID** 2 + 0.5 GEN, erratum listed (appealed) | `0xf51177963d7be390a9766fe46cca34ee1c49d35a5e28ff111efc3ec1c2501836` |
| settle #2 | 25 | **FORFEITED**: 0.5 GEN stake into the pool | `0xc45315d72bdb1bed8bdf4f206dd448207802e5720635863a990ef15802bb9ea6` |
| duplicate report on 77 | | refused **and refunded in the same tx** (`ok:false`) | `0xdd9bfa7e72ec04805c76a85dd225a3625d93820ccac58ef7042829ff7f9e75aa` |
| payouts / refund | | emitted native transfers from the contract | `0x2d3a1050…a4db2ff`, `0xbbeb14d2…4344560`, `0x1b04e570…a155d` |
| **web app** (burner) file_report #3 | 0 "How many human polyomaviruses are known?" (key **A 100**), claims C "10" | filed | `0xca85567b550dc2628733191c0e4cc2f9446c513322df349985263f467cf7baa9` |
| **web app** adjudicate #3 | 0 | **REJECTED**: "the key A is wrong, but C is not clearly correct; the defensible option is D) unknown" | `0x4dad0ad95cf0f130da6450318cca3c9ee8f8e1807d7f78e472d9411fffb82fc5` |
| settle #3 | 0 | FORFEITED | `0x74290bde8172260fff2d81a5e8e8a90aaeaafb03c73089900eedc0950f03e080` |

Report #3 shows why the contract asks for the *right* answer and not only "the key is wrong": the item really is broken (MMLU-Redux lists it), but "10" is not the fix, so nothing is paid and the item stays open for a better report.

After the run, `node scripts/errata.mjs solvency` gives `held 5 GEN == owed 5 GEN` (the pool's free balance after paying 4 GEN, plus 1 GEN of forfeited stakes). The exported errata list:

```json
[{"report_id":0,"item_id":"77","kind":"wrong_answer","published_key":"B","corrected_key":"C","appealed":false,"item_hash":"df304877…0c9e"},
 {"report_id":1,"item_id":"136","kind":"wrong_answer","published_key":"C","corrected_key":"B","appealed":true,"item_hash":"dee7e7c7…f93c"}]
```

## How GenLayer is used

* **Web access** (`gl.nondet.web.get`): the benchmark item (Hugging Face datasets-server, or any JSON or HTML endpoint) and the reporter's evidence page.
* **LLM judgment** (`gl.nondet.exec_prompt`, JSON output): the adjudication of the item against the report, the pool's rules, the evidence and, on appeal, both sides' statements.
* **Validator consensus with a custom validator** (`gl.vm.run_nondet_unsafe`): each validator re-fetches and re-judges independently, then accepts the leader's result only if it reaches the **same item fingerprint (sha256 of the normalised item), the same verdict and the same corrected choice**. The free-text reason may differ; the decision may not. If the leader failed (for example, the item URL returned 503), validators agree only if they fail too.
* **Real state and value**: pools, reports, an active-item index that blocks duplicate reports, per-pool errata lists, reserved rewards, stakes, a pull-payment credit ledger, and native GEN payouts via `emit_transfer` from `claim()`.

### Design decisions

* **The model never moves money directly.** The LLM returns a verdict and a letter; deterministic rules decide everything else. For `wrong_answer`, `VALID` stands only if the validators' letter equals the reporter's letter and differs from the published key. Payout amounts and recipients come from the pool, not the model.
* **One deterministic item adapter on every validator.** `normalize_item` maps HF datasets-server rows, plain `{question, choices, answer}` JSON, ARC-style `{choices:{text}, answerKey}` objects, and 0-based, numeric-string or letter answers into one canonical text with an explicit "Published answer key: B) …" line. The validators' fingerprint is taken over this text, so key order or envelope differences cannot split consensus. The web app uses the same adapter for its "preview as validators see it" button (`frontend/src/normalize.js`).
* **Appeals are judged on the snapshot.** The item text judged at adjudication is stored. An appeal re-judges *that* text. A maintainer cannot silently patch the upstream item (or take it offline) to defeat an appeal. This is covered by a test that makes the item URL return 404 during the appeal.
* **Payable calls never revert once value is attached.** On Studio we observed that a reverted payable transaction rolls back storage but **keeps the attached GEN in the contract**: probe tx `0x2c9c487d5cee67cf6269eacdd6e393dc4e5521a6f9c4822cf9c3d0d66fb974d1` on the superseded v1 contract (`FINALIZED`, leader `ERROR`, and the contract balance went from 0 to 1 GEN). In v2, `create_pool`, `fund_pool` and `file_report` are deterministic only. Invalid input returns `{"ok": false, "error": …}` and refunds the value in the same transaction (see the duplicate report above). All web and LLM work happens in non-payable calls (`adjudicate`, `appeal`), so a fetch failure only leaves the report `PENDING` to be retried, withdrawn, or (after the pool's timeout) recovered by anyone.
* **Solvency is checkable.** `get_liabilities()` returns what the contract owes (free pool funds + reserved rewards + stakes in flight + unclaimed credits). `scripts/errata.mjs solvency` compares it with the native balance.
* **Prompt-injection hygiene.** The report, evidence and appeal are interested parties' text. They are fenced in `<report>`, `<evidence>` and `<appeal>` tags, and the prompt says to treat them as claims, never instructions. Item ids are restricted to `[A-Za-z0-9._:-]{1,64}`, so a reporter cannot smuggle query parameters (`1&length=100`) into the template.
* **Anti-spam economics.** A rejected stake grows the pool, an accepted item can never be paid twice, and a rejected item can be re-reported with a better argument.

## Repository

```
contracts/errata_pool.py       Intelligent Contract (py-genlayer, pinned runner header)
frontend/                      Vite + genlayer-js web app (built to docs/ for GitHub Pages)
scripts/errata.mjs             CLI: deploy, pools, reports, adjudicate, appeal, settle, solvency
scripts/e2e-browser.mjs        headless browser run of the web app against the live contract
tests/unit/                    22 pure tests of the adapter, prompt fencing, verdict parsing, rules, consensus key
tests/direct/                  32 GenVM direct-mode tests (15 flow + 17 adversarial with a transfer ledger)
scripts/adversarial-e2e-v03.mjs  v0.3 live three-party adversarial run on Studio
evidence/v0.3-adversarial-e2e.md its recorded output, with tx links
scripts/e2e-browser-v03.mjs    browser run of the final-settlement dialog (gating, concurrent-settle abort, claim)
evidence/v0.3-browser-e2e.md   its recorded output
scripts/adversarial-e2e.mjs    v0.2 live run (25 txs) → evidence/adversarial-e2e.md
deployments/studionet.json     contract address and every recorded transaction
evidence/gldoctor-explain.txt  genlayer-doctor output for every transaction
```

## Run it

```bash
npm ci && npm run dev                       # web app on http://localhost:5173/errata-pool/
pip install genlayer-test==0.29.2 genvm-linter==0.11.0 pytest
genvm-lint check contracts/errata_pool.py
python -m pytest -q tests/unit
(cd tests/direct && python -m pytest -q)    # needs genvm-universal v0.2.16 in ~/.cache/gltest-direct (see CI)

# CLI against Studio. The key is built in memory and never printed:
export GENLAYER_PRIVATE_KEY=0x...           # or MNEMONIC_FILE=/path HD_INDEX=0
node scripts/errata.mjs fund                # free Studio test GEN
node scripts/errata.mjs pools
node scripts/errata.mjs report 0 77 wrong_answer C 0.5 "Key should be C" "Global spread defines a pandemic" https://en.wikipedia.org/wiki/Pandemic
node scripts/errata.mjs adjudicate <report-id>
node scripts/errata.mjs preview-settle <report-id>     # exactly what settle would credit, or why it fails
node scripts/errata.mjs recover <report-id>            # after the report's adjudication deadline
node scripts/errata.mjs withdraw-free <pool-id> 0      # owner: move free funds of an open pool to your credit
node scripts/errata.mjs credit && node scripts/errata.mjs claim   # pull payments
node scripts/adversarial-e2e-v03.mjs 600 900           # live adversarial run (window, timeout in s)
```

## Roadmap

* Multi-item batches and per-subject pools generated from an HF dataset card.
* An eval-harness plugin (lm-evaluation-harness / OpenAI evals) that applies `get_errata` before scoring.
* Reviewer reputation from accepted versus forfeited reports, and a reviewer-weighted second round for high-value pools.
* Bradbury testnet deployment.

MIT licensed.
