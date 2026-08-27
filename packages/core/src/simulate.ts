import type { ModelDefinition, StateFrame } from "./protocol/types";

export function simulate(
  model: ModelDefinition,
  parameters: Record<string, unknown>,
  options?: { steps?: number; dt?: number; initial?: Record<string, number> },
): StateFrame[] {
  const steps = options?.steps ?? model.time?.steps ?? 900;
  const dt = options?.dt ?? model.time?.dt ?? 0.01;
  if (steps < 1) throw new Error("steps must be >= 1");
  if (dt <= 0) throw new Error("dt must be > 0");

  let state = { ...(options?.initial ?? model.initial(parameters)) };
  const frames: StateFrame[] = [];
  for (let i = 0; i < steps; i += 1) {
    const derived = model.derive ? model.derive(state, parameters) : {};
    frames.push({ t: i * dt, state: { ...state }, derived: { ...derived } });
    state = model.step(state, parameters, dt);
  }
  return frames;
}

/** Continue a trajectory after a fork point (does not include the fork frame). */
export function continueSimulate(
  model: ModelDefinition,
  parameters: Record<string, unknown>,
  options: {
    fromState: Record<string, number>;
    fromTime: number;
    steps: number;
    dt?: number;
  },
): StateFrame[] {
  const dt = options.dt ?? model.time?.dt ?? 0.01;
  if (options.steps < 0) throw new Error("steps must be >= 0");
  if (dt <= 0) throw new Error("dt must be > 0");

  let state = { ...options.fromState };
  const frames: StateFrame[] = [];
  for (let i = 1; i <= options.steps; i += 1) {
    state = model.step(state, parameters, dt);
    const derived = model.derive ? model.derive(state, parameters) : {};
    frames.push({
      t: options.fromTime + i * dt,
      state: { ...state },
      derived: { ...derived },
    });
  }
  return frames;
}
