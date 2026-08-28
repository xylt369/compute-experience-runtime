import type { ModelDefinition } from "./protocol/types";
import type { ComputationTrace, ExplainStepContext } from "./trace";

export function buildExplainContext(
  model: ModelDefinition,
  frames: readonly { t: number; state: Record<string, number> }[],
  frameIndex: number,
  parameters: Record<string, unknown>,
): ExplainStepContext | null {
  if (frameIndex < 0 || frameIndex >= frames.length) return null;
  const frame = frames[frameIndex]!;
  const dt = model.time?.dt ?? 0.01;
  if (frameIndex === 0) {
    return {
      state: frame.state,
      prevState: frame.state,
      parameters,
      dt,
      t: frame.t,
      frameIndex: 0,
    };
  }
  const prev = frames[frameIndex - 1]!;
  return {
    state: prev.state,
    prevState: frames[frameIndex - 2]?.state ?? prev.state,
    parameters,
    dt,
    t: prev.t,
    frameIndex: frameIndex - 1,
  };
}

export function explainField(
  model: ModelDefinition,
  frames: readonly { t: number; state: Record<string, number> }[],
  frameIndex: number,
  field: string,
  parameters: Record<string, unknown>,
): ComputationTrace | null {
  if (!model.explain) return null;
  const frame = frames[frameIndex];
  if (!frame) return null;
  const dt = model.time?.dt ?? 0.01;

  if (frameIndex === 0) {
    const value = frame.state[field];
    if (typeof value !== "number") return null;
    return {
      field,
      frameIndex: 0,
      time: frame.t,
      dt,
      formula: `${field}₀ = initial`,
      initial: true,
      result: {
        id: `${field}_initial`,
        label: field,
        symbol: field,
        value,
        role: "operand",
        refs: [
          {
            kind: "state",
            id: `${field}_0`,
            label: field,
            value,
            frameIndex: 0,
            field,
          },
        ],
      },
    };
  }

  const ctx = buildExplainContext(model, frames, frameIndex, parameters);
  if (!ctx) return null;
  const trace = model.explain(ctx, field);
  if (!trace) return null;
  return {
    ...trace,
    frameIndex,
    time: frame.t,
    dt,
  };
}
