import { parseOpenAIChatCompletion } from "./parse-draft";
import { CompilerProviderError } from "./provider-errors";
import type { CompilerLLMConfig } from "./llm-config";
import { resolveCompilerLLMConfig } from "./llm-config";
import type { ValidationDiagnostic } from "../composed/types";
import type { LLMCompilationDraft, ModelCompilerLLM } from "./types";

type FetchFn = typeof fetch;

async function requestChatCompletion(
  config: CompilerLLMConfig,
  prompt: string,
): Promise<LLMCompilationDraft> {
  const resolved = resolveCompilerLLMConfig(config);
  const apiKey = resolved.apiKey;
  if (!apiKey) {
    throw new CompilerProviderError(
      "MISSING_API_KEY",
      "COMPILE_LLM_API_KEY is not configured. Set it in the environment before calling the real LLM adapter.",
    );
  }

  const fetchImpl: FetchFn = resolved.fetch ?? fetch;
  const baseUrl = (resolved.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = resolved.model ?? "gpt-4o-mini";

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are the Compute Experience Model Compiler. Respond with a single JSON object only — no markdown, no prose.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CompilerProviderError("PROVIDER_NETWORK_ERROR", `LLM request failed: ${message}`);
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? detail;
    } catch {
      /* ignore parse errors */
    }
    throw new CompilerProviderError(
      "PROVIDER_HTTP_ERROR",
      `LLM provider returned ${response.status}: ${detail}`,
      response.status,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CompilerProviderError("INVALID_RESPONSE", "Provider returned non-JSON body.");
  }

  return parseOpenAIChatCompletion(body);
}

/**
 * OpenAI-compatible chat-completions adapter for the model compiler.
 * API key and base URL are injectable via config / COMPILE_LLM_* environment variables.
 */
export function createOpenAICompilerLLM(config: CompilerLLMConfig = {}): ModelCompilerLLM {
  return {
    complete(_concept, prompt) {
      return requestChatCompletion(config, prompt);
    },
    repair(_concept, prompt, _draft, _diagnostics: ValidationDiagnostic[]) {
      return requestChatCompletion(config, prompt);
    },
  };
}

/** Create the real LLM adapter from environment with optional overrides. */
export function createCompilerLLMFromEnv(overrides: CompilerLLMConfig = {}): ModelCompilerLLM {
  return createOpenAICompilerLLM(overrides);
}
