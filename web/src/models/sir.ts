import type { ModelDefinition } from "../../../runtime/model.schema";

export const sir: ModelDefinition = {
  manifest: {
    id: "sir-epidemic",
    name: "SIR epidemic",
    description: "A deterministic compartment model for susceptible, infected, and recovered populations.",
    version: "0.1.0",
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
    ],
    state: ["susceptible", "infected", "recovered"],
    derived: ["infectedFraction", "reproductionNumber", "peakRisk"],
  },
  time: { steps: 900, dt: 0.25, playbackRate: 25 },
  initial(parameters = {}) {
    const n = Math.max(1, Number(parameters.population ?? 1000));
    const i0 = Math.min(n, Math.max(0, Number(parameters.initialInfected ?? 10)));
    return { susceptible: n - i0, infected: i0, recovered: 0 };
  },
  step(state, parameters, dt) {
    const n = Math.max(1, Number(parameters.population));
    const beta = Math.max(0, Number(parameters.contactRate));
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
    return {
      infectedFraction: state.infected / n,
      reproductionNumber: gamma ? beta / gamma : Number.POSITIVE_INFINITY,
      peakRisk: (beta * state.infected) / n,
    };
  },
};
