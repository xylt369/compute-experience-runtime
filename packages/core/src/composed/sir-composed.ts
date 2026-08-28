import type { ModelDefinition, ModelExperience } from "../protocol/types";
import { createComposedExecutor } from "./executor";
import type { ComposedModel } from "./types";

function effectiveContactRate(parameters: Record<string, unknown>, t = 0): number {
  const beta = Math.max(0, Number(parameters.contactRate));
  const start = Math.max(0, Number(parameters.interventionStartDay ?? 20));
  const factor = Math.min(1, Math.max(0, Number(parameters.interventionFactor ?? 0.45)));
  return t >= start ? beta * factor : beta;
}

/** SIR epidemic ODE as a trace-safe composed primitive graph. */
export const sirComposedModel: ComposedModel = {
  id: "sir-composed",
  version: "0.1.0",
  state: ["susceptible", "infected", "recovered"],
  parameters: [
    { id: "population", label: "N", default: 1000 },
    { id: "contactRate", label: "β", default: 0.55 },
    { id: "recoveryRate", label: "γ", default: 0.12 },
  ],
  initial: { susceptible: 990, infected: 10, recovered: 0 },
  time: { steps: 900, dt: 0.25, playbackRate: 25, unit: "d" },
  formulas: {
    susceptible: "S_next = S − (β·S·I/N) · dt",
    infected: "I_next = I + (β·S·I/N − γ·I) · dt",
    recovered: "R_next = R + (γ·I) · dt",
  },
  nodes: [
    {
      id: "s_times_i",
      primitive: "product-coupling",
      label: "S·I",
      inputs: {
        a: { kind: "state", field: "susceptible" },
        b: { kind: "state", field: "infected" },
      },
    },
    {
      id: "si_over_n",
      primitive: "ratio",
      label: "S·I/N",
      inputs: {
        numerator: { kind: "node", nodeId: "s_times_i", port: "out" },
        denominator: { kind: "parameter", id: "population" },
      },
    },
    {
      id: "infection_flux",
      primitive: "linear-coupling",
      label: "β·S·I/N",
      inputs: {
        signal: { kind: "node", nodeId: "si_over_n", port: "out" },
        coeff: { kind: "parameter", id: "contactRate" },
      },
    },
    {
      id: "neg_infection",
      primitive: "scaled-negation",
      label: "−β·S·I/N",
      inputs: {
        signal: { kind: "node", nodeId: "infection_flux", port: "out" },
      },
    },
    {
      id: "recovery_flux",
      primitive: "linear-coupling",
      label: "γ·I",
      inputs: {
        signal: { kind: "state", field: "infected" },
        coeff: { kind: "parameter", id: "recoveryRate" },
      },
    },
    {
      id: "dI_rate",
      primitive: "constant-offset",
      label: "β·S·I/N − γ·I",
      inputs: {
        minuend: { kind: "node", nodeId: "infection_flux", port: "out" },
        subtrahend: { kind: "node", nodeId: "recovery_flux", port: "out" },
      },
    },
    {
      id: "s_next",
      primitive: "integrate",
      inputs: {
        state: { kind: "state", field: "susceptible" },
        rate: { kind: "node", nodeId: "neg_infection", port: "out" },
        dt: { kind: "dt" },
      },
    },
    {
      id: "i_next",
      primitive: "integrate",
      inputs: {
        state: { kind: "state", field: "infected" },
        rate: { kind: "node", nodeId: "dI_rate", port: "out" },
        dt: { kind: "dt" },
      },
    },
    {
      id: "r_next",
      primitive: "integrate",
      inputs: {
        state: { kind: "state", field: "recovered" },
        rate: { kind: "node", nodeId: "recovery_flux", port: "out" },
        dt: { kind: "dt" },
      },
    },
  ],
  integrators: [
    { state: "susceptible", node: "s_next" },
    { state: "infected", node: "i_next" },
    { state: "recovered", node: "r_next" },
  ],
};

/** Counterfactual epidemic experience — shared by handwritten and compiled SIR models. */
export const SIR_EPIDEMIC_EXPERIENCE: ModelExperience = {
  profile: "counterfactual",
  capabilities: {
    inspect: true,
    trace: false,
    intervene: true,
    replay: true,
    fork: true,
    compare: true,
  },
  label: "Epidemic History",
  targets: [
    { id: "susceptible", kind: "state", label: "S", inspectable: true },
    { id: "infected", kind: "state", label: "I", inspectable: true },
    { id: "recovered", kind: "state", label: "R", inspectable: true },
    {
      id: "interventionStartDay",
      kind: "parameter",
      label: "Intervention",
      inspectable: true,
      visualRole: "intervention",
    },
  ],
  options: {
    autoPlay: false,
    showOutcomes: true,
    intervention: {
      mode: "parameter",
      parameterId: "interventionStartDay",
      forkValue: 10,
      label: "Intervention start",
    },
  },
};

function sirInitial(parameters: Record<string, unknown> = {}): Record<string, number> {
  const n = Math.max(1, Number(parameters.population ?? 1000));
  const i0 = Math.min(n, Math.max(0, Number(parameters.initialInfected ?? 10)));
  return { susceptible: n - i0, infected: i0, recovered: 0 };
}

function sirStepParameters(
  parameters: Record<string, unknown>,
  t: number,
): Record<string, unknown> {
  const n = Math.max(1, Number(parameters.population));
  const beta = effectiveContactRate(parameters, t);
  const gamma = Math.max(0, Number(parameters.recoveryRate));
  return { ...parameters, population: n, contactRate: beta, recoveryRate: gamma };
}

function clampSirState(
  state: Record<string, number>,
  n: number,
): Record<string, number> {
  return {
    susceptible: Math.max(0, state.susceptible ?? 0),
    infected: Math.max(0, state.infected ?? 0),
    recovered: Math.min(n, Math.max(0, state.recovered ?? 0)),
  };
}

export interface SirModelManifestExtras {
  id?: string;
  name?: string;
  description?: string;
}

/** Wrap any validated SIR-shaped composed graph for Runtime loading. */
export function wrapSirComposedModel(
  model: ComposedModel,
  manifestExtras: SirModelManifestExtras = {},
): ModelDefinition {
  const executor = createComposedExecutor(model);
  const base = executor.toModelDefinition({
    id: manifestExtras.id ?? model.id,
    name: manifestExtras.name ?? model.id,
    description: manifestExtras.description ?? "Composed SIR epidemic model.",
    renderer: "timeseries-2d",
    experience: SIR_EPIDEMIC_EXPERIENCE,
    parameters: [
      {
        id: "population",
        label: "Population",
        type: "number",
        default: 1000,
        min: 100,
        max: 1000000,
        step: 100,
        unit: "people",
      },
      {
        id: "contactRate",
        label: "Contact rate",
        type: "number",
        default: 0.55,
        min: 0,
        max: 2,
        step: 0.01,
        unit: "1/day",
      },
      {
        id: "recoveryRate",
        label: "Recovery rate",
        type: "number",
        default: 0.12,
        min: 0.01,
        max: 1,
        step: 0.01,
        unit: "1/day",
      },
      {
        id: "initialInfected",
        label: "Initial infected",
        type: "number",
        default: 10,
        min: 1,
        max: 500,
        step: 1,
        unit: "people",
      },
      {
        id: "interventionStartDay",
        label: "Intervention start",
        type: "number",
        default: 20,
        min: 0,
        max: 120,
        step: 1,
        unit: "d",
      },
      {
        id: "interventionFactor",
        label: "Contact retention",
        type: "number",
        default: 0.45,
        min: 0.05,
        max: 1,
        step: 0.05,
        unit: "×",
      },
    ],
  });

  return {
    ...base,
    initial: sirInitial,
    step(state, parameters, dt, t = 0) {
      const n = Math.max(1, Number(parameters.population));
      const resolved = sirStepParameters(parameters, t);
      const next = executor.step(state, resolved, dt);
      return clampSirState(next, n);
    },
    explain(ctx, field) {
      const resolved = sirStepParameters(ctx.parameters, ctx.t);
      return executor.explain({ ...ctx, parameters: resolved }, field);
    },
  };
}

/** Handwritten-compatible ModelDefinition backed by the composed SIR graph. */
export function createSirComposedModelDefinition(): ModelDefinition {
  return wrapSirComposedModel(sirComposedModel, {
    id: "sir-epidemic-composed",
    name: "SIR (composed)",
    description: "Composed SIR epidemic model.",
  });
}
