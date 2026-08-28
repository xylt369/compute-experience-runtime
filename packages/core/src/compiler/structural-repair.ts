import type { ComposedModel, ComposedNode, ValidationDiagnostic, Wire } from "../composed/types";

/** Validation codes eligible for bounded structural repair. */
export const STRUCTURAL_ERROR_CODES = new Set([
  "SCHEMA_INVALID",
  "DUPLICATE_ID",
  "MISSING_PORT",
  "UNKNOWN_PORT",
  "UNRESOLVED_WIRE",
  "INVALID_TRACE_REF",
  "ORPHAN_STATE",
  "TYPE_MISMATCH",
  "MISSING_INTEGRATOR",
  "MISSING_INITIAL",
]);

/** Errors that must not trigger silent LLM rewriting. */
export const NON_REPAIRABLE_ERROR_CODES = new Set(["CYCLE_DETECTED", "UNKNOWN_PRIMITIVE"]);

const PORT_ALIASES: Record<string, string> = {
  output: "out",
  result: "out",
  value: "out",
};

function cloneModel(model: ComposedModel): ComposedModel {
  return structuredClone(model);
}

function normalizeNodePortAliases(node: ComposedNode): ComposedNode {
  const inputs: Record<string, Wire> = {};
  for (const [port, wire] of Object.entries(node.inputs)) {
    const normalizedPort = PORT_ALIASES[port] ?? port;
    if (wire.kind === "node") {
      inputs[normalizedPort] = {
        ...wire,
        port: PORT_ALIASES[wire.port] ?? wire.port,
      };
    } else {
      inputs[normalizedPort] = wire;
    }
  }
  return { ...node, inputs };
}

function ensureIntegrateDt(node: ComposedNode): ComposedNode {
  if (node.primitive !== "integrate") return node;
  if (node.inputs.dt) return node;
  return {
    ...node,
    inputs: {
      ...node.inputs,
      dt: { kind: "dt" },
    },
  };
}

function dedupeNodeIds(nodes: ComposedNode[]): ComposedNode[] {
  const seen = new Map<string, number>();
  return nodes.map((node) => {
    const count = seen.get(node.id) ?? 0;
    seen.set(node.id, count + 1);
    if (count === 0) return node;
    return { ...node, id: `${node.id}_${count + 1}` };
  });
}

function resolveFuzzyNodeId(nodeId: string, knownIds: Set<string>): string | null {
  if (knownIds.has(nodeId)) return nodeId;
  const candidates = [...knownIds].filter(
    (id) => id.startsWith(nodeId) || nodeId.startsWith(id) || id.includes(nodeId) || nodeId.includes(id),
  );
  if (candidates.length === 1) return candidates[0]!;
  return null;
}

function fixUnresolvedNodeWires(model: ComposedModel): ComposedModel {
  const nodeIds = new Set(model.nodes.map((n) => n.id));
  const nodes = model.nodes.map((node) => {
    const inputs: Record<string, Wire> = {};
    for (const [port, wire] of Object.entries(node.inputs)) {
      if (wire.kind !== "node") {
        inputs[port] = wire;
        continue;
      }
      const resolved = resolveFuzzyNodeId(wire.nodeId, nodeIds);
      inputs[port] =
        resolved && resolved !== wire.nodeId
          ? { ...wire, nodeId: resolved }
          : wire;
    }
    return { ...node, inputs };
  });
  return { ...model, nodes };
}

/** Apply deterministic structural normalizations before validation / LLM repair. */
export function applyDeterministicStructuralRepair(model: ComposedModel): ComposedModel {
  let next = cloneModel(model);
  next = {
    ...next,
    nodes: dedupeNodeIds(next.nodes.map((n) => ensureIntegrateDt(normalizeNodePortAliases(n)))),
  };
  next = fixUnresolvedNodeWires(next);
  return next;
}

export function hasOnlyStructuralErrors(diagnostics: ValidationDiagnostic[]): boolean {
  if (diagnostics.length === 0) return false;
  return diagnostics.every((d) => STRUCTURAL_ERROR_CODES.has(d.code));
}

export function hasNonRepairableErrors(diagnostics: ValidationDiagnostic[]): boolean {
  return diagnostics.some((d) => NON_REPAIRABLE_ERROR_CODES.has(d.code));
}

export function structuralDiagnostics(diagnostics: ValidationDiagnostic[]): ValidationDiagnostic[] {
  return diagnostics.filter((d) => STRUCTURAL_ERROR_CODES.has(d.code));
}
