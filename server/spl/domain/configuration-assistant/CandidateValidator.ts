import Ajv from "ajv/dist/2020";
import { candidateSchema, ConfigurationCandidate } from "./ConfigurationCandidate";

const validate = new Ajv({ strict: true }).compile<ConfigurationCandidate>(candidateSchema);

export function validateCandidate(value: unknown, featureIds: ReadonlySet<string>): ConfigurationCandidate {
  if (!validate(value)) throw new Error("Invalid configuration candidate.");
  const candidate = value as ConfigurationCandidate;
  const seen = new Set<string>();
  for (const selection of candidate.selections) {
    if (!featureIds.has(selection.featureId) || seen.has(selection.featureId)) {
      throw new Error("Invalid configuration candidate references.");
    }
    seen.add(selection.featureId);
  }
  return candidate;
}
