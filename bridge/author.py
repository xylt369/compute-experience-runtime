from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from model_runner import load_model, simulate


def main() -> int:
    parser = argparse.ArgumentParser(description="Run an authored Compute Experience model")
    parser.add_argument("model")
    parser.add_argument("--parameters", default="{}")
    parser.add_argument("--steps", type=int, default=240)
    parser.add_argument("--dt", type=float, default=0.01)
    args = parser.parse_args()

    module = load_model(args.model)
    parameters = json.loads(args.parameters)
    print(json.dumps({"type": "manifest", "manifest": module.MANIFEST}))
    for frame in simulate(module, parameters, args.steps, args.dt):
        print(json.dumps({"type": "state", **frame}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"type": "error", "error": str(exc)}), file=sys.stderr)
        raise
