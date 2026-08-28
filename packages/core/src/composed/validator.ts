import Ajv2020 from "ajv/dist/2020.js";
import { getPrimitive, PRIMITIVE_REGISTRY } from "./primitives";
import type {
  ComposedModel,
  ComposedNode,
  NodeWire,
  ParameterWire,
  PrimitiveId,
  StateWire,
  ValidationDiagnostic,
  ValidationResult,
  Wire,
} from "./types";
import schema from "./schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

function diag(code: string, message: string, path?: string): ValidationDiagnostic {
  return { code, message, path };
}

function resolveWireSource(wire: Wire): string | null {
  if (wire.kind === "node") return wire.nodeId;
  return null;
}

function topologicalOrder(nodes: ComposedNode[]): string[] | null {
  const ids = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of ids) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }
  for (const node of nodes) {
    for (const wire of Object.values(node.inputs)) {
      const src = resolveWireSource(wire);
      if (!src || !ids.has(src)) continue;
      adj.get(src)!.push(node.id);
      inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
    }
  }
  const queue = [...ids].filter((id) => (inDegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const deg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }
  return order.length === ids.size ? order : null;
}

function collectTraceReferences(model: ComposedModel, order: string[]): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const stateFields = new Set(model.state);
  const paramIds = new Set(model.parameters.map((p) => p.id));

  for (const nodeId of order) {
    const node = nodeById.get(nodeId)!;
    const def = PRIMITIVE_REGISTRY[node.primitive];
    for (const [port, wire] of Object.entries(node.inputs)) {
      if (wire.kind === "state" && !stateFields.has(wire.field)) {
        diagnostics.push(
          diag(
            "INVALID_TRACE_REF",
            `Node "${nodeId}" input "${port}" references unknown state field "${wire.field}".`,
            `nodes/${nodeId}/inputs/${port}`,
          ),
        );
      }
      if (wire.kind === "parameter" && !paramIds.has(wire.id)) {
        diagnostics.push(
          diag(
            "INVALID_TRACE_REF",
            `Node "${nodeId}" input "${port}" references unknown parameter "${wire.id}".`,
            `nodes/${nodeId}/inputs/${port}`,
          ),
        );
      }
      if (wire.kind === "node") {
        const src = nodeById.get(wire.nodeId);
        if (!src) {
          diagnostics.push(
            diag(
              "UNRESOLVED_WIRE",
              `Node "${nodeId}" input "${port}" references missing node "${wire.nodeId}".`,
              `nodes/${nodeId}/inputs/${port}`,
            ),
          );
          continue;
        }
        const outPorts = Object.keys(getPrimitive(src.primitive).ports.outputs);
        if (!outPorts.includes(wire.port)) {
          diagnostics.push(
            diag(
              "UNKNOWN_PORT",
              `Node "${nodeId}" input "${port}" references port "${wire.port}" on "${wire.nodeId}", expected one of: ${outPorts.join(", ")}.`,
              `nodes/${nodeId}/inputs/${port}`,
            ),
          );
        }
      }
    }
  }
  return diagnostics;
}

/** Deterministic validation: schema, IDs, ports, DAG, integrator coverage, trace refs. */
export function validateComposedModel(model: unknown): ValidationResult {
  const diagnostics: ValidationDiagnostic[] = [];

  if (!validateSchema(model)) {
    for (const err of validateSchema.errors ?? []) {
      diagnostics.push(
        diag("SCHEMA_INVALID", err.message ?? "Schema validation failed.", err.instancePath || "/"),
      );
    }
    return { ok: false, diagnostics };
  }

  const composed = model as unknown as ComposedModel;
  const nodeIds = new Set<string>();
  for (const node of composed.nodes) {
    if (nodeIds.has(node.id)) {
      diagnostics.push(diag("DUPLICATE_ID", `Duplicate node id "${node.id}".`, `nodes/${node.id}`));
    }
    nodeIds.add(node.id);

    if (!(node.primitive in PRIMITIVE_REGISTRY)) {
      diagnostics.push(
        diag("UNKNOWN_PRIMITIVE", `Unknown primitive "${node.primitive}".`, `nodes/${node.id}/primitive`),
      );
      continue;
    }

    const def = getPrimitive(node.primitive);
    for (const port of Object.keys(def.ports.inputs)) {
      if (!(port in node.inputs)) {
        diagnostics.push(
          diag(
            "MISSING_PORT",
            `Node "${node.id}" (${node.primitive}) missing required input port "${port}".`,
            `nodes/${node.id}/inputs/${port}`,
          ),
        );
      }
    }
    for (const port of Object.keys(node.inputs)) {
      if (!(port in def.ports.inputs)) {
        diagnostics.push(
          diag(
            "UNKNOWN_PORT",
            `Node "${node.id}" has unknown input port "${port}" for primitive "${node.primitive}".`,
            `nodes/${node.id}/inputs/${port}`,
          ),
        );
      }
    }
  }

  diagnostics.push(...collectTraceReferences(composed, composed.nodes.map((n) => n.id)));

  const order = topologicalOrder(composed.nodes);
  if (!order) {
    diagnostics.push(diag("CYCLE_DETECTED", "Node graph contains a cycle.", "nodes"));
  }

  const integratorByState = new Map<string, string>();
  for (const binding of composed.integrators) {
    if (!composed.state.includes(binding.state)) {
      diagnostics.push(
        diag(
          "ORPHAN_STATE",
          `Integrator references unknown state "${binding.state}".`,
          `integrators/${binding.state}`,
        ),
      );
    }
    if (!nodeIds.has(binding.node)) {
      diagnostics.push(
        diag(
          "UNRESOLVED_WIRE",
          `Integrator for "${binding.state}" references missing node "${binding.node}".`,
          `integrators/${binding.state}`,
        ),
      );
    } else {
      const node = composed.nodes.find((n) => n.id === binding.node)!;
      if (node.primitive !== "integrate") {
        diagnostics.push(
          diag(
            "TYPE_MISMATCH",
            `Integrator for "${binding.state}" must reference an integrate node, got "${node.primitive}".`,
            `integrators/${binding.state}`,
          ),
        );
      }
    }
    if (integratorByState.has(binding.state)) {
      diagnostics.push(
        diag(
          "DUPLICATE_ID",
          `Multiple integrators bound to state "${binding.state}".`,
          `integrators/${binding.state}`,
        ),
      );
    }
    integratorByState.set(binding.state, binding.node);
  }

  for (const field of composed.state) {
    if (!integratorByState.has(field)) {
      diagnostics.push(
        diag("MISSING_INTEGRATOR", `State "${field}" has no integrator binding.`, `state/${field}`),
      );
    }
  }

  if (composed.initial) {
    for (const field of composed.state) {
      if (!(field in composed.initial)) {
        diagnostics.push(
          diag("MISSING_INITIAL", `Initial state missing field "${field}".`, `initial/${field}`),
        );
      }
    }
  }

  const ok = diagnostics.length === 0 && Boolean(order);
  return ok ? { ok: true, diagnostics: [], order: order! } : { ok: false, diagnostics, order: order ?? undefined };
}

export function assertValidComposedModel(model: unknown): ComposedModel {
  const result = validateComposedModel(model);
  if (!result.ok) {
    const summary = result.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n");
    throw new Error(`Invalid ComposedModel:\n${summary}`);
  }
  return model as ComposedModel;
}

export function isStateWire(wire: Wire): wire is StateWire {
  return wire.kind === "state";
}

export function isParameterWire(wire: Wire): wire is ParameterWire {
  return wire.kind === "parameter";
}

export function isNodeWire(wire: Wire): wire is NodeWire {
  return wire.kind === "node";
}
