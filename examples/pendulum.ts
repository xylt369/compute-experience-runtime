import { defineModel, type ModelDefinition } from "@compute-experience/core";

export const pendulum: ModelDefinition = defineModel({
  manifest: {
    id: "simple-pendulum",
    name: "Simple pendulum",
    description:
      "A nonlinear pendulum. Large angles can fold over the top; drag the bob to set the initial state.",
    version: "0.2.0",
    renderer: "pendulum-2d",
    parameters: [
      { id: "gravity", label: "Gravity", type: "number", default: 9.8, min: 1, max: 20, step: 0.1, unit: "m/s²" },
      { id: "length", label: "Length", type: "number", default: 1.6, min: 0.5, max: 3, step: 0.1, unit: "m" },
      { id: "angle", label: "Initial angle", type: "number", default: 28, min: -170, max: 170, step: 1, unit: "deg" },
    ],
    state: ["angle", "angularVelocity"],
    derived: ["period", "angularFrequency"],
  },
  time: { steps: 900, dt: 0.016, playbackRate: 2, unit: "s" },
  initial(parameters = {}) {
    const deg = Number(parameters.angle ?? 28);
    return { angle: (deg * Math.PI) / 180, angularVelocity: 0 };
  },
  step(state, parameters, dt) {
    const g = Number(parameters.gravity);
    const length = Math.max(Number(parameters.length), 1e-9);
    let angularVelocity = state.angularVelocity;
    let angle = state.angle;
    const alpha = -(g / length) * Math.sin(angle);
    angularVelocity += alpha * dt;
    angle += angularVelocity * dt;
    return { angle, angularVelocity };
  },
  derive(_state, parameters) {
    const g = Number(parameters.gravity);
    const length = Math.max(Number(parameters.length), 1e-9);
    const omega = Math.sqrt(g / length);
    return { period: (2 * Math.PI) / omega, angularFrequency: omega };
  },
});
