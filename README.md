# Compute Experience Runtime

[English](README.md) | [简体中文](README_zh.md)

> Write the model. Let the runtime handle the experience.

Compute Experience Runtime is an open-source library for turning computational models into interactive experiences. A developer defines **what** to compute; the runtime owns **runs** — persistent, navigable execution histories — and turns them into experiences where a person can **enter the computation**.

The central boundary:

```text
Model ≠ Run ≠ Experience

Model
  ↓
Run
  ↓
State History + Trace
  ↓
Runtime
  ↓
Experience
```

- **Model** — computation rules (`initial` / `step` / `derive`), optional authored `explain()`, and a manifest.
- **Run** — one concrete execution history under particular parameters and state.
- **Experience** — playback, inspection, trace navigation, intervention, and replay of a run.

Computation is not a disposable function call. A run is a persistent object whose history can be inspected, followed, touched, and reshaped.

This is **not** an AI platform. There is no LLM integration, authentication, cloud backend, or account system in this repository.

## The product question

Traditional software treats computation as a black box:

```text
Input → computation → output
```

This project explores:

```text
Computational World
      ↓
    Inspect
      ↓
     Trace
      ↓
   Intervene
      ↓
    Replay
      ↓
 Observe consequence
```

The playground's first complete experience is the **Lorenz Computational Microscope** — one computational world where the trajectory is the interface.

```text
watch → hold → ask → follow → touch → release → replay
```

## Packages

| Path | Role |
| --- | --- |
| `packages/core` | `@compute-experience/core` — model protocol, Run, timeline, player, inspect/intervene, fork/compare, snapshots, `createRuntime()` |
| `packages/renderers` | `@compute-experience/renderers` — trajectory, pendulum, and timeseries renderers + registry |
| `packages/ui` | `@compute-experience/ui` — manifest-driven UI, computational microscope, counterfactual panels |
| `playground/` | Browser demo (consumes the runtime; not the runtime itself) |
| `examples/` | Model definitions using `defineModel()` |
| `bridge/` + Python under `examples/` | Offline NDJSON export protocol (not the live browser backend) |

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

## Lorenz Computational Microscope

The playground opens on **Lorenz attractor** in world-first mode:

1. **Watch** — the trajectory runs in a full-bleed world.
2. **Hold** — click the trajectory or pause; the current point becomes a precise instrument cursor.
3. **Ask** — click a trajectory point or an `x` / `y` / `z` readout; an authored computation appears in place.
4. **Follow** — click terms (`x·y`, `x`, …) to move deeper; state references jump to their temporal ancestors on the trajectory.
5. **Touch** — after reaching a concrete state value, edit it.
6. **Release** — commit the intervention; the past stays still, the future recomputes and grows forward from the seam.
7. **Return / restore** — leave inspection or restore the pre-intervention world.

There is **no** default split-screen ORIGINAL / COUNTERFACTUAL view for Lorenz. Intervention reshapes the visible world in place.

```typescript
runtime.pause();
runtime.inspect(420, "z");
runtime.inspect(419, "x", null, { push: true, seek: true });
runtime.intervene({ frameIndex: 419, field: "x", value: 8.5 });
runtime.play(); // future grows from the seam on the same trajectory
```

### Authored traces

Lorenz implements optional `explain(context, field)` returning a structured `ComputationTrace`:

```text
z_next
  ├── z(t)
  ├── x(t) · y(t)
  │    ├── x(t)
  │    └── y(t)
  ├── β · z(t)
  └── dt
```

This is **author-provided execution structure**, not automatic causal inference, symbolic differentiation, or LLM narration.

Frame semantics:

```text
input state at frame N−1
        ↓
      step()
        ↓
result state at frame N
```

## Define a model

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

The manifest drives parameter controls automatically. Do not hardcode sliders per model.

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

runtime.rebuild();
runtime.play();

mountExperienceUI({
  runtime,
  microscopeMode: true, // Lorenz playground path
  elements: { viewport, play, scrub, time, /* microscope elements */ },
});
```

### Public API (stable surface)

- **Playback:** `play()`, `pause()`, `toggle()`, `seek(time)`, `seekIndex(index)`, `step(delta)`
- **Runs:** `primaryRun`, `runs`, `comparisonRuns`, `forkAt(index)`, `forkAtTime(time)`, `clearBranches()`, `compare()`, `setSyncPlayback(enabled)`
- **Inspection:** `trace()`, `inspect()`, `inspectionBack()`, `clearInspection()`
- **Intervention:** `intervene()`, `reshape` (read-only metadata), `ComputationalRun.reshapeAt()`
- **State:** `rebuild()`, `setParameters(patch)`, `setInitialState(state)`, `currentFrame()`, `currentIndex()`
- **Snapshots:** `snapshot(includeFrames?)`, `restore(snapshot)`
- **Events:** `subscribe(listener)` — `frame`, `inspect`, `reshape`, `rebuild`, `run-forked`, …
- **Rendering:** `mount({ viewport, overlay?, onInspectionAnchor?, onTrajectoryPick? })`, `unmount()`, `resize()`

## Fork and compare (secondary)

Fork remains useful infrastructure for exploring alternative futures — especially on non-chaotic models.

```typescript
runtime.pause();
runtime.seek(5.2);
const branch = runtime.forkAtTime(5.2);
branch.setForkState({ ...branch.currentFrame()!.state, x: originalX + 1e-8 });
runtime.setSyncPlayback(true);
runtime.play();
const diff = runtime.compare();
```

Fork is **not** the primary Lorenz experience. In-place `intervene()` may use fork/rebuild machinery internally, but the user sees:

```text
touch → future reshapes
```

### SIR counterfactual showcase

Select **SIR Counterfactual** in the playground for a decision-system fork/compare demo:

```text
history → fork → intervention timing → alternative future → comparison
```

Pause near day 15–20, **Fork**, move intervention start to **day 10** on the branch only. Both runs share history up to the fork; only the future diverges.

## Renderers

```typescript
renderer: "trajectory-3d"   // Lorenz, Rössler (multi-run compare when branched)
renderer: "pendulum-2d"     // nonlinear pendulum
renderer: "timeseries-2d"  // SIR counterfactual / logistic growth
```

`trajectory-3d` supports trajectory picking, inspection threading along the path, and in-place reshape visualization (future grows from the intervention seam).

## Snapshots

Snapshots are deterministic, JSON-compatible objects supporting multi-run trees:

```json
{
  "model": "lorenz-attractor",
  "version": "0.1.0",
  "params": { "sigma": 10, "rho": 28, "beta": 2.67 },
  "cursor": 42,
  "runs": [{ "id": "run_1_...", "params": {}, "cursor": 42, "frames": [] }]
}
```

## Built-in models

| Model | Playground experience |
| --- | --- |
| Lorenz attractor | **Computational Microscope** — trace lens (`inspect` + `trace`) |
| SIR Counterfactual | **Epidemic History** — branch panel (`fork` + `compare` + intervention) |
| Simple pendulum | **Physical Pendulum** — world readout |
| Rössler attractor | **Dynamical Flow** — world readout + fork/compare in chrome |
| Logistic growth (`custom-model`) | Manifest playground |
| Semantic demo | Inspect-only world readout — **no profile preset** |

## Architecture

```text
Third-party Model
       │
       ▼
Model Protocol (manifest + initial/step/derive + optional explain)
       │
       ▼
Computational Run(s)
       │
       ▼
Experience Contract (world + targets + capabilities)
       │
       ▼
Experience Composition (trace lens / branch panel / world readout / manifest)
       │
       ├──────────────────┐
       ▼                  ▼
Interaction            World
Semantics              Expression
       │                  │
       └────────┬─────────┘
                ▼
           Experience UI
```

Models define **computation**. Runs preserve **history**. Experiences define **how that history can be explored**. Renderers express each experience in the model's natural visual world.

```typescript
import { resolveExperience, composeExperience } from "@compute-experience/core";

const contract = resolveExperience(model);
// contract.targets: ExperienceTarget[] — state / parameter / derived / event
// contract.capabilities: { inspect, trace, intervene, replay, fork, compare }
// contract.profile?: optional preset label (microscope | counterfactual | instrument | manifest)

const composition = composeExperience(contract);
// composition.traceLens | branchPanel | worldReadout | manifestPanel
```

**Profiles are presets**, not architectural destinations. UI modules are derived from `capabilities` + `targets` via `composeExperience()`, then wired through shared **interaction primitives** (`inspect`, `trace`, `intervene`, `replay`, `fork`/`compare`, `hold`) in `@compute-experience/ui`.

Shared interaction verbs (`watch`, `hold`, `ask`, `follow`, `touch`, `release`, `replay`) have consistent runtime semantics. Visual expression differs per model.

## Python authoring protocol

Python models under `examples/` follow the same contract for offline simulation:

```bash
python bridge/author.py examples/rossler_model.py \
  --parameters '{"a":0.2,"b":0.2,"c":5.7}' \
  --steps 520 --dt 0.03
```

Schema: [`packages/core/src/protocol/manifest-schema.json`](packages/core/src/protocol/manifest-schema.json).

## Milestone status

- **Runtime foundation:** model protocol, playground consumer
- **Manifest-driven UI:** `@compute-experience/ui`
- **Computational Runs:** Run, fork, compare, synced playback
- **Lorenz Computational Microscope:** world-first inspect → trace → touch → in-place replay
- **SIR counterfactual showcase:** intervention timing fork/compare
- **Experience contract:** semantic targets, capabilities, `composeExperience()` composition
- **Semantic extensibility demo:** `semantic-demo` model (no profile, inspect-only world readout)

## Deliberate non-goals

- AI / LLM model generation or narration
- Authentication, accounts, database, cloud deployment
- Automatic causal inference, symbolic engines, source-code tracing
- WebGPU migration, arbitrary code execution
- Python live compute bridge — future work
