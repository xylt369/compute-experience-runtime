import { sirComposedModel } from "../composed/sir-composed";
import type { ComposedModel } from "../composed/types";
import type { LLMCompilationDraft } from "./types";

function cloneSirTemplate(id: string): ComposedModel {
  return {
    ...structuredClone(sirComposedModel),
    id,
    version: "0.1.0-compiled",
  };
}

/** Introduce a structural wire error for repair-loop tests. */
function brokenSirDraft(id: string): LLMCompilationDraft {
  const model = cloneSirTemplate(id);
  const dIRate = model.nodes.find((n) => n.id === "dI_rate")!;
  dIRate.inputs = {
    ...dIRate.inputs,
    minuend: { kind: "node", nodeId: "wrong_infection_node", port: "out" },
  };
  return {
    status: "SUPPORTED",
    domain: "epidemic-sir",
    assumptions: [],
    composedModel: model,
  };
}

function invalidPrimitiveDraft(id: string): LLMCompilationDraft {
  const model = cloneSirTemplate(id);
  const flux = model.nodes.find((n) => n.id === "infection_flux")!;
  flux.primitive = "unknown-primitive" as typeof flux.primitive;
  return {
    status: "SUPPORTED",
    domain: "epidemic-sir",
    assumptions: [],
    composedModel: model,
  };
}

function validSirDraft(status: LLMCompilationDraft["status"], assumptions: string[], id: string): LLMCompilationDraft {
  return {
    status,
    domain: "epidemic-sir",
    assumptions,
    composedModel: cloneSirTemplate(id),
  };
}

function repairBrokenSir(draft: LLMCompilationDraft): LLMCompilationDraft {
  if (!draft.composedModel) return draft;
  const model = structuredClone(draft.composedModel);
  for (const node of model.nodes) {
    for (const [port, wire] of Object.entries(node.inputs)) {
      if (wire.kind === "node" && wire.nodeId === "wrong_infection_node") {
        node.inputs[port] = { kind: "node", nodeId: "infection_flux", port: "out" };
      }
    }
  }
  return { ...draft, composedModel: model };
}

function slugifyConcept(concept: string): string {
  const slug = concept
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "compiled-sir";
}

/**
 * Deterministic stand-in for an LLM provider — maps concepts to structured JSON drafts.
 * Used in tests and offline compilation without external API keys.
 */
export function createMockCompilerLLM(): import("./types").ModelCompilerLLM {
  return {
    async complete(concept, _prompt) {
      const id = `compiled-${slugifyConcept(concept)}`;

      if (concept.includes("__broken_wire__")) {
        return brokenSirDraft(id);
      }
      if (concept.includes("__invalid_primitive__")) {
        return invalidPrimitiveDraft(id);
      }
      if (concept.includes("__llm_refusal__")) {
        return {
          status: "UNSUPPORTED",
          domain: null,
          assumptions: [],
          refusalReason: "LLM declined: concept cannot be expressed with v0 primitives.",
          composedModel: null,
        };
      }

      if (/\b(seir|exposed compartment)\b/i.test(concept)) {
        return validSirDraft("APPROXIMATED", ["Exposed (E) compartment omitted; using SIR approximation."], id);
      }

      if (/\bquarantine\b/i.test(concept)) {
        return validSirDraft(
          "APPROXIMATED",
          ["Quarantine modeled as timed contact-rate reduction via interventionFactor."],
          id,
        );
      }

      return validSirDraft("SUPPORTED", [], id);
    },

    async repair(_concept, _prompt, draft, diagnostics) {
      if (diagnostics.some((d) => d.code === "UNRESOLVED_WIRE")) {
        return repairBrokenSir(draft);
      }
      return draft;
    },
  };
}

/** Optional fetch-based provider for environments that expose a compile endpoint. */
export function createFetchCompilerLLM(endpoint: string): import("./types").ModelCompilerLLM {
  async function post(body: Record<string, unknown>): Promise<LLMCompilationDraft> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Compiler LLM request failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as LLMCompilationDraft;
  }

  return {
    complete(concept, prompt) {
      return post({ mode: "complete", concept, prompt });
    },
    repair(concept, prompt, draft, diagnostics) {
      return post({ mode: "repair", concept, prompt, draft, diagnostics });
    },
  };
}
