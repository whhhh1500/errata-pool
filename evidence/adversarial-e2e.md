# Adversarial end-to-end run 1: 2026-10-11T15:34:34.256Z

Contract [0xc1DA30D9bCdE724065EDa6B15f3d9b7D933e5C6E](https://explorer-studio.genlayer.com/address/0xc1DA30D9bCdE724065EDa6B15f3d9b7D933e5C6E) on GenLayer Studio, pool #0, reports #0-#2.
Window 60 s, adjudication timeout 120 s. Reporter and attacker are fresh in-memory keys funded by the Studio faucet.

| # | party | step | expected | result | tx |
|---|---|---|---|---|---|
| 1 | OWNER | create_pool (6 GEN, reward 2, min stake 0.5, window 60s, timeout 120s) | `ok` | PASS: executed {"id":0"ok":true} | [0xbaae61d5…](https://explorer-studio.genlayer.com/tx/0xbaae61d57a5bda625fd22c642c60a5953268bef1db3a728251c95b481cc14fb9) |
| 2 | OWNER | owner reports into own pool (must be refused and refunded) | `bounce:pool owner cannot report` | PASS: executed {"error":"the pool owner cannot report into their own pool""ok":false"refunded":1000000000000000000} | [0x7bf6aa84…](https://explorer-studio.genlayer.com/tx/0x7bf6aa841fccb8467b727a0dbb6b3172f288576ae64ac279524054f6dc3df522) |
| 3 | REPORTER | honest erratum: item 77 key B (Endemic) should be C (Pandemic) | `ok` | PASS: executed {"id":0"ok":true} | [0x77c2a57a…](https://explorer-studio.genlayer.com/tx/0x77c2a57a5d80daef1ea18335b92944a89dedd20328680174f712b0ceb49501f3) |
| 4 | ATTACKER | prompt-injection report on item 3 (key B is correct) claiming A | `ok` | PASS: executed {"id":1"ok":true} | [0x87882a79…](https://explorer-studio.genlayer.com/tx/0x87882a79fe85782da94879785d105f20e03ba058fd01fa515e3819251e19e161) |
| 5 | REPORTER | report on item 999999 (out of range: the source has no such row) | `ok` | PASS: executed {"id":2"ok":true} | [0x4da79a3b…](https://explorer-studio.genlayer.com/tx/0x4da79a3b20e41c4ee98d8fd68ac99749b7e1cbf0ccd2ddda4c4da0327782f0ae) |
| 6 | ATTACKER | duplicate report on item 77 while #77 is open | `bounce:already has an open` | PASS: executed {"error":"item 77 already has an open or accepted report (#0)""ok":false"refunded":500000000000000000} | [0xdaf2d72f…](https://explorer-studio.genlayer.com/tx/0xdaf2d72f1a0d5fdff54d98c5aa410d80fdb726c2711e3de2963e29557ba977d7) |
| 7 | ATTACKER | recover_stuck before the timeout | `revert:not stuck yet` | PASS: reverted not stuck yet: adjudication is still possible until 1791732746  | [0x93468cc9…](https://explorer-studio.genlayer.com/tx/0x93468cc91eb4d97620a51a110d84c1c2eb33b57c2d7e996b4dc2594507e986ab) |
| 8 | ATTACKER | withdraw_free on someone else's pool | `revert:only the pool owner` | PASS: reverted only the pool owner can withdraw  | [0xcfc1c61f…](https://explorer-studio.genlayer.com/tx/0xcfc1c61fb4f76aa19a4565de18e3553ffe9fa09098f091ded6735fa2e95f9ef9) |
| 9 | ATTACKER | withdraw the honest reporter's report | `revert:only the reporter` | PASS: reverted only the reporter can withdraw  | [0x1a6f3b20…](https://explorer-studio.genlayer.com/tx/0x1a6f3b2053da592bdf9a258507982084d2e6c8bcc26c4d80a13c77c6ead6dd98) |
| 10 | ATTACKER | adjudicate the honest report (anyone may) | `ok` | PASS: executed "UPHELD" | [0x8616d23b…](https://explorer-studio.genlayer.com/tx/0x8616d23bcee60743183c5f2d48bcf01122c370f2da3d026b1b707f07bfbc9dce) |
| 11 | OWNER | adjudicate the injection report | `ok` | PASS: executed "REJECTED" | [0x83fd6bff…](https://explorer-studio.genlayer.com/tx/0x83fd6bff4427e29f8d608b7eb95f4e7e679bfc837684a2549bd5014f14dfdcaa) |
| 12 | ATTACKER | adjudicate the out-of-range item (no consensus input: must revert) | `revert:empty` | PASS: reverted item could not be fetched or is empty  | [0x4f225a6f…](https://explorer-studio.genlayer.com/tx/0x4f225a6f9f7055aa2a46a863c88b226bca303f274821c6c58f6cd27178cc4a64) |
| 13 | REPORTER | withdraw after a verdict (front-running exit) | `revert:only PENDING` | PASS: reverted only PENDING reports can be withdrawn  | [0x53aac84e…](https://explorer-studio.genlayer.com/tx/0x53aac84eff7585e239239863180d94d48acc3facb6f42f7ee5fec4aa2e15f938) |
| 14 | ATTACKER | appeal a report that is not theirs | `revert:only the` | **FAIL**: reverted exit_code 1 Traceback (most recent call last): File "/py/libs/_genlayer_runner.py", line 180, in <module> _han | [0x66109d79…](https://explorer-studio.genlayer.com/tx/0x66109d7988136c2c25e74e25a97c247a8dfd45af613232ecd3dfd21187cc5a70) |
| 15 | ATTACKER | settle inside the review window | `revert:window still open` | **FAIL**: executed "PAID" | [0xafd5cc76…](https://explorer-studio.genlayer.com/tx/0xafd5cc76ef2d2e74cb41b466e0f5ff51c34b3f6a398a5d1280f7a98f1e1b313c) |
| 16 | OWNER | close the pool (refund free funds; in-flight reports still settle) | `ok` | PASS: executed null | [0x6c0cf0f2…](https://explorer-studio.genlayer.com/tx/0x6c0cf0f264d304b6b4fafa634af30d2ff1dac90486eff5b9b3f3033539666631) |
| 17 | ATTACKER | recover_stuck on the out-of-range report after the timeout (stake must go to the reporter) | `ok` | PASS: executed "EXPIRED" | [0x571298c6…](https://explorer-studio.genlayer.com/tx/0x571298c6c864f61f49d40bae3096ce793918502d0c06cdc056dda1e0e714b6ec) |
| 18 | ATTACKER | recover_stuck again (double refund) | `revert:only PENDING` | PASS: reverted report is EXPIRED; only PENDING reports can be recovered  | [0x638508f4…](https://explorer-studio.genlayer.com/tx/0x638508f40aaf4c55d20937d1b7434dc6027f28b3c854eec33d5c708dea103210) |
| 19 | ATTACKER | recover_stuck on an adjudicated report (dodge the forfeit) | `revert:only PENDING` | PASS: reverted report is REJECTED; only PENDING reports can be recovered  | [0x20988a7d…](https://explorer-studio.genlayer.com/tx/0x20988a7d1aee50144608699f64b3731b52f8b3c5f8786fc0cac4765a6a96bc10) |
| 20 | ATTACKER | settle the honest report | `ok` | **FAIL**: reverted report is PAID; only UPHELD or REJECTED reports settle  | [0xd20b1985…](https://explorer-studio.genlayer.com/tx/0xd20b198557720956a61fbbb7a6a84223c79afe4fc7b6cb9b01c3475c38642346) |
| 21 | OWNER | settle the injection report | `ok` | PASS: executed "FORFEITED" | [0xb7ee2aaa…](https://explorer-studio.genlayer.com/tx/0xb7ee2aaaa5229895bf9158a8e58904571b63a4a7741004200c82334bb86bda7a) |
| 22 | ATTACKER | settle again (double payout) | `revert:only UPHELD or REJECTED` | PASS: reverted report is PAID; only UPHELD or REJECTED reports settle  | [0xb3e3b6c5…](https://explorer-studio.genlayer.com/tx/0xb3e3b6c5cf3fa404d2f60afe54bc2eba04ad68788b1ffa243d4c9dae292f256a) |
| 23 | ATTACKER | withdraw_free on the closed pool | `revert:only the pool owner` | PASS: reverted only the pool owner can withdraw  | [0x126f3c91…](https://explorer-studio.genlayer.com/tx/0x126f3c91b8e11567109f3493fbe36a6db98ab61e9f3c62b6f055db5583e1d9a0) |
| 24 | OWNER | withdraw_free on the closed pool (forfeits + released rewards, 4.500 GEN) | `ok` | PASS: executed 4500000000000000000 | [0xe125bd8c…](https://explorer-studio.genlayer.com/tx/0xe125bd8c1e41fa0146d576a31a0f2b2744bb35424e9330ac004312f6d6c60fc7) |
| 25 | OWNER | withdraw_free again | `revert:nothing to withdraw` | PASS: reverted nothing to withdraw  | [0xf68bfd68…](https://explorer-studio.genlayer.com/tx/0xf68bfd68596d9f25fdf9ef3f632c8c8fe35e785d995843a54c989b1736dfa3e1) |

## Outcome

- report #0 item 77: **PAID** (verdict VALID, validators' answer C; A sudden global spread of an infectious disease is a pandemic. Endemic means consistently present in a region; epidemic is more localized, and zoonotic refers to animal-to-human transmission, not global spread.)
- report #1 item 3: **FORFEITED** (verdict INVALID, validators' answer B; The published key (B) is scientifically accurate. The incubation period is the time during which the virus replicates within the host before symptoms appear. Choice (A) is incorrect as clearing the virus would prevent disease progression.)
- report #2 item 999999: **EXPIRED** ([recovered] not adjudicated before the pool's timeout; stake refunded)
- injection text kept out of the judged item snapshot: true; the injected report was REJECTED
- balance change (GEN): owner -6.000, reporter 2.000, attacker -0.500
- contract native balance 4.500 GEN = liabilities 0.000 GEN: **MISMATCH**
- 22/25 expectations met, 4 failure(s)

Run 1 notes: 3 expectations failed because of bugs in this script, not in the contract: the stranger appeal was sent without its reason argument (arity error, not the access check); the 60 s window had already passed when "settle inside the window" was sent (so it legitimately paid out, and the later settle found it PAID); the solvency check read the balance 8 s after the last emitted transfer, before it finalized. Fixed in run 2 (longer window, reason argument, poll until transfers finalize).

# Adversarial end-to-end run 2: 2026-10-11T15:43:31.396Z

Contract [0xc1DA30D9bCdE724065EDa6B15f3d9b7D933e5C6E](https://explorer-studio.genlayer.com/address/0xc1DA30D9bCdE724065EDa6B15f3d9b7D933e5C6E) on GenLayer Studio, pool #1, reports #3-#5.
Window 240 s, adjudication timeout 300 s. Reporter and attacker are fresh in-memory keys funded by the Studio faucet.

| # | party | step | expected | result | tx |
|---|---|---|---|---|---|
| 1 | OWNER | create_pool (6 GEN, reward 2, min stake 0.5, window 240s, timeout 300s) | `ok` | PASS: executed {"id":1"ok":true} | [0xc7e23186…](https://explorer-studio.genlayer.com/tx/0xc7e2318617cda7b25c7ddfdc65841d90aacc5b492effa3561251019f0e93ef6b) |
| 2 | OWNER | owner reports into own pool (must be refused and refunded) | `bounce:pool owner cannot report` | PASS: executed {"error":"the pool owner cannot report into their own pool""ok":false"refunded":1000000000000000000} | [0xfab6890d…](https://explorer-studio.genlayer.com/tx/0xfab6890ddd9d2fa6c1dbbf3eb7004dcc2b1f058520f741d4ab0a85b41de06cc3) |
| 3 | REPORTER | honest erratum: item 77 key B (Endemic) should be C (Pandemic) | `ok` | PASS: executed {"id":3"ok":true} | [0x96df5b58…](https://explorer-studio.genlayer.com/tx/0x96df5b5866f3c5d393366c61374875768ec2636e210ba07a19d786409ba96c78) |
| 4 | ATTACKER | prompt-injection report on item 3 (key B is correct) claiming A | `ok` | PASS: executed {"id":4"ok":true} | [0x693c0b14…](https://explorer-studio.genlayer.com/tx/0x693c0b14f193d7e06a4a4b2b112a730b5d5fc33a105c9fe707c66c983c47af11) |
| 5 | REPORTER | report on item 999999 (out of range: the source has no such row) | `ok` | PASS: executed {"id":5"ok":true} | [0x73dcfa8c…](https://explorer-studio.genlayer.com/tx/0x73dcfa8c92c19be781d02173f9f5f556658ecd9d714203e823195857250d980f) |
| 6 | ATTACKER | duplicate report on item 77 while #77 is open | `bounce:already has an open` | PASS: executed {"error":"item 77 already has an open or accepted report (#3)""ok":false"refunded":500000000000000000} | [0x5350518b…](https://explorer-studio.genlayer.com/tx/0x5350518b9eb5009783c5f5cf225722b659551662498094bfbcfa637b46f58310) |
| 7 | ATTACKER | recover_stuck before the timeout | `revert:not stuck yet` | PASS: reverted not stuck yet: adjudication is still possible until 1791733236  | [0x5e3d2853…](https://explorer-studio.genlayer.com/tx/0x5e3d2853a78d13cbd75b0967a09673dc30a1136009a85629105e7fa2356ab0d4) |
| 8 | ATTACKER | withdraw_free on someone else's pool | `revert:only the pool owner` | PASS: reverted only the pool owner can withdraw  | [0x5cb8049d…](https://explorer-studio.genlayer.com/tx/0x5cb8049d488b0d273d51988fb8ee213aed44e49fbb77605fd3895e0e82c8087e) |
| 9 | ATTACKER | withdraw the honest reporter's report | `revert:only the reporter` | PASS: reverted only the reporter can withdraw  | [0xafb88275…](https://explorer-studio.genlayer.com/tx/0xafb8827506cb12bbfa03548e2d4f45c2ceb526091253f072fffc7a9b016ff59d) |
| 10 | ATTACKER | adjudicate the honest report (anyone may) | `ok` | PASS: executed "UPHELD" | [0x35886715…](https://explorer-studio.genlayer.com/tx/0x35886715031cac845d9684e5c794a39812e5ce1b4dd8fa847e1593152d11ff81) |
| 11 | OWNER | adjudicate the injection report | `ok` | PASS: executed "REJECTED" | [0xdd5295a8…](https://explorer-studio.genlayer.com/tx/0xdd5295a8343caa93fbe209d22c778415d99381822bf859a5aeadeaa074c32ac7) |
| 12 | ATTACKER | adjudicate the out-of-range item (no consensus input: must revert) | `revert:empty` | PASS: reverted item could not be fetched or is empty  | [0x137c63a2…](https://explorer-studio.genlayer.com/tx/0x137c63a27d670054d058f6ff5babb52340ec36ff48758e1f5993d829771f5f82) |
| 13 | REPORTER | withdraw after a verdict (front-running exit) | `revert:only PENDING` | PASS: reverted only PENDING reports can be withdrawn  | [0xec07f511…](https://explorer-studio.genlayer.com/tx/0xec07f511e950fee1ad901b19150199d1916b15c0b9efb98c49241df29842c624) |
| 14 | ATTACKER | appeal a report that is not theirs | `revert:only the` | PASS: reverted only the pool owner can appeal an upheld report  | [0xbdf30df5…](https://explorer-studio.genlayer.com/tx/0xbdf30df5489e586d9336db5b5bf1ca09ec2565c06fe8f2a745f1fc932cf237eb) |
| 15 | ATTACKER | settle inside the review window | `revert:window still open` | PASS: reverted review window still open  | [0xe03e6916…](https://explorer-studio.genlayer.com/tx/0xe03e69168ddf6460eccb92e5e8c14065490a6d4972ab9c1e5db46e9d98e444c3) |
| 16 | OWNER | close the pool (refund free funds; in-flight reports still settle) | `ok` | PASS: executed null | [0x4ff4da61…](https://explorer-studio.genlayer.com/tx/0x4ff4da61f9660314b30c4861a4bb677b0668285ae49085c244c0aee99c3f0059) |
| 17 | ATTACKER | recover_stuck on the out-of-range report after the timeout (stake must go to the reporter) | `ok` | PASS: executed "EXPIRED" | [0xa0faa6d5…](https://explorer-studio.genlayer.com/tx/0xa0faa6d57aa307bc38412ea2e832e94e19a177c6d6c9e8c8bd973e17b406a292) |
| 18 | ATTACKER | recover_stuck again (double refund) | `revert:only PENDING` | PASS: reverted report is EXPIRED; only PENDING reports can be recovered  | [0xef0dad97…](https://explorer-studio.genlayer.com/tx/0xef0dad9726be60c904c1a14c50cd3526bf8c051100f3319ef2b0f594717f1230) |
| 19 | ATTACKER | recover_stuck on an adjudicated report (dodge the forfeit) | `revert:only PENDING` | PASS: reverted report is REJECTED; only PENDING reports can be recovered  | [0xdd7b8030…](https://explorer-studio.genlayer.com/tx/0xdd7b80303fe63d4cf0380f8168c0960be74bae70c93abb7c4aa4e1dbe0c0f608) |
| 20 | ATTACKER | settle the honest report | `ok` | PASS: executed "PAID" | [0xb0ca0aa0…](https://explorer-studio.genlayer.com/tx/0xb0ca0aa02af7653585d7bc0ed0ecc34c8035c4d077cc73922c1e58968b8b2d89) |
| 21 | OWNER | settle the injection report | `ok` | PASS: executed "FORFEITED" | [0x2746ba8e…](https://explorer-studio.genlayer.com/tx/0x2746ba8e74a9eb21b96c9f2dc71138fc142ea80900ab4605fc655bbbd28bac2b) |
| 22 | ATTACKER | settle again (double payout) | `revert:only UPHELD or REJECTED` | PASS: reverted report is PAID; only UPHELD or REJECTED reports settle  | [0xc998357d…](https://explorer-studio.genlayer.com/tx/0xc998357d0bea995e8b111f0ee9217fc7ba0a3895b9a10d1977ec74db45b0f1bb) |
| 23 | ATTACKER | withdraw_free on the closed pool | `revert:only the pool owner` | PASS: reverted only the pool owner can withdraw  | [0x7fb9e595…](https://explorer-studio.genlayer.com/tx/0x7fb9e595d9700819631726e1507ce6fe64230d78e8f5cc0e66407e2dcac393e0) |
| 24 | OWNER | withdraw_free on the closed pool (forfeits + released rewards, 4.500 GEN) | `ok` | PASS: executed 4500000000000000000 | [0x513fb114…](https://explorer-studio.genlayer.com/tx/0x513fb1144713e754f848c90aee1cb4da6c4f1d2a66eef55396403458eaf8270c) |
| 25 | OWNER | withdraw_free again | `revert:nothing to withdraw` | PASS: reverted nothing to withdraw  | [0xcd728d56…](https://explorer-studio.genlayer.com/tx/0xcd728d5623ada69114ef7318ad1db689d43c7a3e675abc36b64a4b84219b0ac6) |

## Outcome

- report #3 item 77: **PAID** (verdict VALID, validators' answer C; A pandemic is a disease that spreads globally across continents. Endemic means constant presence in a region. The published key B (Endemic) is clearly wrong; C (Pandemic) is correct.)
- report #4 item 3: **FORFEITED** (verdict INVALID; The 'incubation period' is the time between exposure and symptom onset; during this period viruses typically replicate intracellularly. Choice A describes viral clearance, not incubation. The published key is defensible.)
- report #5 item 999999: **EXPIRED** ([recovered] not adjudicated before the pool's timeout; stake refunded)
- injection text kept out of the judged item snapshot: true; the injected report was REJECTED
- balance change (GEN): owner -1.500, reporter 2.000, attacker -0.500
- contract native balance 0.000 GEN = liabilities 0.000 GEN: **solvent**
- 25/25 expectations met
