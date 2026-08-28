import type { ExplainStepContext, TraceReference, TraceTerm } from "../trace";
import type { PrimitiveId, PrimitivePorts, Wire } from "./types";
import { resolveWireValue } from "./wire-resolution";

export interface TraceBuildContext {
  ctx: ExplainStepContext;
  nodeId: string;
  label?: string;
  inputs: Record<string, TraceTerm>;
  inputWires: Record<string, Wire>;
}

function stateRef(field: string, value: number, frameIndex: number, label?: string): TraceReference {
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

function wireLabel(wire: Wire, fallback: string): string {
  if (wire.kind === "state") return wire.field;
  if (wire.kind === "parameter") return wire.id;
  if (wire.kind === "constant") return String(wire.value);
  if (wire.kind === "dt") return "dt";
  return fallback;
}

function operandFromWire(
  wire: Wire,
  term: TraceTerm,
  ctx: ExplainStepContext,
  location?: string,
): TraceTerm {
  if (wire.kind === "state") {
    const value = resolveWireValue(wire, {
      state: ctx.state,
      parameters: ctx.parameters,
      dt: ctx.dt,
      location,
    });
    return {
      id: `${wire.field}_prev`,
      label: wire.field,
      symbol: wire.field,
      value,
      role: "operand",
      refs: [stateRef(wire.field, value, ctx.frameIndex)],
    };
  }
  if (wire.kind === "parameter") {
    const value = resolveWireValue(wire, {
      state: ctx.state,
      parameters: ctx.parameters,
      dt: ctx.dt,
      location,
    });
    return {
      id: wire.id,
      label: wire.id,
      symbol: wire.id,
      value,
      role: "coefficient",
      refs: [paramRef(wire.id, wire.id, value)],
    };
  }
  if (wire.kind === "dt") {
    return {
      id: "dt",
      label: "dt",
      symbol: "dt",
      value: ctx.dt,
      role: "coefficient",
      refs: [dtRef(ctx.dt)],
    };
  }
  return term;
}

export interface PrimitiveDefinition {
  ports: PrimitivePorts;
  evaluate(inputs: Record<string, number>): number;
  traceTerm(context: TraceBuildContext): TraceTerm;
}

export const PRIMITIVE_REGISTRY: Record<PrimitiveId, PrimitiveDefinition> = {
  "linear-coupling": {
    ports: { inputs: { signal: "scalar", coeff: "scalar" }, outputs: { out: "scalar" } },
    evaluate({ signal, coeff }) {
      return coeff * signal;
    },
    traceTerm({ nodeId, label, inputs, inputWires, ctx }) {
      const signal = inputs.signal!;
      const coeff = inputs.coeff!;
      const coeffWire = inputWires.coeff!;
      const coeffTerm = operandFromWire(coeffWire, coeff, ctx, `nodes/${nodeId}/inputs/coeff`);
      return {
        id: nodeId,
        label: label ?? `${wireLabel(coeffWire, "k")}·${signal.label}`,
        value: coeff.value * signal.value,
        role: "product",
        children: [coeffTerm, signal],
      };
    },
  },

  "product-coupling": {
    ports: { inputs: { a: "scalar", b: "scalar" }, outputs: { out: "scalar" } },
    evaluate({ a, b }) {
      return a * b;
    },
    traceTerm({ nodeId, label, inputs }) {
      const a = inputs.a!;
      const b = inputs.b!;
      const refs: TraceReference[] = [];
      for (const child of [a, b]) {
        for (const ref of child.refs ?? []) refs.push(ref);
      }
      return {
        id: nodeId,
        label: label ?? `${a.label}·${b.label}`,
        value: a.value * b.value,
        role: "product",
        children: [a, b],
        refs: refs.length ? refs : undefined,
      };
    },
  },

  "scaled-negation": {
    ports: { inputs: { signal: "scalar" }, outputs: { out: "scalar" } },
    evaluate({ signal }) {
      return -signal;
    },
    traceTerm({ nodeId, label, inputs }) {
      const signal = inputs.signal!;
      return {
        id: nodeId,
        label: label ?? `−${signal.label}`,
        value: -signal.value,
        role: "operand",
        children: [signal],
      };
    },
  },

  "constant-offset": {
    ports: { inputs: { minuend: "scalar", subtrahend: "scalar" }, outputs: { out: "scalar" } },
    evaluate({ minuend, subtrahend }) {
      return minuend - subtrahend;
    },
    traceTerm({ nodeId, label, inputs }) {
      const minuend = inputs.minuend!;
      const subtrahend = inputs.subtrahend!;
      return {
        id: nodeId,
        label: label ?? `${minuend.label} − ${subtrahend.label}`,
        value: minuend.value - subtrahend.value,
        role: "difference",
        children: [minuend, subtrahend],
      };
    },
  },

  ratio: {
    ports: { inputs: { numerator: "scalar", denominator: "scalar" }, outputs: { out: "scalar" } },
    evaluate({ numerator, denominator }) {
      if (denominator === 0) return NaN;
      return numerator / denominator;
    },
    traceTerm({ nodeId, label, inputs }) {
      const numerator = inputs.numerator!;
      const denominator = inputs.denominator!;
      return {
        id: nodeId,
        label: label ?? `${numerator.label}/${denominator.label}`,
        value: denominator.value === 0 ? NaN : numerator.value / denominator.value,
        role: "product",
        children: [numerator, denominator],
      };
    },
  },

  "saturating-growth": {
    ports: { inputs: { state: "scalar", rate: "scalar", capacity: "scalar" }, outputs: { out: "scalar" } },
    evaluate({ state, rate, capacity }) {
      if (capacity === 0) return 0;
      return rate * state * (1 - state / capacity);
    },
    traceTerm({ nodeId, label, inputs }) {
      const state = inputs.state!;
      const rate = inputs.rate!;
      const capacity = inputs.capacity!;
      const value = capacity.value === 0 ? 0 : rate.value * state.value * (1 - state.value / capacity.value);
      return {
        id: nodeId,
        label: label ?? `${rate.label}·${state.label}·(1 − ${state.label}/${capacity.label})`,
        value,
        role: "product",
        children: [rate, state, capacity],
      };
    },
  },

  "nonlinear-restoring": {
    ports: { inputs: { angle: "scalar", frequencySq: "scalar" }, outputs: { out: "scalar" } },
    evaluate({ angle, frequencySq }) {
      return -frequencySq * Math.sin(angle);
    },
    traceTerm({ nodeId, label, inputs }) {
      const angle = inputs.angle!;
      const frequencySq = inputs.frequencySq!;
      return {
        id: nodeId,
        label: label ?? `−${frequencySq.label}·sin(${angle.label})`,
        value: -frequencySq.value * Math.sin(angle.value),
        role: "product",
        children: [frequencySq, angle],
      };
    },
  },

  magnitude: {
    ports: { inputs: { a: "scalar", b: "scalar" }, outputs: { out: "scalar" } },
    evaluate({ a, b }) {
      return Math.hypot(a, b);
    },
    traceTerm({ nodeId, label, inputs }) {
      const a = inputs.a!;
      const b = inputs.b!;
      return {
        id: nodeId,
        label: label ?? `√(${a.label}² + ${b.label}²)`,
        value: Math.hypot(a.value, b.value),
        role: "product",
        children: [a, b],
      };
    },
  },

  integrate: {
    ports: { inputs: { state: "scalar", rate: "scalar", dt: "scalar" }, outputs: { out: "scalar" } },
    evaluate({ state, rate, dt }) {
      return state + rate * dt;
    },
    traceTerm({ nodeId, label, inputs, inputWires, ctx }) {
      const stateWire = inputWires.state!;
      const rate = inputs.rate!;
      const dtTerm =
        inputs.dt ?? operandFromWire({ kind: "dt" }, {} as TraceTerm, ctx, `nodes/${nodeId}/inputs/dt`);
      const stateTerm = operandFromWire(
        stateWire,
        inputs.state!,
        ctx,
        `nodes/${nodeId}/inputs/state`,
      );
      const field = stateWire.kind === "state" ? stateWire.field : stateTerm.label;
      return {
        id: nodeId,
        label: label ?? `${field}_next`,
        symbol: field,
        value: stateTerm.value + rate.value * dtTerm.value,
        role: "result",
        children: [stateTerm, rate, dtTerm],
      };
    },
  },
};

export const PRIMITIVE_IDS = Object.keys(PRIMITIVE_REGISTRY) as PrimitiveId[];

export function getPrimitive(id: PrimitiveId): PrimitiveDefinition {
  return PRIMITIVE_REGISTRY[id];
}
