import { candidateSchema } from "../../domain/configuration-assistant/ConfigurationCandidate";
import { LlmMessage } from "./ports/LlmGateway";
import { systemInstructions } from "./prompts/configuration-v1";

export interface FeatureContext { features: Array<{ id: string; name: string }>; }
export function buildPrompt(context: FeatureContext, requirement: string): LlmMessage[] {
  return [
    { role: "system", content: `${systemInstructions}\nResponse JSON schema: ${JSON.stringify(candidateSchema)}` },
    { role: "user", content: JSON.stringify({ kind: "feature-context", context }) },
    { role: "user", content: JSON.stringify({ kind: "requirement", requirement }) },
  ];
}
