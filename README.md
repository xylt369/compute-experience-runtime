# Compute Experience

> Turn computation into an interactive experience.

Compute Experience is an experimental, open runtime for making computational models feel like **objects you can inspect, manipulate, replay, and share** rather than static charts or notebook outputs.

## Current proof

The same manifest/state contract now drives two different chaotic dynamical systems:

- `lorenz-attractor`
- `rossler-attractor`

The browser experience is manifest-driven: parameter controls come from the manifest, state is replayed through a runtime player, and a renderer is selected by `renderer` rather than hard-coded to a model implementation.

## Authoring protocol

A model author supplies:

```python
MANIFEST = {...}

def initial(parameters): ...
def step(state, parameters, dt): ...
def derive(state, parameters): ...  # optional
```

Run an authored model as NDJSON:

```bash
python bridge/author.py examples/rossler_model.py \
  --parameters '{"a":0.2,"b":0.2,"c":5.7}' \
  --steps 520 --dt 0.03
```

The runtime schema lives in `runtime/authoring.schema.json`.

## Run tests

```bash
python -m pytest -q
```

## Architecture

```text
model source
    ↓
manifest + state model
    ↓
validator / adapter
    ↓
state frames
    ↓
runtime player
    ↓
renderer registry
    ↓
interactive experience
```

The key boundary is:

```text
Model ≠ Experience
```

A model owns computation and state transitions. The runtime owns playback and interaction contracts. A renderer owns how state becomes understandable.

## Product thesis

`model → state → interaction → experience`

Not:

`code → chart`

## Deliberate non-goals

- generic AI app builder
- chat UI
- generic dashboard generator
- arbitrary untrusted code execution
- cloud platform
- a full 3D engine

## What this milestone proves

A third-party model can be authored without writing the experience UI. The Rössler example is deliberately independent from the original Lorenz implementation while reusing the same runtime contract.
