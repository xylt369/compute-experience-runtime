# Compute Experience Runtime

[English](README.md) | [简体中文](README_zh.md)

> Write the model. Let the runtime handle the experience.

Compute Experience Runtime is an open-source library for turning computational models into interactive experiences. A developer defines **what** to compute; the runtime owns **runs** — persistent, navigable, forkable execution histories — and turns them into experiences.

The central boundary:

```text
Model ≠ Run ≠ Experience

Model
  ↓
Run
  ↓
State History
  ↓
Fork / Intervene / Compare
  ↓
Experience
```

- **Model** — computation rules (`initial` / `step` / `derive`) and a manifest.
- **Run** — one concrete execution history under particular parameters and state.
- **Experience** — playback, inspection, and comparison of one or more runs.

Computation is not a disposable function call. A run is a persistent, navigable, forkable object.

This is **not** an AI platform. There is no LLM integration, authentication, cloud backend, or account system in this repository.

## Packages

| Path | Role |
| --- | --- |
| `packages/core` | `@compute-experience/core` — model protocol, Run, timeline, player, fork/compare, snapshots, `createRuntime()` |
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

A model is a plain object with `manifest`, `time`, `initial`, `step`, and optional `derive`:

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

The manifest drives parameter controls in the playground automatically. Do not hardcode sliders per model.

## Create a runtime and fork a run

```typescript
import { createRuntime, defaultParameters } from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { mountExperienceUI } from "@compute-experience/ui";

const runtime = createRuntime({
  model: myModel,
  rendererRegistry: createRendererRegistry(),
  parameters: defaultParameters(myModel),
});

runtime.rebuild();
runtime.seek(4.7);

// Fork a branch at time 4.7
const runB = runtime.forkAtTime(4.7);
runB.setParameters({ rate: 1.4 });
// or intervene on state directly at the fork point:
// runB.setForkState({ x: runB.currentFrame()!.state.x + 0.1 });

runtime.setSyncPlayback(true);
runtime.play(); // primary + branch advance together

const diff = runtime.compare();
console.log(diff?.divergenceIndex, diff?.stateDifferences);

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
- **Runs:** `primaryRun`, `runs`, `comparisonRuns`, `forkAt(index)`, `forkAtTime(time)`, `clearBranches()`, `compare()`, `setSyncPlayback(enabled)`
- **State:** `rebuild()`, `setParameters(patch)`, `setInitialState(state)`, `currentFrame()`, `currentIndex()`
- **Snapshots:** `snapshot(includeFrames?)`, `restore(snapshot)` — includes branched runs when present
- **Events:** `subscribe(listener)` — `frame`, `rebuild`, `parameters`, `run-created`, `run-forked`, `run-updated`, `run-seek`, `run-state-changed`
- **Rendering:** `mount({ viewport, overlay? })`, `unmount()`, `resize()`

## Counterfactual computation

The playground opens on **Lorenz attractor** as a counterfactual instrument:

```text
Run → Observe → Seek → Fork → Intervene → Compare futures
```

1. **Play** one run (ORIGINAL).
2. **Pause** and **seek** to a moment in its history.
3. **Fork** — creates COUNTERFACTUAL from the exact cursor state.
4. **Intervene** — perturb state (e.g. `x += ε`) via the explicit ORIGINAL / COUNTERFACTUAL readout.
5. **Play** — both futures advance together on a shared timeline.
6. **Divergence** appears as a clickable event; click to rewind just before separation and step through it.
7. **Inspect** state and Δ in the sidebar. **Re-fork** from another point after clearing the branch.

The key idea:

> A computation is not only something that produces an output. A run is a navigable history from which alternative futures can be explored.

```typescript
runtime.pause();
runtime.seek(5.2);
const branch = runtime.forkAtTime(5.2);
branch.setForkState({ ...branch.currentFrame()!.state, x: originalX + 1e-8 });
runtime.setSyncPlayback(true);
runtime.play();
const diff = runtime.compare(); // divergenceTime, divergenceMagnitude, stateDifferences
```

Same past → different intervention → different future.

## Renderers

```typescript
renderer: "trajectory-3d"   // Lorenz, Rössler (supports multi-run compare)
renderer: "pendulum-2d"     // nonlinear pendulum
renderer: "timeseries-2d"  // SIR / logistic growth
```

Single-run renderers keep working. Comparison-capable renderers may read `view.primaryRun` and `view.comparisonRuns`.

## Snapshots

Snapshots are deterministic, JSON-compatible objects supporting multi-run trees:

```json
{
  "model": "lorenz-attractor",
  "version": "0.1.0",
  "params": { "sigma": 10, "rho": 28, "beta": 2.67 },
  "cursor": 42,
  "savedAt": "2026-08-28T00:00:00.000Z",
  "frames": [],
  "primaryRunId": "run_1_...",
  "syncPlayback": true,
  "runs": [
    { "id": "run_1_...", "params": {}, "cursor": 42, "frames": [] },
    { "id": "run_2_...", "parentRunId": "run_1_...", "forkIndex": 42, "params": {}, "cursor": 42, "frames": [] }
  ]
}
```

## Built-in models

| Model | Renderer |
| --- | --- |
| Lorenz attractor | `trajectory-3d` |
| Rössler attractor | `trajectory-3d` |
| Simple pendulum | `pendulum-2d` |
| SIR epidemic | `timeseries-2d` |
| Logistic growth (`custom-model`) | `timeseries-2d` |

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
Computational Run(s)
   ┌───┼───┐
   │   │   │
   ▼   ▼   ▼
State Player Snapshot
       │
  Fork / Compare
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

## Milestone status

- **Runtime foundation:** model protocol, playground consumer
- **Manifest-driven UI:** `@compute-experience/ui`
- **Third-party custom-model:** model-only authoring proof
- **Runtime v0.2 Computational Runs:** Run, fork, compare, synced playback
- **Counterfactual Lorenz showcase:** fork, intervene, divergence, inspect, re-fork

## Deliberate non-goals

- AI / LLM model generation
- Authentication, accounts, database, cloud deployment
- WebGPU migration, advanced 3D editor, arbitrary code execution
- Python live compute bridge (WASM / hot reload) — future work
