import type { ComputationTrace, ExplainStepContext } from "../trace";

export type ParameterType = "number" | "integer" | "boolean" | "enum";

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

export interface ModelTimeConfig {
  steps?: number;
  dt?: number;
  playbackRate?: number;
  unit?: string;
  mode?: string;
}

export interface ModelCapabilities {
  rewind?: boolean;
  interactive?: boolean;
  deterministic?: boolean;
}

export type ExperienceProfile = "microscope" | "counterfactual" | "instrument" | "manifest";

export interface ExperienceCapabilities {
  inspect: boolean;
  trace: boolean;
  intervene: boolean;
  replay: boolean;
  fork: boolean;
  compare: boolean;
}

/** Declarative experience semantics (not UI layout). */
export interface ModelExperience {
  profile?: ExperienceProfile;
  label?: string;
  capabilities?: Partial<ExperienceCapabilities>;
  targets?: string[];
  roles?: Record<string, string>;
  options?: {
    autoPlay?: boolean;
    showOutcomes?: boolean;
    intervention?: {
      mode: "state" | "parameter";
      parameterId?: string;
      forkValue?: number;
      perturbField?: string;
      defaultEpsilon?: number;
      label?: string;
    };
  };
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
  time?: ModelTimeConfig;
  capabilities?: ModelCapabilities;
  /** How this model can be experienced (semantic capabilities, not DOM). */
  experience?: ModelExperience;
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
  unit?: string;
}

export interface ModelDefinition {
  manifest: ModelManifest;
  initial(parameters?: Record<string, unknown>): Record<string, number>;
  step(
    state: Record<string, number>,
    parameters: Record<string, unknown>,
    dt: number,
    /** Simulation time at the start of this step (optional; time-aware models only). */
    t?: number,
  ): Record<string, number>;
  derive?(state: Record<string, number>, parameters: Record<string, unknown>): Record<string, number>;
  explain?(context: ExplainStepContext, field: string): Omit<ComputationTrace, "inputFrameIndex" | "inputTime"> | null;
  time?: ModelTime;
}

export interface RunSnapshot {
  id: string;
  params: Record<string, number>;
  cursor: number;
  parentRunId?: string;
  forkIndex?: number;
  forkTime?: number;
  forkState?: Record<string, number>;
  initialState?: Record<string, number>;
  frames?: StateFrame[];
  label?: string;
}

export interface ExperienceSnapshot {
  model: string;
  version?: string;
  params: Record<string, number>;
  cursor: number;
  savedAt: string;
  frames?: StateFrame[];
  primaryRunId?: string;
  runs?: RunSnapshot[];
  syncPlayback?: boolean;
}
