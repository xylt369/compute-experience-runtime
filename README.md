# Compute Experience Runtime

[English](README.md) | [简体中文](README_zh.md)

<p align="center">
  <strong>The open-source counterfactual computational medium for AI & science.</strong><br>
  <em>Write the model. Let the runtime handle the persistent, navigable, and forkable computational experience.</em>
</p>

<p align="center">
  <a href="https://github.com/xylt369/compute-experience-runtime/actions"><img src="https://img.shields.io/badge/tests-130%20passed-34c759.svg" alt="Tests" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/typescript-strict-007acc.svg" alt="TypeScript" /></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/bundle-~60KB-ff9500.svg" alt="Vite Bundle" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
</p>

---

## 💡 The Core Philosophy

Traditional software treats computation as a disposable black box:

$$\text{Input} \longrightarrow \boxed{\text{Black-Box Computation}} \longrightarrow \text{Output}$$

**Compute Experience Runtime** treats computation as a persistent, forkable universe:

$$\text{Model} \xrightarrow{\quad} \text{Run (Persistent State History)} \xrightarrow{\quad} \text{Experience (Observe · Fork · Intervene · Replay)}$$

```text
       Model ≠ Run ≠ Experience

Model        ──► Mathematical rules (initial / step / derive / closed primitives)
Run          ──► A persistent execution history backed by Copy-on-Write (CoW) memory pages
Experience   ──► The interactive medium: pause, inspect causality, fork parallel futures, and touch states
```

---

## ⚡ 30-Second Quickstarts

### 1. Web & Vanilla DOM (1-Line Embed)

```html
<div id="simulation" style="width: 100%; height: 400px;"></div>

<script type="module">
  import { mountExperience } from "@compute-experience/ui";
  import { lorenz } from "./examples/lorenz";

  // 1-line interactive embed
  const exp = mountExperience("#simulation", {
    model: lorenz,
    counterfactual: true,
    autostart: true,
  });

  // Fork parallel future at t = 5.0s with a tiny butterfly perturbation
  exp.fork(5.0, { field: "x", delta: 1e-8 });
</script>
```

### 2. POSIX Command-Line Suite (`cx` CLI)

```bash
# Run headless simulation and stream frames to UNIX pipes
npx cx run lorenz-attractor --format ndjson | jq .state

# Branch a run and calculate exact IEEE-754 bit divergence
npx cx diff lorenz-attractor --at 5.0 --intervene x=1e-8

# Validate composed model causality against closed primitives
npx cx inspect sir-epidemic
```

### 3. Python & Jupyter Notebooks / Google Colab

```python
import compute_experience as cx

# Run simulation and render self-contained interactive widget
run = cx.simulate("lorenz-attractor", steps=600, dt=0.01)
cx.show(run) # Renders embedded interactive player inside Jupyter / Colab
```

---

## 🏛️ The Museum of Dynamic Systems

The runtime includes 6 iconic dynamic systems with interactive guided tours:

| Model | System Type | State Variables | Phenomenon Explored |
| --- | --- | --- | --- |
| 🦋 **Lorenz Attractor** | 3D Chaos | $x, y, z$ | Strange attractor, butterfly divergence & exponential drift |
| 🏥 **SIR Epidemic** | Compartmental ODE | $S, I, R$ | Infection exponential surge & emergency lockdown policy |
| ⏱️ **Simple Pendulum** | Nonlinear Mechanics | $\theta, \omega$ | Large-angle phase inversion & ghost dual-bob comparison |
| 🌀 **Rössler Attractor** | Hyperchaos | $x, y, z$ | Continuous spiral chaos with a single quadratic nonlinearity |
| 🦊 **Lotka-Volterra** | Population Ecology | $\text{prey}, \text{predator}$ | Predator-prey phase cycles & invariant energy contours |
| ⚡ **Van der Pol** | Nonlinear Oscillator | $x, y$ | Relaxation oscillations & stable limit cycle convergence |

---

## 🔬 The Computational Microscope

In the Playground, the trajectory itself is the interface:

```text
watch ──► hold ──► ask ──► follow ──► touch ──► release ──► replay
```

1. **Watch** — The system evolves continuously in full-bleed coordinate space.
2. **Hold** — Click any point on the trajectory or scrubber to pin a precise temporal frame.
3. **Ask** — Click any state variable ($x, y, z$) to reveal its mathematical formula and instantaneous term fluxes.
4. **Follow** — Step backwards through causal ancestry to see which past state contributed to current values.
5. **Touch & Intervene** — Edit any state variable or parameter at that precise moment.
6. **Release & Replay** — The past stays immutable; the counterfactual future re-simulates in real time.

---

## 🛠️ Architecture: Microkernel & Copy-on-Write Memory

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                 COMPUTE EXPERIENCE RUNTIME: LINUX-GRADE CORE                │
│                                                                             │
│  [ Memory Subsystem ] ──► Chunked Float64 CoW Pages (refcount zero-cost fork)│
│  [ POSIX CLI Tool ]   ──► `cx run`, `cx fork`, `cx diff`, `cx inspect`      │
│  [ Closed Primitives] ──► 9 Deterministic Primitives (coupling/growth/ODE)  │
│  [ 4-Tier Verification]─► 21 Test Suites (130 JS Tests + 5 Py Tests PASS)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Chunked Float64 Array Pages**: Timelines are stored in fixed-size typed array pages (64 steps/page).
- **$O(1)$ Zero-Allocation Fork**: Forking a run shares historical pages by incrementing reference counts (`refCount++`).
- **Copy-on-Write Isolation**: Pages are cloned on demand only when modified past the fork boundary.

---

## 📦 Monorepo Packages

| Path | Package | Responsibility |
| --- | --- | --- |
| `packages/core` | `@compute-experience/core` | Microkernel, CoW Page Table, Run lifecycle, closed primitives, 8-pass validator, snapshots |
| `packages/renderers` | `@compute-experience/renderers` | Multi-run renderers (`Trajectory3D`, `Pendulum2D` ghost mode, `Timeseries2D`) |
| `packages/ui` | `@compute-experience/ui` | 1-Line Embed API (`mountExperience`), Computational Microscope, HUD, counterfactual panels |
| `bin/cx.ts` | `cx` CLI | POSIX CLI suite supporting headless execution, diffing, and UNIX pipes |
| `examples/` | Built-in Models | Lorenz, SIR, Pendulum, Rössler, Lotka-Volterra, Van der Pol |
| `playground/` | Browser Studio | Apple-style warm parchment UI (`#faf9f5`), Museum tours, and AI Concept Compiler |

---

## 🧪 Testing & Verification

```bash
# Run 130+ unit tests across 21 test suites
npm test

# Run Python protocol conformance tests
python -m pytest -q

# Run production build
npm run build

# Start local Playground
npm run dev
```

---

## 📄 License

MIT © [xylt369](https://github.com/xylt369)
