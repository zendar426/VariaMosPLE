export interface LlmMessage { role: "system" | "user"; content: string; }
export interface LlmGateway {
  complete(messages: LlmMessage[], signal?: AbortSignal): Promise<{
    content: string; requestedModel: string; responseModel: string;
  }>;
}

export class LlmError extends Error {
  constructor(public readonly code: string, public readonly statusCode = 502) {
    super(statusCode === 504 ? "The language model request timed out." :
      statusCode === 503 ? "The configuration assistant is unavailable." :
      "The language model returned an invalid or unavailable response.");
    this.name = "LlmError";
  }
}
