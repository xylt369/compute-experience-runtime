import { defineModel, type ModelDefinition } from "@compute-experience/core";
import type { ComputationTrace, ExplainStepContext, TraceReference, TraceTerm } from "@compute-experience/core";

type ExplainResult = Omit<ComputationTrace, "inputFrameIndex" | "inputTime">;

function stateRef(
  field: string,
  value: number,
  frameIndex: number,
  label?: string,
): TraceReference {
  return {
    kind: "state",
    id: `${field}@${frameIndex}`,
    label: label ?? field,
    value,
    frameIndex,
    field,
  };
}

function paramRef(id: string, label: string, value: number): TraceReference {
  return { kind: "parameter", id, label, value };
}

function dtRef(value: number): TraceReference {
  return { kind: "dt", id: "dt", label: "dt", value };
}

function explainX(ctx: ExplainStepContext) {
  const { state, parameters, dt, t, frameIndex } = ctx;
  const x = state.x;
  const y = state.y;
  const sigma = Number(parameters.sigma);
  const yMinusX = y - x;
  const sigmaTerm = sigma * yMinusX;
  const xNext = x + sigmaTerm * dt;

  const children: TraceTerm[] = [
    {
      id: "x_prev",
      label: "x",
      symbol: "x",
      value: x,
      role: "operand",
      refs: [stateRef("x", x, frameIndex)],
    },
    {
      id: "sigma_y_minus_x",
      label: "σ(y − x)",
      value: sigmaTerm,
      role: "product",
      children: [
        {
          id: "sigma",
          label: "σ",
          symbol: "σ",
          value: sigma,
          role: "coefficient",
          refs: [paramRef("sigma", "σ", sigma)],
        },
        {
          id: "y_minus_x",
          label: "y − x",
          value: yMinusX,
          role: "difference",
          children: [
            {
              id: "y_prev",
              label: "y",
              symbol: "y",
              value: y,
              role: "operand",
              refs: [stateRef("y", y, frameIndex)],
            },
            {
              id: "x_in_diff",
              label: "x",
              symbol: "x",
              value: x,
              role: "operand",
              refs: [stateRef("x", x, frameIndex, "x")],
            },
          ],
        },
      ],
    },
    {
      id: "dt",
      label: "dt",
      symbol: "dt",
      value: dt,
      role: "coefficient",
      refs: [dtRef(dt)],
    },
  ];

  return {
    field: "x",
    frameIndex: frameIndex + 1,
    time: t + dt,
    dt,
    formula: "x_next = x + σ(y − x) · dt",
    result: {
      id: "x_next",
      label: "x_next",
      symbol: "x",
      value: xNext,
      role: "result",
      children,
    },
  } satisfies ExplainResult;
}

function explainY(ctx: ExplainStepContext) {
  const { state, parameters, dt, t, frameIndex } = ctx;
  const x = state.x;
  const y = state.y;
  const z = state.z;
  const rho = Number(parameters.rho);
  const rhoMinusZ = rho - z;
  const xRhoZ = x * rhoMinusZ;
  const dy = xRhoZ - y;
  const yNext = y + dy * dt;

  return {
    field: "y",
    frameIndex: frameIndex + 1,
    time: t + dt,
    dt,
    formula: "y_next = y + (x(ρ − z) − y) · dt",
    result: {
      id: "y_next",
      label: "y_next",
      symbol: "y",
      value: yNext,
      role: "result",
      children: [
        {
          id: "y_prev",
          label: "y",
          symbol: "y",
          value: y,
          role: "operand",
          refs: [stateRef("y", y, frameIndex)],
        },
        {
          id: "x_rho_minus_z",
          label: "x(ρ − z)",
          value: xRhoZ,
          role: "product",
          children: [
            {
              id: "x_prev",
              label: "x",
              symbol: "x",
              value: x,
              role: "operand",
              refs: [stateRef("x", x, frameIndex)],
            },
            {
              id: "rho_minus_z",
              label: "ρ − z",
              value: rhoMinusZ,
              role: "difference",
              children: [
                {
                  id: "rho",
                  label: "ρ",
                  symbol: "ρ",
                  value: rho,
                  role: "coefficient",
                  refs: [paramRef("rho", "ρ", rho)],
                },
                {
                  id: "z_prev",
                  label: "z",
                  symbol: "z",
                  value: z,
                  role: "operand",
                  refs: [stateRef("z", z, frameIndex)],
                },
              ],
            },
          ],
        },
        {
          id: "dt",
          label: "dt",
          symbol: "dt",
          value: dt,
          role: "coefficient",
          refs: [dtRef(dt)],
        },
      ],
    },
  } satisfies ExplainResult;
}

function explainZ(ctx: ExplainStepContext) {
  const { state, parameters, dt, t, frameIndex } = ctx;
  const x = state.x;
  const y = state.y;
  const z = state.z;
  const beta = Number(parameters.beta);
  const xy = x * y;
  const betaZ = beta * z;
  const dz = xy - betaZ;
  const zNext = z + dz * dt;

  return {
    field: "z",
    frameIndex: frameIndex + 1,
    time: t + dt,
    dt,
    formula: "z_next = z + (x·y − β·z) · dt",
    result: {
      id: "z_next",
      label: "z_next",
      symbol: "z",
      value: zNext,
      role: "result",
      children: [
        {
          id: "z_prev",
          label: "z",
          symbol: "z",
          value: z,
          role: "operand",
          refs: [stateRef("z", z, frameIndex)],
        },
        {
          id: "x_times_y",
          label: "x·y",
          value: xy,
          role: "product",
          children: [
            {
              id: "x_prev",
              label: "x",
              symbol: "x",
              value: x,
              role: "operand",
              refs: [stateRef("x", x, frameIndex)],
            },
            {
              id: "y_prev",
              label: "y",
              symbol: "y",
              value: y,
              role: "operand",
              refs: [stateRef("y", y, frameIndex)],
            },
          ],
          refs: [stateRef("x", x, frameIndex), stateRef("y", y, frameIndex)],
        },
        {
          id: "beta_times_z",
          label: "β·z",
          value: betaZ,
          role: "product",
          children: [
            {
              id: "beta",
              label: "β",
              symbol: "β",
              value: beta,
              role: "coefficient",
              refs: [paramRef("beta", "β", beta)],
            },
            {
              id: "z_in_product",
              label: "z",
              symbol: "z",
              value: z,
              role: "operand",
              refs: [stateRef("z", z, frameIndex)],
            },
          ],
        },
        {
          id: "dt",
          label: "dt",
          symbol: "dt",
          value: dt,
          role: "coefficient",
          refs: [dtRef(dt)],
        },
      ],
    },
  } satisfies ExplainResult;
}

export const lorenz: ModelDefinition = defineModel({
  manifest: {
    id: "lorenz-attractor",
    name: "Lorenz attractor",
    description: "A deterministic chaotic system — inspect, trace, intervene, and replay.",
    version: "0.2.0",
    renderer: "trajectory-3d",
    parameters: [
      { id: "sigma", label: "σ", type: "number", default: 10, min: 0, max: 30, step: 0.1, unit: "" },
      { id: "rho", label: "ρ", type: "number", default: 28, min: 0, max: 60, step: 0.1, unit: "" },
      { id: "beta", label: "β", type: "number", default: 8 / 3, min: 0.1, max: 10, step: 0.01, unit: "" },
    ],
    state: ["x", "y", "z"],
    derived: ["radius"],
  },
  time: { steps: 900, dt: 0.01, playbackRate: 1.5, unit: "s" },
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
  explain(ctx, field) {
    if (field === "x") return explainX(ctx);
    if (field === "y") return explainY(ctx);
    if (field === "z") return explainZ(ctx);
    return null;
  },
});
