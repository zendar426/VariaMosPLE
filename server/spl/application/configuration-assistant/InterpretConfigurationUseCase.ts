import Ajv from "ajv/dist/2020";
import crypto from "crypto";
import { validateCandidate } from "../../domain/configuration-assistant/CandidateValidator";
import { buildPrompt, FeatureContext } from "./PromptBuilder";
import { LlmError, LlmGateway } from "./ports/LlmGateway";
import { promptVersion } from "./prompts/configuration-v1";

const text = { type: "string", minLength: 1, pattern: "\\S" };
const validateInput = new Ajv({ strict: true }).compile({
  type: "object", additionalProperties: false, required: ["modelId", "requirement", "context"],
  properties: {
    modelId: { ...text, maxLength: 256 }, requirement: { ...text, maxLength: 4000 },
    context: { type: "object", additionalProperties: false, required: ["features"], properties: {
      features: { type: "array", minItems: 1, maxItems: 500, items: {
        type: "object", additionalProperties: false, required: ["id", "name"],
        properties: { id: { ...text, maxLength: 256 }, name: { ...text, maxLength: 1000 } },
      } },
    } },
  },
});

export class InterpretationInputError extends Error {
  constructor() { super("The interpretation request or context is invalid."); }
}

export class InterpretConfigurationUseCase {
  constructor(private readonly gateway: LlmGateway) {}

  async execute(value: unknown, signal?: AbortSignal) {
    if (!validateInput(value)) throw new InterpretationInputError();
    const input = value as { modelId: string; requirement: string; context: FeatureContext };
    if (Buffer.byteLength(JSON.stringify(input.context), "utf8") > 65536) throw new InterpretationInputError();
    const features = input.context.features.map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const ids = new Set(features.map(feature => feature.id));
    if (ids.size !== features.length) throw new InterpretationInputError();
    const context = { features };
    const contextDigest = `sha256:${crypto.createHash("sha256")
      .update(JSON.stringify({ modelId: input.modelId, context })).digest("hex")}`;
    const completion = await this.gateway.complete(buildPrompt(context, input.requirement), signal);
    let candidate;
    try { candidate = validateCandidate(JSON.parse(completion.content), ids); }
    catch { throw new LlmError("INVALID_LLM_RESPONSE"); }
    return {
      modelId: input.modelId, contextDigest, promptVersion, candidate,
      projectMembership: "unverified", formalValidation: "not-performed",
      llm: { provider: "deepseek", requestedModel: completion.requestedModel, responseModel: completion.responseModel },
    };
  }
}
