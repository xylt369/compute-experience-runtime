import type { ModelDefinition } from "../protocol/types";
import type { ComputationTrace, ExplainStepContext, TraceTerm } from "../trace";
import { getPrimitive } from "./primitives";
import type { ComposedModel, NodeEvaluation, Wire } from "./types";
import { validateComposedModel } from "./validator";
import { resolveWireValue } from "./wire-resolution";

type ExplainResult = Omit<ComputationTrace, "inputFrameIndex" | "inputTime">;

function evaluateNodes(
  model: ComposedModel,
  order: string[],
  state: Record<string, number>,
  parameters: Record<string, unknown>,
  dt: number,
): Map<string, NodeEvaluation> {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const values = new Map<string, NodeEvaluation>();

  for (const nodeId of order) {
    const node = nodeById.get(nodeId)!;
    const def = getPrimitive(node.primitive);
    const inputNums: Record<string, number> = {};
    for (const [port, wire] of Object.entries(node.inputs)) {
      inputNums[port] = resolveWireValue(wire, {
        state,
        parameters,
        dt,
        nodeValues: values,
        location: `nodes/${nodeId}/inputs/${port}`,
      });
    }
    values.set(nodeId, {
      value: def.evaluate(inputNums),
      inputs: inputNums,
      inputWires: node.inputs,
    });
  }
  return values;
}

function leafTraceTerm(wire: Wire, ctx: ExplainStepContext, nodeId: string, port: string): TraceTerm {
  const location = `nodes/${nodeId}/inputs/${port}`;

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
      refs: [
        {
          kind: "state",
          id: `${wire.field}@${ctx.frameIndex}`,
          label: wire.field,
          value,
          frameIndex: ctx.frameIndex,
          field: wire.field,
        },
      ],
    };
  }
  if (wire.kind === "parameter") {
    const value = resolveWireValue(wire, {
      state: ctx.state,
      parameters: ctx.parameters,
      dt: ctx.dt,
      location,
    });
    const label = wire.id;
    return {
      id: wire.id,
      label,
      symbol: label,
      value,
      role: "coefficient",
      refs: [{ kind: "parameter", id: wire.id, label, value }],
    };
  }
  if (wire.kind === "dt") {
    return {
      id: "dt",
      label: "dt",
      symbol: "dt",
      value: ctx.dt,
      role: "coefficient",
      refs: [{ kind: "dt", id: "dt", label: "dt", value: ctx.dt }],
    };
  }
  if (wire.kind === "constant") {
    return {
      id: `${nodeId}_${port}`,
      label: String(wire.value),
      value: wire.value,
      role: "operand",
      refs: [
        {
          kind: "constant",
          id: `${nodeId}_${port}`,
          label: String(wire.value),
          value: wire.value,
        },
      ],
    };
  }
  throw new Error(`Unsupported leaf wire kind for trace: ${(wire as Wire).kind}`);
}

function buildTraceTerm(
  model: ComposedModel,
  nodeId: string,
  ctx: ExplainStepContext,
  cache: Map<string, TraceTerm>,
  nodeValues: Map<string, NodeEvaluation>,
): TraceTerm {
  const cached = cache.get(nodeId);
  if (cached) return cached;

  const node = model.nodes.find((n) => n.id === nodeId)!;
  const def = getPrimitive(node.primitive);
  const resolvedInputs: Record<string, TraceTerm> = {};

  for (const [port, wire] of Object.entries(node.inputs)) {
    resolvedInputs[port] =
      wire.kind === "node"
        ? buildTraceTerm(model, wire.nodeId, ctx, cache, nodeValues)
        : leafTraceTerm(wire, ctx, nodeId, port);
  }

  const term = def.traceTerm({
    ctx,
    nodeId: node.id,
    label: node.label,
    inputs: resolvedInputs,
    inputWires: node.inputs,
  });
  cache.set(nodeId, term);
  return term;
}

function defaultFormula(field: string, rateTerm: TraceTerm): string {
  return `${field}_next = ${field} + ${rateTerm.label} · dt`;
}

function explainFieldFromGraph(
  model: ComposedModel,
  order: string[],
  ctx: ExplainStepContext,
  field: string,
): ExplainResult | null {
  const binding = model.integrators.find((b) => b.state === field);
  if (!binding) return null;

  const nodeValues = evaluateNodes(model, order, ctx.state, ctx.parameters, ctx.dt);
  const cache = new Map<string, TraceTerm>();
  const result = buildTraceTerm(model, binding.node, ctx, cache, nodeValues);

  const integrateNode = model.nodes.find((n) => n.id === binding.node)!;
  const rateWire = integrateNode.inputs.rate!;
  const rateTerm =
    rateWire.kind === "node"
      ? buildTraceTerm(model, rateWire.nodeId, ctx, cache, nodeValues)
      : (result.children?.[1] ?? result);

  const formula = model.formulas?.[field] ?? defaultFormula(field, rateTerm);

  return {
    field,
    frameIndex: ctx.frameIndex + 1,
    time: ctx.t + ctx.dt,
    dt: ctx.dt,
    formula,
    result,
  };
}

export interface ComposedExecutor {
  model: ComposedModel;
  order: string[];
  step(state: Record<string, number>, parameters: Record<string, unknown>, dt: number): Record<string, number>;
  explain(ctx: ExplainStepContext, field: string): ExplainResult | null;
  toModelDefinition(manifestExtras?: Partial<ModelDefinition["manifest"]>): ModelDefinition;
}

/** Compile a validated composed graph into a deterministic executor. */
export function createComposedExecutor(model: ComposedModel | unknown): ComposedExecutor {
  const validation = validateComposedModel(model);
  if (!validation.ok || !validation.order) {
    const summary = validation.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n");
    throw new Error(`Cannot create executor — invalid ComposedModel:\n${summary}`);
  }

  const composed = model as ComposedModel;
  const order = validation.order;
  const integratorMap = new Map(composed.integrators.map((b) => [b.state, b.node]));

  return {
    model: composed,
    order,
    step(state, parameters, dt) {
      const values = evaluateNodes(composed, order, state, parameters, dt);
      const next: Record<string, number> = {};
      for (const field of composed.state) {
        const nodeId = integratorMap.get(field)!;
        next[field] = values.get(nodeId)!.value;
      }
      return next;
    },
    explain(ctx, field) {
      return explainFieldFromGraph(composed, order, ctx, field);
    },
    toModelDefinition(manifestExtras) {
      const initialState = composed.initial ?? Object.fromEntries(composed.state.map((s) => [s, 0]));
      const executor = this;
      return {
        manifest: {
          id: composed.id,
          name: manifestExtras?.name ?? composed.id,
          description: manifestExtras?.description ?? "Composed model",
          version: composed.version,
          renderer: manifestExtras?.renderer ?? "timeseries-2d",
          parameters: composed.parameters.map((p) => ({
            id: p.id,
            label: p.label ?? p.id,
            type: "number" as const,
            default: p.default,
            min: 0,
            max: 100,
            step: 0.01,
          })),
          state: [...composed.state],
          ...manifestExtras,
        },
        time: composed.time
          ? {
              steps: composed.time.steps ?? 900,
              dt: composed.time.dt ?? 0.01,
              playbackRate: composed.time.playbackRate,
              unit: composed.time.unit,
            }
          : undefined,
        initial: () => ({ ...initialState }),
        step(state, parameters, dt) {
          return executor.step(state, parameters, dt);
        },
        explain(ctx, field) {
          return executor.explain(ctx, field);
        },
      };
    },
  };
}

export { assertValidComposedModel, validateComposedModel } from "./validator";
