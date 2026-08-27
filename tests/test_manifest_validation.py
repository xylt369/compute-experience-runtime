from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "bridge"))
from model_runner import validate_manifest  # noqa: E402


def base_manifest():
    return {
        "id": "x-model",
        "name": "X",
        "description": "test",
        "version": "0.1.0",
        "renderer": "test",
        "state": ["x"],
        "parameters": [
            {"id": "gain", "label": "Gain", "type": "number", "default": 1, "min": 0, "max": 2, "step": 0.1}
        ],
    }


def test_manifest_accepts_valid_number_parameter():
    validate_manifest(base_manifest())


def test_manifest_rejects_duplicate_parameter_ids():
    manifest = base_manifest()
    manifest["parameters"].append(dict(manifest["parameters"][0]))
    try:
        validate_manifest(manifest)
    except ValueError as exc:
        assert "duplicate" in str(exc)
    else:
        raise AssertionError("duplicate parameter ids must fail")
