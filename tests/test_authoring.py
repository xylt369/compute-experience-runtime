import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_lorenz_authoring_protocol():
    cmd = [
        sys.executable,
        "bridge/author.py",
        "examples/lorenz_model.py",
        "--parameters",
        json.dumps({"sigma": 10.0, "rho": 28.0, "beta": 8.0 / 3.0}),
        "--steps",
        "5",
        "--dt",
        "0.01",
    ]
    result = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, check=True)
    lines = [json.loads(line) for line in result.stdout.splitlines()]
    assert lines[0]["type"] == "manifest"
    assert lines[0]["manifest"]["id"] == "lorenz-attractor"
    assert len(lines[1:]) == 5
    assert lines[3]["state"]["y"] != lines[1]["state"]["y"]
