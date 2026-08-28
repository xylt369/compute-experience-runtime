import { defineModel, type ModelDefinition } from "@compute-experience/core";

export const lotkaVolterra: ModelDefinition = defineModel({
  manifest: {
    id: "lotka-volterra",
    name: "Lotka-Volterra Predator-Prey",
    description:
      "A classic ecological oscillator capturing cyclic population interactions between prey (hares) and predators (lynx) governed by non-linear conservation laws.",
    version: "1.0.0",
    renderer: "timeseries-2d",
    state: ["prey", "predator"],
    parameters: [
      { id: "alpha", label: "Prey Growth (α)", type: "number", default: 1.1, min: 0.1, max: 3.0, step: 0.05 },
      { id: "beta", label: "Predation Rate (β)", type: "number", default: 0.4, min: 0.05, max: 1.5, step: 0.01 },
      { id: "gamma", label: "Predator Mortality (γ)", type: "number", default: 0.4, min: 0.05, max: 1.5, step: 0.01 },
      { id: "delta", label: "Predator Efficiency (δ)", type: "number", default: 0.1, min: 0.01, max: 0.5, step: 0.01 },
    ],
  },
  time: {
    steps: 600,
    dt: 0.05,
    playbackRate: 60,
    unit: "mo",
  },
  initial: () => ({
    prey: 20.0,
    predator: 5.0,
  }),
  step: (prev, params, dt) => {
    const alpha = Number(params.alpha ?? 1.1);
    const beta = Number(params.beta ?? 0.4);
    const gamma = Number(params.gamma ?? 0.4);
    const delta = Number(params.delta ?? 0.1);

    const x = Math.max(0, prev.prey ?? 20);
    const y = Math.max(0, prev.predator ?? 5);

    const dPrey = alpha * x - beta * x * y;
    const dPredator = delta * x * y - gamma * y;

    return {
      prey: Math.max(0, x + dPrey * dt),
      predator: Math.max(0, y + dPredator * dt),
    };
  },
});
