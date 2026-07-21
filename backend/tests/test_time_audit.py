from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1] / "app"
ALLOWED = {
    "core/clock.py",
}
PATTERNS = [
    re.compile(r"datetime\.now\("),
    re.compile(r"datetime\.utcnow\("),
    re.compile(r"datetime\.today\("),
    re.compile(r"timezone\.utc"),
    re.compile(r"replace\(tzinfo"),
    re.compile(r"astimezone\("),
]


def test_backend_time_uses_clock_service():
    offenders = []
    for path in ROOT.rglob("*.py"):
        rel = path.relative_to(ROOT).as_posix()
        if rel in ALLOWED:
            continue
        source = path.read_text(encoding="utf-8")
        for pattern in PATTERNS:
            if pattern.search(source):
                offenders.append(f"{rel}: {pattern.pattern}")

    assert offenders == []
