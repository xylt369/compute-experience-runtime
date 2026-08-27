import type { ModelDefinition } from "../../../runtime/model.schema";

export const lorenz: ModelDefinition = {
  manifest: {
    id: "lorenz-attractor",
    name: "Lorenz attractor",
    description: "A deterministic chaotic system with an inspectable 3D trajectory.",
    version: "0.1.0",
    renderer: "trajectory-3d",
    parameters: [
      { id: "sigma", label: "σ", type: "number", default: 10, min: 0, max: 30, step: 0.1, unit: "" },
      { id: "rho", label: "ρ", type: "number", default: 28, min: 0, max: 60, step: 0.1, unit: "" },
      { id: "beta", label: "β", type: "number", default: 8 / 3, min: 0.1, max: 10, step: 0.01, unit: "" },
    ],
    state: ["x", "y", "z"],
    derived: ["radius"],
  },
  time: { steps: 900, dt: 0.01, playbackRate: 1.5 },
  initial() {
    return { x: 1, y: 1, z: 1 };
  },
  step(state, parameters, dt) {
    const x = state.x;
    const y = state.y;
    const z = state.z;
    const sigma = Number(parameters.sigma);
    const rho = Number(parameters.rho);
    const beta = Number(parameters.beta);
    const dx = sigma * (y - x);
    const dy = x * (rho - z) - y;
    const dz = x * y - beta * z;
    return { x: x + dx * dt, y: y + dy * dt, z: z + dz * dt };
  },
  derive(state) {
    return { radius: Math.hypot(state.x, state.y, state.z) };
  },
};
