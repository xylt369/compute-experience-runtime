/** Injectable compiler LLM configuration — API keys must come from env or caller, never source. */
export interface CompilerLLMConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
}

export const COMPILER_ENV_KEYS = {
  apiKey: "COMPILE_LLM_API_KEY",
  baseUrl: "COMPILE_LLM_BASE_URL",
  model: "COMPILE_LLM_MODEL",
} as const;

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

/** Read compiler LLM settings from environment (Node) or an explicit record. */
export function readCompilerLLMConfig(
  env: Record<string, string | undefined> = typeof process !== "undefined"
    ? (process.env as Record<string, string | undefined>)
    : {},
): CompilerLLMConfig {
  return {
    apiKey: env[COMPILER_ENV_KEYS.apiKey],
    baseUrl: env[COMPILER_ENV_KEYS.baseUrl] ?? DEFAULT_BASE_URL,
    model: env[COMPILER_ENV_KEYS.model] ?? DEFAULT_MODEL,
  };
}

/** Merge env config with explicit overrides. */
export function resolveCompilerLLMConfig(overrides: CompilerLLMConfig = {}): CompilerLLMConfig {
  return { ...readCompilerLLMConfig(), ...overrides };
}
