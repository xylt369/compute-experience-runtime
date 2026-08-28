export { defineModel } from "./model";
export { createRuntime } from "./runtime";
export type {
  ComputeRuntime,
  CreateRuntimeOptions,
  RuntimeEvent,
  RuntimeListener,
  RuntimeMountTarget,
} from "./runtime";

export { ComputationalRun } from "./run";
export type { CreateRunOptions, Run, RunListener, RunMeta, RunSnapshotData } from "./run";

export {
  compare,
  compareRuns,
  DEFAULT_STATE_THRESHOLD,
  fieldDelta,
  frameStateMaxDelta,
  framesWithinThreshold,
  recordDeltas,
} from "./compare";
export type { FieldDelta, ParameterDiff, RunComparison } from "./compare";

export { defaultParameters, formatMetricValue, metricKeys } from "./manifest";
export { Timeline } from "./timeline";
export { Player, ModelPlayer } from "./player";
export type { PlayerClock } from "./player";
export { continueSimulate, simulate } from "./simulate";
export { explainField, buildExplainContext } from "./inspect";
export {
  findTraceTerm,
  flattenInspectableTerms,
  referenceTarget,
  traceTermPath,
  traceOperandRows,
  inspectionEditTarget,
} from "./trace";
export type {
  ComputationTrace,
  ExplainStepContext,
  InspectionState,
  InspectionTarget,
  ReshapeInfo,
  StateIntervention,
  TraceOperandRow,
  TraceReference,
  TraceRefKind,
  TraceTerm,
} from "./trace";
export {
  SNAPSHOT_STORAGE_KEY,
  deserializeSnapshot,
  downloadSnapshot,
  isSnapshot,
  makeSnapshot,
  readSnapshotFile,
  readStoredSnapshot,
  serializeSnapshot,
  writeStoredSnapshot,
} from "./snapshot";

export {
  EMPTY_EXPERIENCE_CAPABILITIES,
  PROFILE_PRESETS,
  composeExperience,
  experienceMatrix,
  inspectableTargets,
  intervenableTargets,
  resolveExperience,
  targetIds,
} from "./experience";
export type {
  ExperienceComposition,
  ExperienceContract,
  InteractionPrimitives,
  InteractionVerb,
} from "./experience";

export type {
  ExperienceCapabilities,
  ExperienceProfile,
  ExperienceTarget,
  ExperienceTargetKind,
  ModelExperience,
  ExperienceSnapshot,
  ModelCapabilities,
  ModelDefinition,
  ModelFrame,
  ModelManifest,
  ModelParameter,
  ModelTime,
  ModelTimeConfig,
  ParameterType,
  RunSnapshot,
  StateFrame,
} from "./protocol/types";

export type {
  RendererMountOptions,
  RendererRegistry,
  RendererView,
  RunRenderView,
  RuntimeRenderer,
} from "./renderers/types";
export { resolveRenderer, rendererFor } from "./renderers/types";
