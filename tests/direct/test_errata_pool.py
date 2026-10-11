import json

import pytest

from conftest import FIX, GEN, TEMPLATE

RULES = "Report items whose answer key is wrong. Use current textbook definitions."


def _hex(addr) -> str:
    if hasattr(addr, "as_hex"):
        return addr.as_hex.lower()
    if isinstance(addr, (bytes, bytearray)):
        return "0x" + bytes(addr).hex()
    return str(addr).lower()


def mk_pool(vm, c, owner, funds=10 * GEN, reward=2 * GEN, stake=GEN // 2, window=3600, timeout=86400):
    vm.sender = owner
    vm.value = funds
    res = c.create_pool("MMLU virology", TEMPLATE, RULES, reward, stake, window, timeout)
    vm.value = 0
    assert res["ok"], res
    return res["id"]


def file(vm, c, who, pid=0, item="77", kind="wrong_answer", proposed="C", stake=GEN // 2, evidence="https://en.wikipedia.org/wiki/Pandemic"):
    vm.sender = who
    vm.value = stake
    res = c.file_report(pid, item, kind, proposed, "Key should be C) Pandemic", "Global spread defines a pandemic; endemic means constant local presence.", evidence)
    vm.value = 0
    if not res["ok"]:
        raise AssertionError(res["error"])
    return res["id"]


def bounced(res, msg):
    assert res["ok"] is False and msg in res["error"] and res["refunded"] > 0, res


def test_empty_state(pool_c):
    assert pool_c.get_stats() == {"pools": 0, "reports": 0, "total_paid": 0, "total_forfeited": 0, "total_bounced": 0, "total_recovered": 0,
                                    "total_void": 0, "total_credits": 0, "total_claimed": 0}
    assert pool_c.list_pools() == []


def test_create_pool_validation_refunds_instead_of_reverting(direct_vm, pool_c, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = GEN
    bounced(pool_c.create_pool("x", "https://h/no-placeholder", "", GEN, 0, 60, 3600), "containing {id}")
    bounced(pool_c.create_pool("x", "ftp://h/{id}", "", GEN, 0, 60, 3600), "containing {id}")
    bounced(pool_c.create_pool("x", TEMPLATE, "", 2 * GEN, 0, 60, 3600), "at least one reward")
    bounced(pool_c.create_pool("x", TEMPLATE, "", 0, 0, 60, 3600), "reward must be")
    bounced(pool_c.create_pool("x", TEMPLATE, "", GEN, 0, 10**8, 3600), "review window")
    bounced(pool_c.create_pool("  ", TEMPLATE, "", GEN, 0, 60, 3600), "name the pool")
    bounced(pool_c.create_pool("x", TEMPLATE, "", GEN, 0, 60, 30), "adjudication timeout")
    assert pool_c.get_stats()["pools"] == 0 and pool_c.get_stats()["total_bounced"] == 7 * GEN
    direct_vm.value = 0
    with direct_vm.expect_revert("at least one reward"):  # zero-value calls revert normally
        pool_c.create_pool("x", TEMPLATE, "", GEN, 0, 60, 3600)


def test_file_report_validation_and_reservation(direct_vm, pool_c, direct_alice, direct_bob):
    pid = mk_pool(direct_vm, pool_c, direct_alice, funds=3 * GEN)
    direct_vm.sender = direct_alice
    direct_vm.value = GEN // 2
    fr = pool_c.file_report
    bounced(fr(pid, "77", "wrong_answer", "C", "", "long enough reason", ""), "pool owner cannot report")
    direct_vm.sender = direct_bob
    bounced(fr(9, "77", "wrong_answer", "C", "", "long enough reason", ""), "no such pool")
    bounced(fr(pid, "1&length=100", "wrong_answer", "C", "", "long enough reason", ""), "item id")
    bounced(fr(pid, "77", "typo", "C", "", "long enough reason", ""), "kind must be")
    bounced(fr(pid, "77", "wrong_answer", "", "", "long enough reason", ""), "choice letter")
    bounced(fr(pid, "77", "wrong_answer", "C", "", "short", ""), "explain the error")
    bounced(fr(pid, "77", "wrong_answer", "C", "", "long enough reason", "javascript:alert(1)"), "evidence must be")
    direct_vm.value = GEN // 4
    bounced(fr(pid, "77", "wrong_answer", "C", "", "long enough reason", ""), "below the pool's minimum")
    direct_vm.value = 0
    assert pool_c.get_pool(pid)["reports"] == 0 and pool_c.get_pool(pid)["balance"] == 3 * GEN
    rid = file(direct_vm, pool_c, direct_bob)
    p = pool_c.get_pool(pid)
    assert p["balance"] == 1 * GEN and p["reserved"] == 2 * GEN and p["reports"] == 1
    r = pool_c.get_report(rid)
    assert r["status"] == "PENDING" and r["item_url"].endswith("offset=77&length=1") and r["proposed"] == "C"
    with pytest.raises(AssertionError, match="already has an open or accepted report"):
        file(direct_vm, pool_c, direct_bob)
    with pytest.raises(AssertionError, match="cannot cover another reward"):
        file(direct_vm, pool_c, direct_bob, item="78")


def test_upheld_erratum_pays_and_is_listed(direct_vm, pool_c, judge, direct_alice, direct_bob):
    direct_vm.warp("2026-10-04T08:00:00Z")
    pid = mk_pool(direct_vm, pool_c, direct_alice)
    rid = file(direct_vm, pool_c, direct_bob)
    judge("VALID", "C")
    assert pool_c.adjudicate(rid) == "UPHELD"
    r = pool_c.get_report(rid)
    assert r["published_key"] == "B" and r["correct_choice"] == "C" and len(r["item_hash"]) == 64
    assert "Published answer key: B) Endemic" in r["item_text"]
    with direct_vm.expect_revert("review window still open"):
        pool_c.settle(rid)
    direct_vm.warp("2026-10-04T09:00:01Z")
    assert pool_c.settle(rid) == "PAID"
    p = pool_c.get_pool(pid)
    assert p["errata"] == 1 and p["paid"] == 2 * GEN and p["reserved"] == 0 and p["balance"] == 8 * GEN
    errata = pool_c.get_errata(pid)
    assert errata == [{"report_id": rid, "item_id": "77", "kind": "wrong_answer", "published_key": "B", "corrected_key": "C",
                       "fix": "Key should be C) Pandemic", "reason": "mock", "item_hash": r["item_hash"], "appealed": False}]
    assert pool_c.get_stats()["total_paid"] == 2 * GEN
    assert pool_c.get_credit(_hex(direct_bob)) == 2 * GEN + GEN // 2  # v0.3: pull payment
    assert pool_c.get_report(rid)["final"] and pool_c.get_report(rid)["finalized_at"] > 0
    with pytest.raises(AssertionError, match="already has an open or accepted report"):
        file(direct_vm, pool_c, direct_bob)  # an accepted item is never paid twice


def test_rejected_report_forfeits_stake_into_pool_and_item_reopens(direct_vm, pool_c, judge, direct_alice, direct_bob, direct_charlie):
    pid = mk_pool(direct_vm, pool_c, direct_alice, window=0)
    rid = file(direct_vm, pool_c, direct_bob, proposed="A")
    judge("INVALID", "C")
    assert pool_c.adjudicate(rid) == "REJECTED"
    assert pool_c.settle(rid) == "FORFEITED"  # window 0 -> final at once
    p = pool_c.get_pool(pid)
    assert p["balance"] == 10 * GEN + GEN // 2 and p["reserved"] == 0
    assert pool_c.get_stats()["total_forfeited"] == GEN // 2
    rid2 = file(direct_vm, pool_c, direct_charlie)  # the same item can be reported again
    assert pool_c.get_report(rid2)["status"] == "PENDING"


def test_llm_valid_but_wrong_proposed_choice_is_rejected(direct_vm, pool_c, judge, direct_alice, direct_bob):
    mk_pool(direct_vm, pool_c, direct_alice)
    rid = file(direct_vm, pool_c, direct_bob, proposed="D")
    judge("VALID", "C")
    assert pool_c.adjudicate(rid) == "REJECTED"
    assert pool_c.get_report(rid)["reason"].startswith("[rule]")


def test_owner_appeal_overturns_and_uses_snapshot(direct_vm, pool_c, judge, direct_alice, direct_bob):
    direct_vm.warp("2026-10-04T08:00:00Z")
    pid = mk_pool(direct_vm, pool_c, direct_alice)
    rid = file(direct_vm, pool_c, direct_bob)
    judge("VALID", "C")
    pool_c.adjudicate(rid)
    snap = pool_c.get_report(rid)["item_hash"]
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only the pool owner"):
        pool_c.appeal(rid, "reporter cannot appeal a win")
    # upstream silently patches the item and goes offline: the appeal must still judge the snapshot
    judge("INVALID", "", status=404)
    direct_vm.sender = direct_alice
    assert pool_c.appeal(rid, "Endemic is the intended answer in our source textbook") == "REJECTED"
    r = pool_c.get_report(rid)
    assert r["appealed"] and r["first_verdict"] == "VALID" and r["verdict"] == "INVALID" and r["item_hash"] == snap
    assert r["appeal_by"].lower() == _hex(direct_alice)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("already appealed once"):
        pool_c.appeal(rid, "second appeal not allowed")  # one appeal per report, whoever filed it
    assert pool_c.settle(rid) == "FORFEITED"  # appealed -> final immediately
    assert pool_c.get_pool(pid)["errata"] == 0


def test_reporter_appeal_can_win(direct_vm, pool_c, judge, direct_alice, direct_bob):
    direct_vm.warp("2026-10-04T08:00:00Z")
    pid = mk_pool(direct_vm, pool_c, direct_alice)
    rid = file(direct_vm, pool_c, direct_bob)
    judge("INVALID")
    pool_c.adjudicate(rid)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("only the reporter"):
        pool_c.appeal(rid, "owner cannot appeal a rejection")
    judge("VALID", "C")
    direct_vm.sender = direct_bob
    assert pool_c.appeal(rid, "WHO defines a pandemic as worldwide spread") == "UPHELD"
    assert pool_c.settle(rid) == "PAID"
    assert pool_c.get_errata(pid)[0]["appealed"] is True


def test_appeal_window_enforced(direct_vm, pool_c, judge, direct_alice, direct_bob):
    direct_vm.warp("2026-10-04T08:00:00Z")
    mk_pool(direct_vm, pool_c, direct_alice, window=600)
    rid = file(direct_vm, pool_c, direct_bob)
    judge("VALID", "C")
    pool_c.adjudicate(rid)
    direct_vm.warp("2026-10-04T08:20:00Z")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("review window is over"):
        pool_c.appeal(rid, "too late for this")


def test_fetch_failure_keeps_report_pending(direct_vm, pool_c, judge, direct_alice, direct_bob):
    mk_pool(direct_vm, pool_c, direct_alice)
    rid = file(direct_vm, pool_c, direct_bob)
    judge("VALID", "C", status=503)
    with direct_vm.expect_revert("HTTP 503"):
        pool_c.adjudicate(rid)
    assert pool_c.get_report(rid)["status"] == "PENDING"


def test_withdraw_pending_report(direct_vm, pool_c, direct_alice, direct_bob, direct_charlie):
    pid = mk_pool(direct_vm, pool_c, direct_alice)
    rid = file(direct_vm, pool_c, direct_bob)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only the reporter"):
        pool_c.withdraw_report(rid)
    direct_vm.sender = direct_bob
    pool_c.withdraw_report(rid)
    assert pool_c.get_report(rid)["status"] == "WITHDRAWN"
    assert pool_c.get_pool(pid)["balance"] == 10 * GEN and pool_c.get_pool(pid)["reserved"] == 0
    file(direct_vm, pool_c, direct_bob)  # item is free again


def test_close_pool_refunds_unreserved_and_in_flight_report_still_settles(direct_vm, pool_c, judge, direct_alice, direct_bob):
    pid = mk_pool(direct_vm, pool_c, direct_alice, window=0)
    rid = file(direct_vm, pool_c, direct_bob)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only the pool owner"):
        pool_c.close_pool(pid)
    direct_vm.sender = direct_alice
    pool_c.close_pool(pid)
    p = pool_c.get_pool(pid)
    assert p["open"] is False and p["balance"] == 0 and p["reserved"] == 2 * GEN
    with pytest.raises(AssertionError, match="pool is closed"):
        file(direct_vm, pool_c, direct_bob, item="5")
    judge("VALID", "C")
    pool_c.adjudicate(rid)
    assert pool_c.settle(rid) == "PAID"


def test_fund_pool_and_list_views(direct_vm, pool_c, direct_alice, direct_bob):
    pid = mk_pool(direct_vm, pool_c, direct_alice)
    direct_vm.sender = direct_bob
    direct_vm.value = 3 * GEN
    assert pool_c.fund_pool(pid)["ok"]
    bounced(pool_c.fund_pool(7), "no such pool")
    direct_vm.value = 0
    assert pool_c.get_pool(pid)["balance"] == 13 * GEN
    mk_pool(direct_vm, pool_c, direct_alice)
    file(direct_vm, pool_c, direct_bob, pid=1, item="3")
    assert [p["id"] for p in pool_c.list_pools()] == [0, 1]
    assert len(pool_c.list_reports(1)) == 1 and pool_c.list_reports(0) == [] and len(pool_c.list_reports(-1)) == 1
    assert pool_c.get_errata(0) == []
    liab = pool_c.get_liabilities()
    assert liab == {"pools": 13 * GEN + 10 * GEN, "stakes": GEN // 2, "credits": 0, "total": 23 * GEN + GEN // 2}


def test_bad_llm_output_reverts(direct_vm, pool_c, judge, direct_alice, direct_bob):
    mk_pool(direct_vm, pool_c, direct_alice)
    rid = file(direct_vm, pool_c, direct_bob)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r"datasets-server", {"status": 200, "body": (FIX / "mmlu_77.json").read_text()})
    direct_vm.mock_llm(r"erratum report", json.dumps({"verdict": "PROBABLY"}))
    with direct_vm.expect_revert():
        pool_c.adjudicate(rid)


def test_validator_checks_fingerprint_verdict_and_choice(direct_vm, pool_c, judge, direct_alice, direct_bob):
    mk_pool(direct_vm, pool_c, direct_alice)
    rid = file(direct_vm, pool_c, direct_bob)
    judge("VALID", "C")
    pool_c.adjudicate(rid)
    judge("VALID", "C")
    assert direct_vm.run_validator() is True
    judge("INVALID")  # different verdict
    assert direct_vm.run_validator() is False
    other = (FIX / "mmlu_77.json").read_text().replace('"answer":1', '"answer":2')
    judge("VALID", "C", body=other)  # validator sees a different item (fingerprint differs)
    assert direct_vm.run_validator() is False
