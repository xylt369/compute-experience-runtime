import type { ModelDefinition, ModelFrame } from "./model.schema";

export function simulate(
  model: ModelDefinition,
  parameters: Record<string, unknown>,
  options?: { steps?: number; dt?: number; initial?: Record<string, number> },
): ModelFrame[] {
  const steps = options?.steps ?? model.time?.steps ?? 900;
  const dt = options?.dt ?? model.time?.dt ?? 0.01;
  if (steps < 1) throw new Error("steps must be >= 1");
  if (dt <= 0) throw new Error("dt must be > 0");

  let state = { ...(options?.initial ?? model.initial(parameters)) };
  const frames: ModelFrame[] = [];
  for (let i = 0; i < steps; i += 1) {
    const derived = model.derive ? model.derive(state, parameters) : {};
    frames.push({ t: i * dt, state: { ...state }, derived: { ...derived } });
    state = model.step(state, parameters, dt);
  }
  return frames;
}
