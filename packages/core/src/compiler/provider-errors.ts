/** Raised when an LLM provider request fails or returns an unusable payload. */
export class CompilerProviderError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "CompilerProviderError";
    this.code = code;
    this.status = status;
  }
}
