# Compute Experience Runtime

> **Turn computation into an experience.**
>
> Write the model. Let the runtime handle the experience.

Compute Experience Runtime is an open-source runtime for turning computational models into interactive, replayable, visually refined digital experiences.

The project is based on a simple idea:

**A computation should not end as text, a table, a static chart, or a raw file. It can become an interactive object that people can explore.**

The runtime separates the definition of a model from the way people experience that model. A model author describes the computation, state, parameters, and capabilities. The runtime handles the surrounding experience: controls, time, playback, interaction, persistence, and rendering.

---

## Why

Most computational software still follows an old pattern:

```text
Model
  ↓
Run
  ↓
Output
```

The output is usually:

- text
- numbers
- logs
- files
- static charts
- dashboards

That is often useful, but it forces users to mentally reconstruct the system behind the output.

Compute Experience Runtime explores a different model:

```text
Model
  ↓
State
  ↓
Runtime
  ↓
Interactive Experience
```

Instead of only looking at a result, users can manipulate it, replay it, inspect it, compare states, change parameters, and explore how the system behaves.

The goal is not to make computation prettier for its own sake.

The goal is to make complex computation **easier to understand, easier to operate, and more memorable** by turning it into something people can interact with directly.

---

## The Core Idea

The central abstraction is:

```text
Model ≠ Experience
```

A model describes **what the system computes**.

An experience describes **how a human interacts with and understands that computation**.

That separation allows the same model to support multiple experiences:

```text
Lorenz system
 ├── trajectory
 ├── phase space
 ├── vector field
 └── 3D attractor
```

And the same experience can support many models:

```text
3D particle experience
 ├── fluid
 ├── crowd
 ├── orbital system
 ├── particle simulation
 └── other dynamic systems
```

The runtime is the layer that connects the two.

---

## The Product Philosophy

Compute Experience is built around five principles.

### 1. Complexity should live behind the interface

Users should not have to learn the implementation language of a model in order to interact with it.

A model may contain differential equations, state transitions, numerical methods, data pipelines, or external computation. The experience should expose only the controls and information that are actually useful.

### 2. Computation should become an object

A result should be more than an exported image or a number.

It should be possible to:

- inspect it
- manipulate it
- replay it
- branch from it
- compare it
- save it
- share it

The long-term goal is to make the **interactive computational object** a first-class digital object.

### 3. Authors should write models, not UI boilerplate

A developer should not need to rebuild sliders, timelines, playback controls, state inspectors, and persistence for every model.

The intended workflow is:

```text
Define Model
    ↓
Declare Parameters
    ↓
Declare State
    ↓
Implement Computation
    ↓
Runtime Builds the Experience
```

### 4. Visual design is part of the runtime

The project does not treat visualization as an afterthought.

The experience should feel:

- restrained
- coherent
- precise
- responsive
- visually intentional

The goal is not maximal decoration. It is to make the complexity of the underlying system feel simple.

### 5. AI is an authoring layer, not the product

AI may eventually help users describe models, infer schemas, select renderers, generate explanations, or construct experiences.

But the runtime must remain valuable without a particular AI provider.

The core assets are:

- model protocol
- state model
- interaction runtime
- renderer system
- experience model

AI should make the system more capable, not define why the system exists.

---

## Architecture

The long-term architecture is organized into five layers:

```text
┌────────────────────────────────────────────┐
│              Experience Layer              │
│                                            │
│  2D / 3D / Graph / Timeline / Spatial UI   │
└──────────────────────▲─────────────────────┘
                       │
┌──────────────────────┴─────────────────────┐
│            Interaction Runtime             │
│                                            │
│ Input / Selection / Camera / Playback      │
└──────────────────────▲─────────────────────┘
                       │
┌──────────────────────┴─────────────────────┐
│               State Runtime                │
│                                            │
│ State / Frames / Events / Time / Replay    │
└──────────────────────▲─────────────────────┘
                       │
┌──────────────────────┴─────────────────────┐
│                Model Layer                 │
│                                            │
│ Python / TypeScript / WASM / External      │
│ simulators and compute backends            │
└──────────────────────▲─────────────────────┘
                       │
┌──────────────────────┴─────────────────────┐
│                 Data Layer                 │
│                                            │
│ Files / Streams / APIs / Sensors / DBs     │
└────────────────────────────────────────────┘
```

### Model Layer

Defines the actual computation.

Examples:

- physics simulations
- mathematical systems
- epidemiological models
- algorithms
- optimization problems
- data transformations
- dynamic systems
- scientific models

The runtime does not need to understand the domain-specific mathematics.

### State Runtime

Represents the state of the model over time.

```text
State₀ → State₁ → State₂ → State₃
```

This layer is intentionally important because it enables:

- pause
- replay
- rewind
- snapshots
- comparison
- branching
- deterministic reproduction
- live updates

The long-term vision is to make **state** a first-class primitive.

### Interaction Runtime

Provides generic interaction primitives:

- parameter control
- selection
- zoom
- pan
- playback
- time navigation
- inspection
- object manipulation

### Experience Layer

Maps state into a human-facing representation.

Possible renderers include:

- 2D plots
- graphs
- networks
- timelines
- particle systems
- vector fields
- 3D scenes
- spatial interfaces
- custom renderers

The renderer should consume structured state instead of being tightly coupled to a particular model implementation.

### Data Layer

Future versions can allow models to consume live external state:

- APIs
- files
- databases
- sensors
- real-time streams
- public datasets

This enables the transition from simulations to living computational objects.

---

## Model Authoring Protocol

A central goal is to make the authoring interface small and predictable.

A model should conceptually expose only four things:

```text
manifest
initial(state)
step(state, parameters, dt)
derive(state, parameters)
```

The manifest describes the public model contract.

```json
{
  "id": "example-model",
  "version": "0.1.0",
  "parameters": [],
  "state": [],
  "time": {
    "mode": "continuous"
  },
  "capabilities": {
    "rewind": true,
    "interactive": true,
    "deterministic": true
  }
}
```

The author should focus on computation.

The runtime should handle the rest.

---

## Current Prototype

The current prototype demonstrates the architecture with multiple independent models sharing the same runtime concepts.

Current examples include:

- Simple Pendulum
- SIR Epidemic Model
- Lorenz Attractor
- Rössler Attractor

The important part is not the models themselves.

They exist to test whether very different computational systems can share the same protocol and runtime.

The current development target is:

```text
Python Model
    ↓
Model Manifest
    ↓
State Frames
    ↓
Runtime Player
    ↓
Renderer
    ↓
Interactive Experience
```

---

## What This Is Not

This project is deliberately **not** trying to be:

### Another AI visualization generator

The runtime must remain useful without any specific model provider.

### Another Jupyter notebook

The goal is not a better code-and-cell environment. The goal is to make computation itself an interactive object.

### Another dashboard library

Dashboards mostly arrange information. This project is concerned with systems that can be explored and manipulated.

### Another 3D engine

3D is one possible renderer, not the core abstraction.

### Another AI agent

The project is not about repeatedly asking an agent to perform tasks. The output is a persistent computational object.

### Another generic UI framework

The purpose is not to provide arbitrary UI components. The purpose is to provide an experience layer for computational state.

---

## Where This Could Go

The long-term direction is to make the runtime capable of representing many kinds of computational experiences.

### Physics

Interactive physical systems where parameters can be changed and behavior can be explored directly.

### Mathematics

Systems, geometry, dynamical equations, optimization, probability, and numerical experiments.

### Algorithms

Instead of reading an algorithm explanation, users can watch and manipulate the algorithm's actual state.

### Scientific Computing

A model can become a small research instrument rather than a script that produces a static figure.

### Engineering

Complex systems can expose parameters, state, and responses through a focused interactive environment.

### Data

Data can become an interactive computational object rather than a static dashboard.

### Live Systems

External streams can become continuously updating experiences.

```text
External World
      ↓
   Data Stream
      ↓
     State
      ↓
   Experience
```

The ultimate ambition is not to make every model look the same.

It is to create a common runtime in which **different computational worlds can be experienced through a coherent interaction system**.

---

## Future AI Layer

AI can eventually sit above the runtime as an authoring and interpretation layer.

A user might say:

> “I want to understand why this system becomes unstable.”

The AI could then help construct:

```text
Intent
  ↓
Model
  ↓
State Schema
  ↓
Renderer
  ↓
Interactive Experience
```

AI could also help with:

- model discovery
- manifest generation
- parameter inference
- renderer selection
- explanation generation
- experience composition
- natural-language interaction

But the runtime remains the durable layer.

The model provider can change.

The computational object remains.

---

## Roadmap

### Phase 1 — Runtime Foundation

- Model manifest
- State frames
- deterministic replay
- runtime player
- renderer registry
- persistence
- model validation

### Phase 2 — Model SDK

- Python SDK
- TypeScript SDK
- WASM support
- stable model protocol
- external process / compute adapters

### Phase 3 — Experience System

- 2D renderer
- graph renderer
- timeline renderer
- network renderer
- 3D renderer
- reusable interaction primitives
- design system

### Phase 4 — Live Computational Objects

- streaming state
- API-backed models
- real-time data sources
- continuous computation
- persistent objects

### Phase 5 — AI Authoring

- natural-language model creation
- automatic experience generation
- intelligent renderer selection
- semantic state inspection
- natural-language exploration

The roadmap is intentionally capability-driven rather than feature-count-driven.

---

## Design Principles

The runtime should feel closer to a carefully designed instrument than a traditional enterprise application.

### Less UI, more capability

Controls should exist because they enable meaningful exploration, not because the framework happens to expose them.

### Stable mental models

The runtime can evolve, but users should not have to relearn the product whenever a model changes.

### High information density without visual noise

The system should be able to communicate complex state while remaining calm and readable.

### Direct manipulation

Whenever possible, users should manipulate the system itself instead of manipulating a configuration panel describing the system.

### The result should be worth opening

A computational experience should feel like a thing, not a debug screen.

---

## Non-Goals for the Early Project

To keep the project technically and conceptually sharp, the early project intentionally excludes:

- generic AI chat
- model-provider lock-in
- a full notebook IDE
- a general-purpose game engine
- a generic dashboard builder
- arbitrary website generation
- a complete browser
- collaborative editing
- a marketplace
- complex cloud infrastructure
- dozens of model types before the runtime is stable

The project should prove the runtime abstraction before expanding its surface area.

---

## Contributing

The project is especially interested in contributions that strengthen the core abstraction rather than simply adding another demo.

High-value contributions include:

- model protocol improvements
- state representation
- renderer architecture
- interaction primitives
- deterministic replay
- model adapters
- performance improvements
- accessibility
- examples that prove the runtime works across very different domains

A useful contribution should answer one of these questions:

> Can a new model be authored with less UI code?

> Can an existing model become easier to understand through interaction?

> Can the same runtime support a fundamentally different kind of computation?

---

## Philosophy

The project starts from a simple observation:

**Computers are extremely good at computing things, but the interfaces through which humans experience those computations are still remarkably limited.**

A model can contain a world of structure, causality, state, and behavior. Yet the result is often flattened into a number, a log, a table, or a chart.

Compute Experience Runtime explores what happens when we reverse that relationship.

Instead of asking:

> “What output did the computer produce?”

we ask:

> **“What is the best way for a human to experience this computation?”**

That question is the reason this project exists.

---

## Status

**Early research / prototype.**

The architecture and authoring protocol are still evolving. APIs should be considered experimental.

The project is currently focused on proving three things:

1. Very different models can share one runtime.
2. Developers can author models without rebuilding the experience layer.
3. Interactive computational objects can feel significantly better than static outputs.

If those three things hold, the project can grow from a prototype into a reusable open-source runtime.
