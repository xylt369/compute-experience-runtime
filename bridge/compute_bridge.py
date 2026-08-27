#!/usr/bin/env python3
"""Small deterministic NDJSON bridge for Compute Experience models.

Protocol input:
  {"type":"init","model":"simple-pendulum","parameters":{...},"steps":120,"dt":0.016}

Output:
  {"type":"manifest", ...}
  {"type":"state","t":...,"state":{...},"derived":{...}}

Only registered, explicit model adapters can execute. There is no eval/exec of
incoming source code.
"""
from __future__ import annotations
import json
import math
import sys
from dataclasses import dataclass
from typing import Any, Iterator, Protocol


class ModelAdapter(Protocol):
    def manifest(self) -> dict[str, Any]: ...
    def frames(self, steps: int, dt: float) -> Iterator[dict[str, Any]]: ...


@dataclass
class Pendulum:
    gravity: float = 9.8
    length: float = 1.6
    angle_deg: float = 28.0

    def manifest(self) -> dict[str, Any]:
        return {
            "id": "simple-pendulum",
            "name": "Simple pendulum",
            "description": "Deterministic small-angle pendulum model.",
            "parameters": [
                {"id":"gravity","label":"Gravity","type":"number","min":1,"max":20,"step":0.1,"default":9.8,"unit":"m/s²"},
                {"id":"length","label":"Length","type":"number","min":0.5,"max":3,"step":0.1,"default":1.6,"unit":"m"},
                {"id":"angle","label":"Initial angle","type":"number","min":5,"max":80,"step":1,"default":28,"unit":"deg"},
            ],
            "state": ["angle","angularVelocity"],
            "derived": ["period","angularFrequency"],
            "runtime": {"mode":"deterministic", "version":2}
        }

    def frames(self, steps: int, dt: float) -> Iterator[dict[str, Any]]:
        omega = math.sqrt(max(self.gravity, 1e-9) / max(self.length, 1e-9))
        theta0 = math.radians(self.angle_deg)
        period = 2 * math.pi / omega
        for i in range(steps):
            t = i * dt
            theta = theta0 * math.cos(omega * t)
            angular_velocity = -theta0 * omega * math.sin(omega * t)
            yield {"type":"state","t":t,"state":{"angle":theta,"angularVelocity":angular_velocity},"derived":{"period":period,"angularFrequency":omega}}


@dataclass
class SIR:
    population: float = 1000
    contact_rate: float = 0.55
    recovery_rate: float = 0.12
    initial_infected: float = 10

    def manifest(self) -> dict[str, Any]:
        return {
            "id":"sir-epidemic",
            "name":"SIR epidemic",
            "description":"A deterministic compartment model for susceptible, infected, and recovered populations.",
            "parameters":[
                {"id":"population","label":"Population","type":"number","min":100,"max":1000000,"step":100,"default":1000,"unit":"people"},
                {"id":"contactRate","label":"Contact rate","type":"number","min":0.0,"max":2.0,"step":0.01,"default":0.55,"unit":"1/day"},
                {"id":"recoveryRate","label":"Recovery rate","type":"number","min":0.01,"max":1.0,"step":0.01,"default":0.12,"unit":"1/day"},
                {"id":"initialInfected","label":"Initial infected","type":"number","min":1,"max":500,"step":1,"default":10,"unit":"people"},
            ],
            "state":["susceptible","infected","recovered"],
            "derived":["infectedFraction","reproductionNumber","peakRisk"],
            "runtime":{"mode":"deterministic","version":2}
        }

    def frames(self, steps: int, dt: float) -> Iterator[dict[str, Any]]:
        n = max(1.0, self.population)
        beta = max(0.0, self.contact_rate)
        gamma = max(0.0, self.recovery_rate)
        s = n - min(n, max(0.0, self.initial_infected))
        i = min(n, max(0.0, self.initial_infected))
        r = 0.0
        R0 = beta / gamma if gamma else math.inf
        for k in range(steps):
            t = k * dt
            yield {
                "type":"state","t":t,
                "state":{"susceptible":s,"infected":i,"recovered":r},
                "derived":{"infectedFraction":i/n,"reproductionNumber":R0,"peakRisk":beta*i/n}
            }
            new_infections = beta * s * i / n
            recoveries = gamma * i
            s = max(0.0, s - new_infections * dt)
            i = max(0.0, i + (new_infections - recoveries) * dt)
            r = min(n, max(0.0, r + recoveries * dt))


def make_model(model_id: str, params: dict[str, Any]) -> ModelAdapter:
    if model_id == "simple-pendulum":
        return Pendulum(
            gravity=float(params.get("gravity",9.8)),
            length=float(params.get("length",1.6)),
            angle_deg=float(params.get("angle",28.0)),
        )
    if model_id == "sir-epidemic":
        return SIR(
            population=float(params.get("population",1000)),
            contact_rate=float(params.get("contactRate",0.55)),
            recovery_rate=float(params.get("recoveryRate",0.12)),
            initial_infected=float(params.get("initialInfected",10)),
        )
    raise ValueError(f"unknown model: {model_id}")


def main() -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
            if message.get("type") != "init":
                raise ValueError("expected init")
            model_id = str(message.get("model", "simple-pendulum"))
            model = make_model(model_id, message.get("parameters") or {})
            steps = max(1, min(int(message.get("steps",120)), 10000))
            dt = max(0.001, min(float(message.get("dt",0.016)), 1.0))
            print(json.dumps({"type":"manifest", **model.manifest()}, separators=(",",":")), flush=True)
            for frame in model.frames(steps, dt):
                print(json.dumps(frame, separators=(",",":")), flush=True)
        except Exception as exc:
            print(json.dumps({"type":"error","message":str(exc)}, separators=(",",":")), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
