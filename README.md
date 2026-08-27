# Compute Experience

> Turn computation into an interactive experience.

Compute Experience is an experimental runtime for making computational models feel like **objects you can inspect, manipulate, replay, and share** rather than static charts or notebook outputs.

The central boundary is:

```text
Model ≠ Experience
```

A model owns computation and state transitions. The runtime owns playback and interaction. A renderer owns how state becomes understandable.

## What this demo is

The page is a static instrument. It computes **in the browser** from four JavaScript models that follow the same `{manifest, initial, step, derive}` contract as the Python examples. Switching models only changes the catalog entry; the shell asks the manifest for a renderer name.

| Model | Renderer |
| --- | --- |
| Lorenz attractor | `trajectory-3d` |
| Rössler attractor | `trajectory-3d` |
| Simple pendulum (nonlinear ODE) | `pendulum-2d` |
| SIR epidemic | `timeseries-2d` |

Python under `examples/` and `bridge/` is the **authoring protocol**, not the live compute backend for this demo. Precomputed JSON files can be imported as a recorded snapshot; they are not required to open the page.

## Run the instrument

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build
npm run preview
```

## Tests

Browser runtime (manifest schema, player, renderer registry):

```bash
npm test
```

Python protocol (unchanged this milestone):

```bash
python -m pytest -q
```

## Authoring protocol

A model author supplies:

```python
MANIFEST = {...}

def initial(parameters): ...
def step(state, parameters, dt): ...
def derive(state, parameters): ...  # optional
```

The JavaScript models in `web/src/models/` use the same field names. Run an authored Python model as NDJSON:

```bash
python bridge/author.py examples/rossler_model.py \
  --parameters '{"a":0.2,"b":0.2,"c":5.7}' \
  --steps 520 --dt 0.03
```

The runtime schema lives in `runtime/authoring.schema.json`.

## Architecture

```text
model source (JS demo / Python protocol)
    ↓
manifest + state model
    ↓
state frames
    ↓
runtime player
    ↓
renderer registry (by name)
    ↓
interactive experience
```

Snapshots are a shareable object:

```json
{ "model": "lorenz-attractor", "params": {}, "cursor": 0, "savedAt": "...", "frames": [] }
```

`frames` is optional. Restore reads `localStorage`; Export / Import move the same object as JSON.

## Product thesis

`model → state → interaction → experience`

Not:

`code → chart`

## Deliberate non-goals (this milestone)

- Python live compute bridge, WASM, SDK packaging
- React, dashboards, chat, AI generation
- robot arm, streaming data, comparison branches, cloud
- a full 3D engine
