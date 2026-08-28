import type { ComposedModel } from "./types";

/** Lorenz attractor as a trace-safe composed primitive graph. */
export const lorenzComposedModel: ComposedModel = {
  id: "lorenz-composed",
  version: "0.1.0",
  state: ["x", "y", "z"],
  parameters: [
    { id: "sigma", label: "σ", default: 10 },
    { id: "rho", label: "ρ", default: 28 },
    { id: "beta", label: "β", default: 8 / 3 },
  ],
  initial: { x: 1, y: 1, z: 1 },
  time: { steps: 900, dt: 0.01, playbackRate: 1.5, unit: "s" },
  formulas: {
    x: "x_next = x + σ(y − x) · dt",
    y: "y_next = y + (x(ρ − z) − y) · dt",
    z: "z_next = z + (x·y − β·z) · dt",
  },
  nodes: [
    {
      id: "y_minus_x",
      primitive: "constant-offset",
      label: "y − x",
      inputs: {
        minuend: { kind: "state", field: "y" },
        subtrahend: { kind: "state", field: "x" },
      },
    },
    {
      id: "sigma_term",
      primitive: "linear-coupling",
      label: "σ(y − x)",
      inputs: {
        signal: { kind: "node", nodeId: "y_minus_x", port: "out" },
        coeff: { kind: "parameter", id: "sigma" },
      },
    },
    {
      id: "x_next",
      primitive: "integrate",
      inputs: {
        state: { kind: "state", field: "x" },
        rate: { kind: "node", nodeId: "sigma_term", port: "out" },
        dt: { kind: "dt" },
      },
    },
    {
      id: "rho_minus_z",
      primitive: "constant-offset",
      label: "ρ − z",
      inputs: {
        minuend: { kind: "parameter", id: "rho" },
        subtrahend: { kind: "state", field: "z" },
      },
    },
    {
      id: "x_rho_z",
      primitive: "product-coupling",
      label: "x(ρ − z)",
      inputs: {
        a: { kind: "state", field: "x" },
        b: { kind: "node", nodeId: "rho_minus_z", port: "out" },
      },
    },
    {
      id: "dy_rate",
      primitive: "constant-offset",
      label: "x(ρ − z) − y",
      inputs: {
        minuend: { kind: "node", nodeId: "x_rho_z", port: "out" },
        subtrahend: { kind: "state", field: "y" },
      },
    },
    {
      id: "y_next",
      primitive: "integrate",
      inputs: {
        state: { kind: "state", field: "y" },
        rate: { kind: "node", nodeId: "dy_rate", port: "out" },
        dt: { kind: "dt" },
      },
    },
    {
      id: "x_times_y",
      primitive: "product-coupling",
      label: "x·y",
      inputs: {
        a: { kind: "state", field: "x" },
        b: { kind: "state", field: "y" },
      },
    },
    {
      id: "beta_z",
      primitive: "linear-coupling",
      label: "β·z",
      inputs: {
        signal: { kind: "state", field: "z" },
        coeff: { kind: "parameter", id: "beta" },
      },
    },
    {
      id: "dz_rate",
      primitive: "constant-offset",
      label: "x·y − β·z",
      inputs: {
        minuend: { kind: "node", nodeId: "x_times_y", port: "out" },
        subtrahend: { kind: "node", nodeId: "beta_z", port: "out" },
      },
    },
    {
      id: "z_next",
      primitive: "integrate",
      inputs: {
        state: { kind: "state", field: "z" },
        rate: { kind: "node", nodeId: "dz_rate", port: "out" },
        dt: { kind: "dt" },
      },
    },
  ],
  integrators: [
    { state: "x", node: "x_next" },
    { state: "y", node: "y_next" },
    { state: "z", node: "z_next" },
  ],
};
