import json
import os
from pathlib import Path
import subprocess


PDF = Path("output/pdf/codex-production-application-workflow-zh.pdf")
BUNDLED_PYTHON = Path(
    "C:/Users/Administrator/.cache/codex-runtimes/"
    "codex-primary-runtime/dependencies/python/python.exe"
)


def test_generated_handbook_is_structurally_complete() -> None:
    assert PDF.exists()
    assert PDF.stat().st_size > 100_000

    assert BUNDLED_PYTHON.exists()
    result = subprocess.run(
        [
            str(BUNDLED_PYTHON),
            "-c",
            (
                "import json, pdfplumber, sys; "
                "d=pdfplumber.open(sys.argv[1]); "
                "print(json.dumps({'pages':len(d.pages),"
                "'text':'\\n'.join((p.extract_text() or '') for p in d.pages)},"
                "ensure_ascii=False)); d.close()"
            ),
            str(PDF),
        ],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    document = json.loads(result.stdout)
    assert 25 <= document["pages"] <= 50
    text = document["text"]
    for phrase in (
        "生产级交付",
        "端到端工作流",
        "AGENTS.md",
        "安全",
        "回滚",
        "生产就绪检查清单",
        "官方参考资料",
    ):
        assert phrase in text


if __name__ == "__main__":
    test_generated_handbook_is_structurally_complete()
    print("PDF structural check passed")
