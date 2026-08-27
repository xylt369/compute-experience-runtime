# Compute Experience Runtime

[English](README.md) | [简体中文](README_zh.md)

> Write the model. Let the runtime handle the experience.

Compute Experience Runtime is an open-source library for turning computational models into interactive experiences. A developer defines **what** to compute; the runtime handles playback, state, parameters, timeline, snapshots, and renderer selection.

The central boundary:

```text
Model ≠ Experience

Model  →  State  →  Runtime  →  Experience
```

This is **not** an AI platform. There is no LLM integration, authentication, cloud backend, or account system in this repository.

## Packages

| Path | Role |
| --- | --- |
| `packages/core` | `@compute-experience/core` — model protocol, timeline, player, snapshots, `createRuntime()` |
| `packages/renderers` | `@compute-experience/renderers` — trajectory, pendulum, and timeseries renderers + registry |
| `packages/ui` | `@compute-experience/ui` — manifest-driven parameter, metric, and transport panels |
| `playground/` | Browser demo that **consumes** the runtime (not the runtime itself) |
| `examples/` | Model definitions using `defineModel()` |
| `bridge/` + Python under `examples/` | Authoring protocol for offline NDJSON export (not the live browser backend) |

## Quick start

```bash
npm install
npm run dev      # open playground (usually http://localhost:5173)
npm test         # unit tests
npm run build    # typecheck + production bundle
```

Python protocol tests:

```bash
python -m pytest -q
```

## Define a model

A model is a plain object with `manifest`, `initial`, `step`, and optional `derive`:

```typescript
import { defineModel } from "@compute-experience/core";

export const myModel = defineModel({
  manifest: {
    id: "my-model",
    name: "My Model",
    description: "A minimal example.",
    version: "0.1.0",
    renderer: "timeseries-2d",
    parameters: [
      { id: "rate", label: "Rate", type: "number", default: 1, min: 0, max: 5, step: 0.1 },
    ],
    state: ["x"],
    derived: ["absX"],
  },
  time: { steps: 200, dt: 0.05, playbackRate: 1, unit: "s" },
  initial() {
    return { x: 1 };
  },
  step(state, parameters, dt) {
    return { x: state.x + Number(parameters.rate) * dt };
  },
  derive(state) {
    return { absX: Math.abs(state.x) };
  },
});
```

The manifest drives parameter controls in the playground. Do not hardcode sliders per model.

## Create a runtime

```typescript
import { createRuntime, defaultParameters } from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { mountExperienceUI } from "@compute-experience/ui";

const runtime = createRuntime({
  model: myModel,
  rendererRegistry: createRendererRegistry(),
  parameters: defaultParameters(myModel),
});

mountExperienceUI({
  runtime,
  elements: {
    params: document.getElementById("params")!,
    metrics: document.getElementById("metrics")!,
    viewport: document.getElementById("viewport")!,
    play: document.getElementById("play") as HTMLButtonElement,
    scrub: document.getElementById("scrub") as HTMLInputElement,
    time: document.getElementById("time")!,
  },
});
```

Public API (stable surface):

- **Playback:** `play()`, `pause()`, `toggle()`, `seek(time)`, `seekIndex(index)`, `step(delta)`
- **State:** `rebuild()`, `setParameters(patch)`, `setInitialState(state)`, `currentFrame()`, `currentIndex()`
- **Snapshots:** `snapshot(includeFrames?)`, `restore(snapshot)`
- **Events:** `subscribe(listener)` → unsubscribe function
- **Rendering:** `mount({ viewport, overlay? })`, `unmount()`, `resize()`

## Renderers

Renderers are registered by id. A model's manifest declares which renderer to use:

```typescript
renderer: "trajectory-3d"   // Lorenz, Rössler
renderer: "pendulum-2d"     // nonlinear pendulum
renderer: "timeseries-2d"  // SIR epidemic
```

The runtime resolves the renderer through the registry. Core does not import renderer implementations directly.

## Snapshots

Snapshots are deterministic, JSON-compatible objects:

```json
{
  "model": "lorenz-attractor",
  "version": "0.1.0",
  "params": { "sigma": 10, "rho": 28, "beta": 2.67 },
  "cursor": 42,
  "savedAt": "2026-08-27T12:00:00.000Z",
  "frames": []
}
```

`frames` is optional. Use `serializeSnapshot()` / `deserializeSnapshot()` for export and import.

## Built-in models

| Model | Renderer |
| --- | --- |
| Lorenz attractor | `trajectory-3d` |
| Rössler attractor | `trajectory-3d` |
| Simple pendulum | `pendulum-2d` |
| SIR epidemic | `timeseries-2d` |
| Logistic growth (`custom-model`) | `timeseries-2d` |

Switching models in the playground uses the same runtime abstractions — no model-specific UI code.

## Create a third-party model

See [`examples/custom-model/`](examples/custom-model/). The authoring file defines only the model. The playground registers it in the catalog and reuses the same `createRuntime()` + `mountExperienceUI()` path — no new UI.

```bash
# model only
examples/custom-model/model.ts

# how the experience appears (already provided)
createRuntime({ model: customModel, rendererRegistry })
mountExperienceUI({ runtime, elements })
```

## Architecture

```text
Third-party Model
       │
       ▼
Model Protocol (manifest + initial/step/derive)
       │
       ▼
Compute Experience Runtime
   ┌───┼───┐
   │   │   │
   ▼   ▼   ▼
State Player Snapshot
       │
       ▼
Renderer Registry
       │
       ▼
  Experience
```

## Python authoring protocol

Python models under `examples/` follow the same contract for offline simulation:

```python
MANIFEST = {...}

def initial(parameters): ...
def step(state, parameters, dt): ...
def derive(state, parameters): ...  # optional
```

Run as NDJSON:

```bash
python bridge/author.py examples/rossler_model.py \
  --parameters '{"a":0.2,"b":0.2,"c":5.7}' \
  --steps 520 --dt 0.03
```

Schema: `packages/core/src/protocol/manifest-schema.json` (also mirrored at `runtime/authoring.schema.json`).
