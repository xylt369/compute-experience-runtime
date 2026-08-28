import { defineModel, type ModelDefinition } from "@compute-experience/core";

function effectiveContactRate(
  parameters: Record<string, unknown>,
  t = 0,
): number {
  const beta = Math.max(0, Number(parameters.contactRate));
  const start = Math.max(0, Number(parameters.interventionStartDay ?? 20));
  const factor = Math.min(1, Math.max(0, Number(parameters.interventionFactor ?? 0.45)));
  return t >= start ? beta * factor : beta;
}

export const sir: ModelDefinition = defineModel({
  manifest: {
    id: "sir-epidemic",
    name: "SIR Counterfactual",
    description:
      "A deterministic epidemic scenario: same past, different intervention timing, different future.",
    version: "0.2.0",
    renderer: "timeseries-2d",
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
    state: ["susceptible", "infected", "recovered"],
    derived: ["infectedFraction", "reproductionNumber", "interventionActive"],
    experience: {
      profile: "counterfactual",
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
    },
  },
  time: { steps: 900, dt: 0.25, playbackRate: 25, unit: "d" },
  initial(parameters = {}) {
    const n = Math.max(1, Number(parameters.population ?? 1000));
    const i0 = Math.min(n, Math.max(0, Number(parameters.initialInfected ?? 10)));
    return { susceptible: n - i0, infected: i0, recovered: 0 };
  },
  step(state, parameters, dt, t = 0) {
    const n = Math.max(1, Number(parameters.population));
    const beta = effectiveContactRate(parameters, t);
    const gamma = Math.max(0, Number(parameters.recoveryRate));
    let { susceptible: s, infected: i, recovered: r } = state;
    const dS = (-beta * s * i) / n;
    const dI = (beta * s * i) / n - gamma * i;
    const dR = gamma * i;
    s = Math.max(0, s + dS * dt);
    i = Math.max(0, i + dI * dt);
    r = Math.min(n, Math.max(0, r + dR * dt));
    return { susceptible: s, infected: i, recovered: r };
  },
  derive(state, parameters) {
    const n = Math.max(1, Number(parameters.population));
    const beta = Math.max(0, Number(parameters.contactRate));
    const gamma = Math.max(0, Number(parameters.recoveryRate));
    const start = Math.max(0, Number(parameters.interventionStartDay ?? 20));
    return {
      infectedFraction: state.infected / n,
      reproductionNumber: gamma ? beta / gamma : Number.POSITIVE_INFINITY,
      interventionActive: start,
    };
  },
});
