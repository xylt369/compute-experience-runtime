export type ParameterType = "number" | "boolean" | "enum";

export interface ModelParameter {
  id: string;
  label: string;
  type: ParameterType;
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: string[];
}

export interface ModelManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  parameters: ModelParameter[];
  state: string[];
  derived?: string[];
  renderer: string;
  time?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
}

export interface StateFrame {
  t: number;
  state: Record<string, number>;
  derived?: Record<string, number>;
}

export type ModelFrame = StateFrame;

export interface ModelTime {
  steps: number;
  dt: number;
  playbackRate?: number;
}

export interface ModelDefinition {
  manifest: ModelManifest;
  initial(parameters?: Record<string, unknown>): Record<string, number>;
  step(
    state: Record<string, number>,
    parameters: Record<string, unknown>,
    dt: number,
  ): Record<string, number>;
  derive?(state: Record<string, number>, parameters: Record<string, unknown>): Record<string, number>;
  time?: ModelTime;
}

export interface ExperienceSnapshot {
  model: string;
  params: Record<string, number>;
  cursor: number;
  savedAt: string;
  frames?: ModelFrame[];
}
