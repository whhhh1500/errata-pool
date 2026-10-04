import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = str(ROOT / "contracts" / "errata_pool.py")
FIX = ROOT / "tests" / "fixtures"
TEMPLATE = "https://datasets-server.huggingface.co/rows?dataset=cais%2Fmmlu&config=virology&split=test&offset={id}&length=1"
GEN = 10**18


def verdict(v: str, choice: str = "", reason: str = "mock") -> str:
    return json.dumps({"verdict": v, "correct_choice": choice, "reason": reason})


@pytest.fixture
def pool_c(direct_deploy):
    return direct_deploy(CONTRACT)


@pytest.fixture
def judge(direct_vm):
    """judge('VALID', 'C') -> serve MMLU item 77 and make the LLM return that verdict."""

    def _judge(v: str, choice: str = "", body: str | None = None, status: int = 200):
        direct_vm.clear_mocks()
        direct_vm.mock_web(r"datasets-server\.huggingface\.co", {"status": status, "body": body if body is not None else (FIX / "mmlu_77.json").read_text()})
        direct_vm.mock_web(r"wikipedia\.org", {"status": 200, "body": "<html><body><p>A pandemic is an epidemic that has spread across a large region.</p></body></html>"})
        direct_vm.mock_llm(r"erratum report", verdict(v, choice))

    return _judge
