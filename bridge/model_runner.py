from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from typing import Any


def load_model(path: str):
    p = Path(path).resolve()
    spec = spec_from_file_location(p.stem, p)
    if spec is None or spec.loader is None:
        raise ValueError(f"Cannot load model module: {p}")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    required = ["MANIFEST", "initial", "step"]
    missing = [name for name in required if not hasattr(module, name)]
    if missing:
        raise ValueError(f"Model missing required exports: {', '.join(missing)}")
    return module


def validate_manifest(manifest: dict[str, Any]) -> None:
    required = ["id", "name", "description", "version", "parameters", "state", "renderer"]
    missing = [key for key in required if key not in manifest]
    if missing:
        raise ValueError(f"Manifest missing required fields: {', '.join(missing)}")
    ids = set()
    for p in manifest["parameters"]:
        pid = p.get("id")
        if not pid or pid in ids:
            raise ValueError(f"Invalid or duplicate parameter id: {pid}")
        ids.add(pid)
        ptype = p.get("type")
        if ptype == "number":
            for key in ("min", "max", "step"):
                if key not in p:
                    raise ValueError(f"Number parameter {pid} missing {key}")
        elif ptype == "enum" and not p.get("options"):
            raise ValueError(f"Enum parameter {pid} needs options")
        elif ptype not in {"number", "boolean", "enum"}:
            raise ValueError(f"Unsupported parameter type: {ptype}")


def simulate(module, parameters: dict[str, Any], steps: int, dt: float) -> list[dict[str, Any]]:
    if steps < 1:
        raise ValueError("steps must be >= 1")
    if dt <= 0:
        raise ValueError("dt must be > 0")
    validate_manifest(module.MANIFEST)
    state = dict(module.initial(parameters))
    frames = []
    for i in range(steps):
        derived = dict(module.derive(state, parameters)) if hasattr(module, "derive") else {}
        frames.append({"t": i * dt, "state": dict(state), "derived": derived})
        state = dict(module.step(state, parameters, dt))
    return frames
