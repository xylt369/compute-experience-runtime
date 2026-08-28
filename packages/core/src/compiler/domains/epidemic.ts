import type { ComposedModel } from "../../composed/types";
import type { ConceptClassification } from "../types";

const SIR_KEYWORDS =
  /\b(sir|epidemic|epidemiological|infection|infectious|disease spread|pandemic|outbreak|susceptible|recovered|compartmental)\b/i;
const APPROX_KEYWORDS =
  /\b(seir|seirs|exposed compartment|births?|demographic|vaccin|quarantine|hospital|mortality|dead|deceased)\b/i;
const OUT_OF_DOMAIN_KEYWORDS =
  /\b(lorenz|chaos|attractor|pendulum|rossler|orbital|stock market|climate|weather|neural|gradient descent|causal)\b/i;

/** Deterministic pre-LLM concept gate for the v0 epidemic domain. */
export function classifyEpidemicConcept(concept: string): ConceptClassification {
  const text = concept.trim();
  if (!text) {
    return {
      domain: null,
      status: "UNSUPPORTED",
      assumptions: [],
      refusalReason: "Empty concept.",
    };
  }

  if (OUT_OF_DOMAIN_KEYWORDS.test(text)) {
    return {
      domain: null,
      status: "UNSUPPORTED",
      assumptions: [],
      refusalReason: "Concept is outside the v0 epidemic/SIR compiler domain.",
    };
  }

  if (APPROX_KEYWORDS.test(text) && !/\bsir\b/i.test(text)) {
    return {
      domain: "epidemic-sir",
      status: "APPROXIMATED",
      assumptions: [
        "Requested structure is not fully supported in v0; compiling closest SIR compartment graph.",
      ],
    };
  }

  if (SIR_KEYWORDS.test(text)) {
    return {
      domain: "epidemic-sir",
      status: "SUPPORTED",
      assumptions: [],
    };
  }

  return {
    domain: null,
    status: "UNSUPPORTED",
    assumptions: [],
    refusalReason: "Could not classify concept as epidemic/SIR for v0 compiler.",
  };
}

/** True when a composed graph has the canonical SIR state vector. */
export function isSirComposedModel(model: ComposedModel): boolean {
  if (model.state.length !== 3) return false;
  const fields = new Set(model.state);
  return fields.has("susceptible") && fields.has("infected") && fields.has("recovered");
}
