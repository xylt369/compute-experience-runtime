import type { Wire } from "./types";

export class WireResolutionError extends Error {
  readonly code: string;
  readonly path?: string;

  constructor(code: string, message: string, path?: string) {
    super(message);
    this.name = "WireResolutionError";
    this.code = code;
    this.path = path;
  }
}

export interface WireResolutionContext {
  state: Record<string, number>;
  parameters: Record<string, unknown>;
  dt: number;
  nodeValues?: Map<string, { value: number }>;
  /** Optional context for error messages, e.g. `nodes/sigma_term/inputs/signal`. */
  location?: string;
}

/** Resolve a wire to a numeric value; missing inputs fail explicitly (never silently 0). */
export function resolveWireValue(wire: Wire, ctx: WireResolutionContext): number {
  const loc = ctx.location ? ` at ${ctx.location}` : "";

  switch (wire.kind) {
    case "state": {
      if (!Object.prototype.hasOwnProperty.call(ctx.state, wire.field)) {
        throw new WireResolutionError(
          "MISSING_STATE",
          `State field "${wire.field}" is not defined${loc}.`,
          `state/${wire.field}`,
        );
      }
      const value = ctx.state[wire.field]!;
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new WireResolutionError(
          "INVALID_STATE",
          `State field "${wire.field}" is not a finite number${loc}.`,
          `state/${wire.field}`,
        );
      }
      return value;
    }
    case "parameter": {
      if (!Object.prototype.hasOwnProperty.call(ctx.parameters, wire.id)) {
        throw new WireResolutionError(
          "MISSING_PARAMETER",
          `Parameter "${wire.id}" is not defined${loc}.`,
          `parameter/${wire.id}`,
        );
      }
      const value = Number(ctx.parameters[wire.id]);
      if (Number.isNaN(value)) {
        throw new WireResolutionError(
          "INVALID_PARAMETER",
          `Parameter "${wire.id}" is not numeric${loc}.`,
          `parameter/${wire.id}`,
        );
      }
      return value;
    }
    case "constant":
      return wire.value;
    case "dt":
      return ctx.dt;
    case "node": {
      const evaluation = ctx.nodeValues?.get(wire.nodeId);
      if (!evaluation) {
        throw new WireResolutionError(
          "MISSING_NODE",
          `Node "${wire.nodeId}" has not been evaluated${loc}.`,
          `node/${wire.nodeId}`,
        );
      }
      if (Number.isNaN(evaluation.value)) {
        throw new WireResolutionError(
          "INVALID_NODE_VALUE",
          `Node "${wire.nodeId}" evaluated to NaN${loc}.`,
          `node/${wire.nodeId}`,
        );
      }
      return evaluation.value;
    }
    default:
      throw new WireResolutionError("UNKNOWN_WIRE", `Unknown wire kind${loc}.`);
  }
}
