import { defineModel, type ModelDefinition } from "@compute-experience/core";

export const vanDerPol: ModelDefinition = defineModel({
  manifest: {
    id: "van-der-pol",
    name: "Van der Pol Oscillator",
    description:
      "A non-conservative oscillator with non-linear damping. Exhibits stable limit-cycle behavior and relaxation oscillations across electronics and biological rhythms.",
    version: "1.0.0",
    renderer: "timeseries-2d",
    state: ["x", "y"],
    parameters: [
      { id: "mu", label: "Damping (μ)", type: "number", default: 1.5, min: 0.1, max: 5.0, step: 0.1 },
    ],
  },
  time: {
    steps: 600,
    dt: 0.05,
    playbackRate: 60,
    unit: "s",
  },
  initial: () => ({
    x: 0.5,
    y: 0.0,
  }),
  step: (prev, params, dt) => {
    const mu = Number(params.mu ?? 1.5);
    const x = Number(prev.x ?? 0.5);
    const y = Number(prev.y ?? 0);

    const dx = y;
    const dy = mu * (1 - x * x) * y - x;

    return {
      x: x + dx * dt,
      y: y + dy * dt,
    };
  },
});
