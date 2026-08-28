import { defineModel, type ModelDefinition } from "@compute-experience/core";

export const rossler: ModelDefinition = defineModel({
  manifest: {
    id: "rossler-attractor",
    name: "Rössler attractor",
    description: "A low-dimensional chaotic flow with a characteristic spiral-and-fold trajectory.",
    version: "0.1.0",
    renderer: "trajectory-3d",
    parameters: [
      { id: "a", label: "a", type: "number", default: 0.2, min: 0, max: 1, step: 0.01, unit: "" },
      { id: "b", label: "b", type: "number", default: 0.2, min: 0, max: 1, step: 0.01, unit: "" },
      { id: "c", label: "c", type: "number", default: 5.7, min: 1, max: 12, step: 0.1, unit: "" },
    ],
    state: ["x", "y", "z"],
    derived: ["radius"],
    experience: {
      profile: "instrument",
      label: "Dynamical Flow",
      targets: ["x", "y", "z"],
      capabilities: {
        intervene: false,
        replay: false,
        fork: true,
        compare: true,
      },
      options: { autoPlay: true },
    },
  },
  time: { steps: 900, dt: 0.03, playbackRate: 3, unit: "s" },
  initial() {
    return { x: 0.1, y: 0, z: 0 };
  },
  step(state, parameters, dt) {
    const x = state.x;
    const y = state.y;
    const z = state.z;
    const a = Number(parameters.a);
    const b = Number(parameters.b);
    const c = Number(parameters.c);
    const dx = -y - z;
    const dy = x + a * y;
    const dz = b + z * (x - c);
    return { x: x + dx * dt, y: y + dy * dt, z: z + dz * dt };
  },
  derive(state) {
    return { radius: Math.hypot(state.x, state.y, state.z) };
  },
});
