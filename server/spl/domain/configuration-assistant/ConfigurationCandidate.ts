export interface ConfigurationCandidate {
  selections: Array<{ featureId: string; selected: boolean }>;
  unmatchedTerms: string[];
  ambiguities: string[];
}

export const candidateSchema = {
  type: "object", additionalProperties: false,
  required: ["selections", "unmatchedTerms", "ambiguities"],
  properties: {
    selections: { type: "array", maxItems: 500, items: {
      type: "object", additionalProperties: false, required: ["featureId", "selected"],
      properties: { featureId: { type: "string", minLength: 1 }, selected: { type: "boolean" } },
    } },
    unmatchedTerms: { type: "array", maxItems: 500, items: { type: "string", minLength: 1, maxLength: 4000 } },
    ambiguities: { type: "array", maxItems: 500, items: { type: "string", minLength: 1, maxLength: 4000 } },
  },
};
