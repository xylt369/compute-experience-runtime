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

export { CoWPageTable } from "./memory";
export type { MemoryPage, PageAllocationOptions, PageId, PageTableStats } from "./memory";

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
export { generateInteractiveHtml } from "./export/html";


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

export {
  PRIMITIVE_IDS,
  PRIMITIVE_REGISTRY,
  assertValidComposedModel,
  createComposedExecutor,
  getPrimitive,
  isNodeWire,
  isParameterWire,
  isStateWire,
  lorenzComposedModel,
  sirComposedModel,
  createSirComposedModelDefinition,
  wrapSirComposedModel,
  validateComposedModel,
  WireResolutionError,
  resolveWireValue,
} from "./composed";
export type {
  ComposedExecutor,
  ComposedModel,
  ComposedNode,
  PrimitiveDefinition,
  PrimitiveId,
  SirModelManifestExtras,
  ValidationDiagnostic,
  ValidationResult,
  Wire,
} from "./composed";

export {
  compileModelConcept,
  validateCompiledModel,
  loadCompiledModel,
  assertLoadableCompilation,
  createMockCompilerLLM,
  createFetchCompilerLLM,
  createOpenAICompilerLLM,
  createCompilerLLMFromEnv,
  readCompilerLLMConfig,
  resolveCompilerLLMConfig,
  COMPILER_ENV_KEYS,
  CompilerProviderError,
  parseLLMCompilationDraft,
  parseOpenAIChatCompletion,
  runCompilerProductLoop,
  buildCompilerPrompt,
  buildRepairPrompt,
  classifyEpidemicConcept,
  isSirComposedModel,
  applyDeterministicStructuralRepair,
  hasNonRepairableErrors,
  hasOnlyStructuralErrors,
  structuralDiagnostics,
  STRUCTURAL_ERROR_CODES,
  NON_REPAIRABLE_ERROR_CODES,
} from "./compiler";
export type {
  CompilationEnvelope,
  CompilationStatus,
  CompileModelConceptOptions,
  CompilerDomain,
  ConceptClassification,
  LLMCompilationDraft,
  ModelCompilerLLM,
  ValidatedModel,
  CompilerLLMConfig,
  CompilerProductLoopOptions,
  CompilerProductLoopResult,
} from "./compiler";

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
