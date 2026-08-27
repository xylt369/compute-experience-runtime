import type { ModelDefinition, ModelManifest, ModelParameter } from "./protocol/types";

export function defaultParameters(model: ModelDefinition): Record<string, number> {
  return Object.fromEntries(
    model.manifest.parameters.map((parameter) => [parameter.id, coerceDefault(parameter)]),
  );
}

function coerceDefault(parameter: ModelParameter): number {
  if (parameter.type === "boolean") return parameter.default === true ? 1 : 0;
  if (parameter.type === "enum") return 0;
  return Number(parameter.default);
}

export function formatMetricValue(key: string, value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (key.toLowerCase().includes("fraction") && value >= 0 && value <= 1) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

export function metricKeys(manifest: ModelManifest): string[] {
  return [...manifest.state, ...(manifest.derived ?? [])];
}
