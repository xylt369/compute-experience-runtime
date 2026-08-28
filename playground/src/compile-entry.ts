import {
  createMockCompilerLLM,
  createOpenAICompilerLLM,
  runCompilerProductLoop,
  type CompilerProductLoopResult,
  type ModelCompilerLLM,
} from "@compute-experience/core";

export type CompileUiPhase = "idle" | "compiling" | "done";

export interface CompileUiState {
  phase: CompileUiPhase;
  status?: "SUPPORTED" | "APPROXIMATED" | "UNSUPPORTED";
  detail?: string;
}

export interface PlaygroundCompileEnv {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

/** Resolve playground LLM: real adapter when VITE_COMPILE_LLM_API_KEY is set, else offline mock. */
export function createPlaygroundCompilerLLM(env: PlaygroundCompileEnv = {}): ModelCompilerLLM {
  if (env.apiKey?.trim()) {
    return createOpenAICompilerLLM({
      apiKey: env.apiKey,
      baseUrl: env.baseUrl,
      model: env.model,
    });
  }
  return createMockCompilerLLM();
}

export function readPlaygroundCompileEnv(
  metaEnv: Record<string, string | undefined> = {},
): PlaygroundCompileEnv {
  return {
    apiKey: metaEnv.VITE_COMPILE_LLM_API_KEY,
    baseUrl: metaEnv.VITE_COMPILE_LLM_BASE_URL,
    model: metaEnv.VITE_COMPILE_LLM_MODEL,
  };
}

export function compileUiStateFromResult(result: CompilerProductLoopResult): CompileUiState {
  if (result.providerError) {
    return {
      phase: "done",
      status: "UNSUPPORTED",
      detail: result.providerError.message,
    };
  }

  const { envelope } = result;
  if (envelope.status === "UNSUPPORTED") {
    return {
      phase: "done",
      status: "UNSUPPORTED",
      detail: envelope.refusalReason ?? "Concept is not supported in the epidemic/SIR compiler.",
    };
  }

  const assumptionText =
    envelope.assumptions.length > 0 ? envelope.assumptions.join(" ") : undefined;

  return {
    phase: "done",
    status: envelope.status,
    detail: assumptionText,
  };
}

export function compilingUiState(): CompileUiState {
  return { phase: "compiling" };
}

/** Full compiler product loop for the playground entry point. */
export async function compileConceptForPlayground(
  concept: string,
  llm: ModelCompilerLLM,
): Promise<CompilerProductLoopResult> {
  const trimmed = concept.trim();
  if (!trimmed) {
    return {
      envelope: {
        status: "UNSUPPORTED",
        concept: trimmed,
        domain: null,
        model: null,
        assumptions: [],
        refusalReason: "Enter a concept to explore.",
      },
      model: null,
      contract: null,
      composition: null,
      providerError: null,
    };
  }

  return runCompilerProductLoop(trimmed, { llm, useMockWhenNoKey: false });
}

export function applyCompileUiState(
  state: CompileUiState,
  elements: {
    statusRoot: HTMLElement;
    badge: HTMLElement;
    detail: HTMLElement;
    submit: HTMLButtonElement;
    input: HTMLInputElement;
  },
): void {
  if (state.phase === "idle") {
    elements.statusRoot.hidden = true;
    elements.submit.disabled = false;
    elements.input.disabled = false;
    return;
  }

  elements.statusRoot.hidden = false;
  elements.submit.disabled = state.phase === "compiling";
  elements.input.disabled = state.phase === "compiling";

  elements.badge.classList.remove(
    "compile-badge--supported",
    "compile-badge--approximated",
    "compile-badge--unsupported",
    "compile-badge--compiling",
  );

  if (state.phase === "compiling") {
    elements.badge.textContent = "Compiling…";
    elements.badge.classList.add("compile-badge--compiling");
    elements.detail.textContent = "Wiring validated SIR primitives…";
    return;
  }

  elements.badge.textContent = state.status ?? "UNSUPPORTED";
  elements.badge.classList.add(
    state.status === "SUPPORTED"
      ? "compile-badge--supported"
      : state.status === "APPROXIMATED"
        ? "compile-badge--approximated"
        : "compile-badge--unsupported",
  );
  elements.detail.textContent = state.detail ?? "";
}
