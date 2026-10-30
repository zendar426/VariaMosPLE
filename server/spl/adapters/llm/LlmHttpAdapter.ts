import https from "https";
import { ClientRequest, IncomingMessage } from "http";
import { LlmError, LlmGateway, LlmMessage } from "../../application/configuration-assistant/ports/LlmGateway";

export interface DeepSeekConfig { apiKey: string; model: string; timeoutMs: number; }
type RequestFactory = (url: URL, options: https.RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;

export class LlmHttpAdapter implements LlmGateway {
  constructor(private readonly config: DeepSeekConfig, private readonly request: RequestFactory = https.request) {}

  complete(messages: LlmMessage[], signal?: AbortSignal) {
    return new Promise<{ content: string; requestedModel: string; responseModel: string }>((resolve, reject) => {
      let settled = false;
      let request: ClientRequest | undefined;
      let response: IncomingMessage | undefined;
      const finish = (error?: LlmError, result?: { content: string; requestedModel: string; responseModel: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (error) { reject(error); response?.destroy(); request?.destroy(); }
        else resolve(result!);
      };
      const abort = () => finish(new LlmError("LLM_REQUEST_CANCELLED"));
      const timer = setTimeout(() => finish(new LlmError("LLM_TIMEOUT", 504)), this.config.timeoutMs);
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      const body = JSON.stringify({ model: this.config.model, messages, stream: false,
        thinking: { type: "disabled" }, temperature: 0, max_tokens: 2048,
        response_format: { type: "json_object" } });
      try {
        request = this.request(new URL("https://api.deepseek.com/chat/completions"), {
          method: "POST", headers: { authorization: `Bearer ${this.config.apiKey}`,
            "content-type": "application/json", "content-length": Buffer.byteLength(body) },
        }, incoming => {
          response = incoming;
          if (settled) { incoming.destroy(); return; }
          const status = incoming.statusCode || 0;
          if (status !== 200) { finish(new LlmError("LLM_PROVIDER_ERROR", [401, 402, 429, 503].includes(status) ? 503 : 502)); return; }
          let bytes = 0;
          const chunks: Buffer[] = [];
          incoming.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 262144) { finish(new LlmError("LLM_RESPONSE_TOO_LARGE")); return; }
            chunks.push(Buffer.from(chunk));
          });
          incoming.on("error", () => finish(new LlmError("LLM_TRANSPORT_ERROR")));
          incoming.on("aborted", () => finish(new LlmError("LLM_TRANSPORT_ERROR")));
          incoming.on("end", () => {
            if (settled) return;
            try {
              const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              const choice = result.choices?.[0];
              if (choice?.finish_reason !== "stop" || typeof choice.message?.content !== "string" ||
                  !choice.message.content.trim() || typeof result.model !== "string" || !result.model.trim()) throw new Error();
              finish(undefined, { content: choice.message.content, requestedModel: this.config.model, responseModel: result.model });
            } catch { finish(new LlmError("INVALID_LLM_RESPONSE")); }
          });
        });
        request.on("error", () => finish(new LlmError("LLM_TRANSPORT_ERROR")));
        request.end(body);
      } catch { finish(new LlmError("LLM_TRANSPORT_ERROR")); }
    });
  }
}
