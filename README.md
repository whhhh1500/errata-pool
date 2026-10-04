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
**Contract (GenLayer Studio / studionet):** [`0xbf2Ab9B2c9344285BF344B166C7E1e16CBB79b94`](https://explorer-studio.genlayer.com/address/0xbf2Ab9B2c9344285BF344B166C7E1e16CBB79b94) · [open in Studio](https://studio.genlayer.com/?import-contract=0xbf2Ab9B2c9344285BF344B166C7E1e16CBB79b94)

![ErrataPool web app showing the MMLU virology pool, its accepted errata and an appealed report](media/app.png)

## Recorded live run (real MMLU items, real Hugging Face fetches)

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
* **Real state and value**: pools, reports, an active-item index that blocks duplicate reports, per-pool errata lists, reserved rewards, stakes, and native GEN payouts via `emit_transfer`.

### Design decisions

* **The model never moves money directly.** The LLM returns a verdict and a letter; deterministic rules decide everything else. For `wrong_answer`, `VALID` stands only if the validators' letter equals the reporter's letter and differs from the published key. Payout amounts and recipients come from the pool, not the model.
* **One deterministic item adapter on every validator.** `normalize_item` maps HF datasets-server rows, plain `{question, choices, answer}` JSON, ARC-style `{choices:{text}, answerKey}` objects, and 0-based, numeric-string or letter answers into one canonical text with an explicit "Published answer key: B) …" line. The validators' fingerprint is taken over this text, so key order or envelope differences cannot split consensus. The web app uses the same adapter for its "preview as validators see it" button (`frontend/src/normalize.js`).
* **Appeals are judged on the snapshot.** The item text judged at adjudication is stored. An appeal re-judges *that* text. A maintainer cannot silently patch the upstream item (or take it offline) to defeat an appeal. This is covered by a test that makes the item URL return 404 during the appeal.
* **Payable calls never revert once value is attached.** On Studio we observed that a reverted payable transaction rolls back storage but **keeps the attached GEN in the contract**: probe tx `0x2c9c487d5cee67cf6269eacdd6e393dc4e5521a6f9c4822cf9c3d0d66fb974d1` on the superseded v1 contract (`FINALIZED`, leader `ERROR`, and the contract balance went from 0 to 1 GEN). In v2, `create_pool`, `fund_pool` and `file_report` are deterministic only. Invalid input returns `{"ok": false, "error": …}` and refunds the value in the same transaction (see the duplicate report above). All web and LLM work happens in non-payable calls (`adjudicate`, `appeal`), so a fetch failure only leaves the report `PENDING` to be retried or withdrawn.
* **Solvency is checkable.** `get_liabilities()` returns what the contract owes (free pool funds + reserved rewards + stakes in flight). `scripts/errata.mjs solvency` compares it with the native balance.
* **Prompt-injection hygiene.** The report, evidence and appeal are interested parties' text. They are fenced in `<report>`, `<evidence>` and `<appeal>` tags, and the prompt says to treat them as claims, never instructions. Item ids are restricted to `[A-Za-z0-9._:-]{1,64}`, so a reporter cannot smuggle query parameters (`1&length=100`) into the template.
* **Anti-spam economics.** A rejected stake grows the pool, an accepted item can never be paid twice, and a rejected item can be re-reported with a better argument.

## Repository

```
contracts/errata_pool.py       Intelligent Contract (py-genlayer, pinned runner header)
frontend/                      Vite + genlayer-js web app (built to docs/ for GitHub Pages)
scripts/errata.mjs             CLI: deploy, pools, reports, adjudicate, appeal, settle, solvency
scripts/e2e-browser.mjs        headless browser run of the web app against the live contract
tests/unit/                    17 pure tests of the adapter, verdict parsing, rules, consensus key
tests/direct/                  15 GenVM direct-mode tests (mocked web + LLM, run_validator)
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
```

## Roadmap

* Multi-item batches and per-subject pools generated from an HF dataset card.
* An eval-harness plugin (lm-evaluation-harness / OpenAI evals) that applies `get_errata` before scoring.
* Reviewer reputation from accepted versus forfeited reports, and a reviewer-weighted second round for high-value pools.
* Bradbury testnet deployment.

MIT licensed.
