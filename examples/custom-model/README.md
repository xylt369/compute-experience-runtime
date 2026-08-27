# custom-model — third-party authoring proof

This example answers one question:

> Can a stranger write only a computational model and get a full Interactive Experience?

**Yes.** The file [`model.ts`](./model.ts) contains:

- `manifest`
- `initial()`
- `step()`
- `derive()`

It does **not** contain:

- sliders / parameter UI
- timeline / scrubber
- play / pause controls
- snapshot Save / Restore UI
- renderer selection logic
- DOM / React / CSS

## How it works

```text
examples/custom-model/model.ts
        │
        ▼
   defineModel(...)
        │
        ▼
   createRuntime({ model })
        │
        ▼
   mountExperienceUI(...)   ← provided by the runtime stack
        │
        ▼
┌──────────────────────────────┐
│ Logistic growth              │
│                              │
│ Growth rate ─────●────────   │
│                              │
│         [ Experience ]       │
│                              │
│ ◀ ─────── ● ───────────── ▶ │
│          4.82t               │
│                              │
│        Snapshot              │
└──────────────────────────────┘
```

## Minimal consumer code

Somewhere else (playground, your app, a notebook shell):

```typescript
import { createRuntime, defaultParameters } from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { mountExperienceUI } from "@compute-experience/ui";
import { customModel } from "./model";

const runtime = createRuntime({
  model: customModel,
  rendererRegistry: createRendererRegistry(),
  parameters: defaultParameters(customModel),
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

The model author never writes that UI wiring. The playground already does it for every catalog model — including this one — through the same path.

## Try it

```bash
npm run dev
```

Select **Logistic growth** in the model dropdown.

## What this proves

| Concern | Who owns it |
| --- | --- |
| Equations & parameters | `model.ts` (you) |
| Playback / timeline / seek | `@compute-experience/core` |
| Snapshot serialize / restore | `@compute-experience/core` |
| Renderer choice | manifest `renderer` field + registry |
| Sliders & metrics panels | `@compute-experience/ui` from manifest |

**Write the model. Let the runtime handle the experience.**
