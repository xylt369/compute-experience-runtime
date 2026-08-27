import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = ROOT / "bridge" / "compute_bridge.py"

def test_bridge_emits_manifest_and_frames():
    p = subprocess.run(
        ["python", str(BRIDGE)],
        input=json.dumps({"type":"init","parameters":{"gravity":9.8,"length":1.6,"angle":28},"steps":3,"dt":0.1}) + "\n",
        text=True,
        capture_output=True,
        check=True,
    )
    rows = [json.loads(x) for x in p.stdout.splitlines() if x.strip()]
    assert rows[0]["type"] == "manifest"
    frames = [x for x in rows if x["type"] == "state"]
    assert len(frames) == 3
    assert frames[0]["derived"]["period"] > 0


def test_bridge_supports_second_qualitatively_different_model():
    p = subprocess.run(
        ["python", str(BRIDGE)],
        input=json.dumps({"type":"init","model":"sir-epidemic","parameters":{"population":1000,"contactRate":0.55,"recoveryRate":0.12,"initialInfected":10},"steps":4,"dt":0.25}) + "\n",
        text=True,
        capture_output=True,
        check=True,
    )
    rows = [json.loads(x) for x in p.stdout.splitlines() if x.strip()]
    assert rows[0]["type"] == "manifest"
    assert rows[0]["id"] == "sir-epidemic"
    frames = [x for x in rows if x["type"] == "state"]
    assert len(frames) == 4
    assert frames[-1]["state"]["susceptible"] < frames[0]["state"]["susceptible"]
    assert frames[-1]["state"]["recovered"] > frames[0]["state"]["recovered"]
