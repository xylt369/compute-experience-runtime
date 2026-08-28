import type { ComposedModel } from "../composed/types";
import { CompilerProviderError } from "./provider-errors";
import type { CompilationStatus, CompilerDomain, LLMCompilationDraft } from "./types";

const VALID_STATUS = new Set<CompilationStatus>(["SUPPORTED", "APPROXIMATED", "UNSUPPORTED"]);

/** Parse and normalize structured JSON from an LLM into a compilation draft. */
export function parseLLMCompilationDraft(raw: unknown): LLMCompilationDraft {
  if (!raw || typeof raw !== "object") {
    throw new CompilerProviderError("INVALID_RESPONSE", "LLM response is not a JSON object.");
  }

  const payload = raw as Record<string, unknown>;
  const status = payload.status;
  if (typeof status !== "string" || !VALID_STATUS.has(status as CompilationStatus)) {
    throw new CompilerProviderError(
      "INVALID_RESPONSE",
      `LLM response missing valid status (got ${String(status)}).`,
    );
  }

  const domain = payload.domain;
  const parsedDomain =
    domain === null || domain === undefined
      ? null
      : domain === "epidemic-sir"
        ? ("epidemic-sir" as CompilerDomain)
        : null;

  const assumptions = Array.isArray(payload.assumptions)
    ? payload.assumptions.filter((item): item is string => typeof item === "string")
    : [];

  const refusalReason =
    typeof payload.refusalReason === "string" ? payload.refusalReason : undefined;

  const composedModel =
    payload.composedModel === null || payload.composedModel === undefined
      ? null
      : (payload.composedModel as ComposedModel);

  return {
    status: status as CompilationStatus,
    domain: parsedDomain,
    assumptions,
    refusalReason,
    composedModel,
  };
}

/** Extract JSON from an OpenAI-style chat completion body. */
export function parseOpenAIChatCompletion(body: unknown): LLMCompilationDraft {
  if (!body || typeof body !== "object") {
    throw new CompilerProviderError("INVALID_RESPONSE", "Provider returned a non-object body.");
  }

  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new CompilerProviderError("INVALID_RESPONSE", "Provider response has no choices.");
  }

  const message = (choices[0] as { message?: { content?: unknown } })?.message;
  const content = message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new CompilerProviderError("INVALID_RESPONSE", "Provider choice has no message content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new CompilerProviderError("INVALID_RESPONSE", "Provider message content is not valid JSON.");
  }

  return parseLLMCompilationDraft(parsed);
}
