import { defineModel, type ModelDefinition } from "@compute-experience/core";

/**
 * Third-party authoring example.
 *
 * This file defines only:
 *   - manifest
 *   - initial()
 *   - step()
 *   - derive()
 *
 * It must not import UI, DOM, renderers, or playground code.
 * The runtime + manifest-driven UI produce the interactive experience.
 */
export const customModel: ModelDefinition = defineModel({
  manifest: {
    id: "custom-logistic-growth",
    name: "Logistic growth",
    description:
      "A third-party example: population growth with carrying capacity. Authoring is model-only — no UI code.",
    version: "0.1.0",
    renderer: "timeseries-2d",
    parameters: [
      {
        id: "growthRate",
        label: "Growth rate",
        type: "number",
        default: 0.35,
        min: 0.01,
        max: 1.5,
        step: 0.01,
        unit: "1/t",
      },
      {
        id: "carryingCapacity",
        label: "Carrying capacity",
        type: "number",
        default: 100,
        min: 10,
        max: 500,
        step: 5,
        unit: "N",
      },
      {
        id: "initialPopulation",
        label: "Initial population",
        type: "number",
        default: 5,
        min: 1,
        max: 200,
        step: 1,
        unit: "N",
      },
    ],
    state: ["population"],
    derived: ["growthPressure", "saturation"],
    experience: {
      profile: "manifest",
      label: "Model Playground",
      targets: ["population"],
    },
  },
  time: { steps: 400, dt: 0.1, playbackRate: 8, unit: "t" },
  initial(parameters = {}) {
    const capacity = Math.max(1, Number(parameters.carryingCapacity ?? 100));
    const n0 = Math.min(capacity, Math.max(0.1, Number(parameters.initialPopulation ?? 5)));
    return { population: n0 };
  },
  step(state, parameters, dt) {
    const r = Math.max(0, Number(parameters.growthRate));
    const k = Math.max(1e-9, Number(parameters.carryingCapacity));
    const n = Math.max(0, state.population);
    const dn = r * n * (1 - n / k);
    return { population: Math.max(0, n + dn * dt) };
  },
  derive(state, parameters) {
    const k = Math.max(1e-9, Number(parameters.carryingCapacity));
    const n = Math.max(0, state.population);
    return {
      growthPressure: Math.max(0, 1 - n / k),
      saturation: Math.min(1, n / k),
    };
  },
});
