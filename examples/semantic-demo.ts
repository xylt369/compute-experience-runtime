import { defineModel, type ModelDefinition } from "@compute-experience/core";

/**
 * Extensibility demo: enters the experience system via semantic targets + capabilities only.
 * No profile preset — composition is derived from capabilities.
 */
export const semanticDemo: ModelDefinition = defineModel({
  manifest: {
    id: "semantic-demo",
    name: "Semantic demo",
    description: "Inspect-only world readout without a profile preset or custom app UI.",
    version: "0.1.0",
    renderer: "timeseries-2d",
    parameters: [
      { id: "drift", label: "Drift", type: "number", default: 0.2, min: 0, max: 2, step: 0.01 },
    ],
    state: ["signal"],
    experience: {
      label: "Signal world",
      capabilities: {
        inspect: true,
        trace: false,
        intervene: false,
        replay: false,
        fork: false,
        compare: false,
      },
      targets: [
        {
          id: "signal",
          kind: "state",
          label: "signal",
          inspectable: true,
          intervenable: false,
          visualRole: "primary",
        },
        { id: "drift", kind: "parameter", label: "drift" },
      ],
      options: { autoPlay: true },
    },
  },
  time: { steps: 200, dt: 0.05, playbackRate: 4, unit: "t" },
  initial() {
    return { signal: 0.5 };
  },
  step(state, parameters, dt) {
    const drift = Number(parameters.drift ?? 0.2);
    return { signal: state.signal + drift * dt * Math.sin(state.signal * 4) };
  },
});
