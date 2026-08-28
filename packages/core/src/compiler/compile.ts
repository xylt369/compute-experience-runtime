import { validateComposedModel } from "../composed/validator";
import { classifyEpidemicConcept } from "./domains/epidemic";
import { loadCompiledModel } from "./load";
import { buildCompilerPrompt, buildRepairPrompt } from "./prompt";
import {
  applyDeterministicStructuralRepair,
  hasNonRepairableErrors,
  hasOnlyStructuralErrors,
  structuralDiagnostics,
} from "./structural-repair";
import type {
  CompilationEnvelope,
  CompileModelConceptOptions,
  LLMCompilationDraft,
  ValidatedModel,
} from "./types";

const DEFAULT_MAX_REPAIR = 2;

function mergeAssumptions(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      const trimmed = item.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      merged.push(trimmed);
    }
  }
  return merged;
}

function envelopeFromDraft(
  concept: string,
  draft: LLMCompilationDraft,
  extras?: Partial<CompilationEnvelope>,
): CompilationEnvelope {
  return {
    status: draft.status,
    concept,
    domain: draft.domain,
    model: draft.composedModel,
    assumptions: draft.assumptions,
    refusalReason: draft.refusalReason,
    ...extras,
  };
}

function finalizeStatus(
  classificationStatus: CompilationEnvelope["status"],
  draftStatus: CompilationEnvelope["status"],
): CompilationEnvelope["status"] {
  if (classificationStatus === "UNSUPPORTED" || draftStatus === "UNSUPPORTED") return "UNSUPPORTED";
  if (classificationStatus === "APPROXIMATED" || draftStatus === "APPROXIMATED") return "APPROXIMATED";
  return "SUPPORTED";
}

function prepareDraftModel(draft: LLMCompilationDraft): LLMCompilationDraft {
  if (!draft.composedModel) return draft;
  return {
    ...draft,
    composedModel: applyDeterministicStructuralRepair(draft.composedModel),
  };
}

function toValidated(draft: LLMCompilationDraft): ValidatedModel | null {
  if (!draft.composedModel) return null;
  const result = validateComposedModel(draft.composedModel);
  if (!result.ok || !result.order) return null;
  return { model: draft.composedModel, order: result.order };
}

/**
 * v0 AI Model Compiler pipeline:
 * concept → classify → LLM structured JSON → deterministic validate → bounded repair → envelope
 */
export async function compileModelConcept(
  concept: string,
  options: CompileModelConceptOptions,
): Promise<CompilationEnvelope> {
  const maxRepairAttempts = options.maxRepairAttempts ?? DEFAULT_MAX_REPAIR;
  const classification = classifyEpidemicConcept(concept);

  if (classification.status === "UNSUPPORTED" && !classification.domain) {
    return {
      status: "UNSUPPORTED",
      concept,
      domain: null,
      model: null,
      assumptions: classification.assumptions,
      refusalReason: classification.refusalReason,
    };
  }

  const prompt = buildCompilerPrompt(concept);
  let draft = prepareDraftModel(await options.llm.complete(concept, prompt));

  if (draft.status === "UNSUPPORTED" || !draft.composedModel) {
    return envelopeFromDraft(concept, draft, {
      assumptions: mergeAssumptions(classification.assumptions, draft.assumptions),
    });
  }

  let repairAttempts = 0;
  let validation = validateComposedModel(draft.composedModel);

  while (!validation.ok && repairAttempts < maxRepairAttempts) {
    if (hasNonRepairableErrors(validation.diagnostics)) break;
    if (!hasOnlyStructuralErrors(validation.diagnostics)) break;

    const repairPrompt = buildRepairPrompt(
      concept,
      draft,
      structuralDiagnostics(validation.diagnostics),
    );
    draft = prepareDraftModel(
      await options.llm.repair(concept, repairPrompt, draft, validation.diagnostics),
    );
    repairAttempts += 1;

    if (draft.status === "UNSUPPORTED" || !draft.composedModel) {
      return envelopeFromDraft(concept, draft, {
        repairAttempts,
        assumptions: mergeAssumptions(classification.assumptions, draft.assumptions),
        diagnostics: validation.diagnostics,
      });
    }

    validation = validateComposedModel(draft.composedModel);
  }

  const validated = toValidated(draft);
  if (!validated) {
    return {
      status: "UNSUPPORTED",
      concept,
      domain: draft.domain,
      model: null,
      assumptions: mergeAssumptions(classification.assumptions, draft.assumptions),
      refusalReason:
        draft.refusalReason ??
        "Composed model failed deterministic validation after bounded structural repair.",
      diagnostics: validation.diagnostics,
      repairAttempts,
    };
  }

  const status = finalizeStatus(classification.status, draft.status);
  const envelope: CompilationEnvelope = {
    status,
    concept,
    domain: validated.model ? "epidemic-sir" : draft.domain,
    model: validated.model,
    assumptions: mergeAssumptions(classification.assumptions, draft.assumptions),
    repairAttempts,
  };

  if (status !== "UNSUPPORTED") {
    loadCompiledModel(envelope);
  }

  return envelope;
}

export { validateCompiledModel } from "./load";
