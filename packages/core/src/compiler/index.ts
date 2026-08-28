export type {
  CompilationEnvelope,
  CompilationStatus,
  CompileModelConceptOptions,
  CompilerDomain,
  ConceptClassification,
  LLMCompilationDraft,
  ModelCompilerLLM,
  ModelCompilerLLMCompleteRequest,
  ModelCompilerLLMRepairRequest,
  ValidatedModel,
} from "./types";

export { buildCompilerPrompt, buildRepairPrompt } from "./prompt";
export {
  STRUCTURAL_ERROR_CODES,
  NON_REPAIRABLE_ERROR_CODES,
  applyDeterministicStructuralRepair,
  hasNonRepairableErrors,
  hasOnlyStructuralErrors,
  structuralDiagnostics,
} from "./structural-repair";
export { classifyEpidemicConcept, isSirComposedModel } from "./domains/epidemic";
export { createMockCompilerLLM, createFetchCompilerLLM } from "./mock-llm";
export {
  createOpenAICompilerLLM,
  createCompilerLLMFromEnv,
} from "./openai-llm";
export {
  readCompilerLLMConfig,
  resolveCompilerLLMConfig,
  COMPILER_ENV_KEYS,
} from "./llm-config";
export type { CompilerLLMConfig } from "./llm-config";
export { CompilerProviderError } from "./provider-errors";
export { parseLLMCompilationDraft, parseOpenAIChatCompletion } from "./parse-draft";
export { compileModelConcept, validateCompiledModel } from "./compile";
export { loadCompiledModel, assertLoadableCompilation } from "./load";
export { runCompilerProductLoop } from "./product-loop";
export type { CompilerProductLoopOptions, CompilerProductLoopResult } from "./product-loop";
