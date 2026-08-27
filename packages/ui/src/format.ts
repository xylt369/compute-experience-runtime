import type { ModelParameter } from "@compute-experience/core";

export function parameterDigits(parameter: ModelParameter): number {
  if (parameter.type === "integer") return 0;
  const step = parameter.step ?? 1;
  if (step < 0.01) return 3;
  if (step < 0.1) return 2;
  if (step < 1) return 1;
  return 0;
}

export function formatParameterValue(parameter: ModelParameter, value: number): string {
  if (parameter.type === "boolean") return value >= 0.5 ? "on" : "off";
  if (parameter.type === "enum") {
    const index = Math.max(0, Math.round(value));
    return parameter.options?.[index] ?? String(index);
  }
  const digits = parameterDigits(parameter);
  const text = Number(value).toFixed(digits);
  return parameter.unit ? `${text} ${parameter.unit}` : text;
}
