import type { ComposedModel, ValidationDiagnostic } from "../composed/types";

/** Compilation outcome tier — semantic uncertainty surfaces as APPROXIMATED or UNSUPPORTED. */
export type CompilationStatus = "SUPPORTED" | "APPROXIMATED" | "UNSUPPORTED";

/** Supported v0 compilation domain. */
export type CompilerDomain = "epidemic-sir";

/** Structured JSON the LLM must return (no code, only primitive wiring). */
export interface LLMCompilationDraft {
  status: CompilationStatus;
  domain: CompilerDomain | null;
  assumptions: string[];
  refusalReason?: string;
  composedModel: ComposedModel | null;
}

/** Deterministic validator output after a composed graph passes all checks. */
export interface ValidatedModel {
  model: ComposedModel;
  order: string[];
}

/** Declarative compiler output envelope. */
export interface CompilationEnvelope {
  status: CompilationStatus;
  concept: string;
  domain: CompilerDomain | null;
  model: ComposedModel | null;
  assumptions: string[];
  refusalReason?: string;
  diagnostics?: ValidationDiagnostic[];
  /** Number of LLM repair rounds consumed (max 2). */
  repairAttempts?: number;
}

export interface ConceptClassification {
  domain: CompilerDomain | null;
  status: CompilationStatus;
  assumptions: string[];
  refusalReason?: string;
}

export interface CompileModelConceptOptions {
  llm: ModelCompilerLLM;
  maxRepairAttempts?: number;
}

export interface ModelCompilerLLM {
  complete(concept: string, prompt: string): Promise<LLMCompilationDraft>;
  repair(
    concept: string,
    prompt: string,
    draft: LLMCompilationDraft,
    diagnostics: ValidationDiagnostic[],
  ): Promise<LLMCompilationDraft>;
}

export interface ModelCompilerLLMCompleteRequest {
  concept: string;
  prompt: string;
}

export interface ModelCompilerLLMRepairRequest {
  concept: string;
  prompt: string;
  draft: LLMCompilationDraft;
  diagnostics: ValidationDiagnostic[];
}
