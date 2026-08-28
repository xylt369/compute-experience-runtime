import type { ExperienceComposition, ExperienceContract } from "../experience";
import { composeExperience, resolveExperience } from "../experience";
import type { ModelDefinition } from "../protocol/types";
import { compileModelConcept } from "./compile";
import type { CompilerLLMConfig } from "./llm-config";
import { createOpenAICompilerLLM } from "./openai-llm";
import { createMockCompilerLLM } from "./mock-llm";
import { loadCompiledModel } from "./load";
import { CompilerProviderError } from "./provider-errors";
import type { CompilationEnvelope, CompileModelConceptOptions, ModelCompilerLLM } from "./types";

export interface CompilerProductLoopOptions {
  llm?: ModelCompilerLLM;
  config?: CompilerLLMConfig;
  maxRepairAttempts?: number;
  /** When true and no llm is supplied, use the offline mock instead of the real adapter. */
  useMockWhenNoKey?: boolean;
}

export interface CompilerProductLoopResult {
  envelope: CompilationEnvelope;
  model: ModelDefinition | null;
  contract: ExperienceContract | null;
  composition: ExperienceComposition | null;
  providerError: CompilerProviderError | null;
}

function unsupportedProviderEnvelope(
  concept: string,
  error: CompilerProviderError,
): CompilationEnvelope {
  return {
    status: "UNSUPPORTED",
    concept,
    domain: null,
    model: null,
    assumptions: [],
    refusalReason: error.message,
    diagnostics: [{ code: error.code, message: error.message }],
  };
}

function resolveLoopLlm(options: CompilerProductLoopOptions): ModelCompilerLLM {
  if (options.llm) return options.llm;
  try {
    return createOpenAICompilerLLM(options.config ?? {});
  } catch (error) {
    if (
      options.useMockWhenNoKey !== false &&
      error instanceof CompilerProviderError &&
      error.code === "MISSING_API_KEY"
    ) {
      return createMockCompilerLLM();
    }
    throw error;
  }
}

/**
 * Full product loop: concept → LLM → validator → loadCompiledModel → Runtime-ready model + Experience.
 */
export async function runCompilerProductLoop(
  concept: string,
  options: CompilerProductLoopOptions = {},
): Promise<CompilerProductLoopResult> {
  const llm = resolveLoopLlm(options);
  const compileOptions: CompileModelConceptOptions = {
    llm,
    maxRepairAttempts: options.maxRepairAttempts,
  };

  let envelope: CompilationEnvelope;
  let providerError: CompilerProviderError | null = null;

  try {
    envelope = await compileModelConcept(concept, compileOptions);
  } catch (error) {
    if (error instanceof CompilerProviderError) {
      providerError = error;
      envelope = unsupportedProviderEnvelope(concept, error);
    } else {
      throw error;
    }
  }

  const model = loadCompiledModel(envelope);
  const contract = model ? resolveExperience(model) : null;
  const composition = contract ? composeExperience(contract) : null;

  return { envelope, model, contract, composition, providerError };
}
