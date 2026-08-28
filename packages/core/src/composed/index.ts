export type {
  ComposedModel,
  ComposedNode,
  ComposedParameter,
  ComposedTime,
  ConstantWire,
  DtWire,
  IntegratorBinding,
  NodeEvaluation,
  NodeWire,
  ParameterWire,
  PortType,
  PrimitiveId,
  PrimitivePorts,
  StateWire,
  ValidationDiagnostic,
  ValidationResult,
  Wire,
  WireKind,
} from "./types";

export { PRIMITIVE_IDS, PRIMITIVE_REGISTRY, getPrimitive } from "./primitives";
export type { PrimitiveDefinition, TraceBuildContext } from "./primitives";

export { validateComposedModel, assertValidComposedModel } from "./validator";
export {
  isStateWire,
  isParameterWire,
  isNodeWire,
} from "./validator";

export { createComposedExecutor } from "./executor";
export type { ComposedExecutor } from "./executor";

export { lorenzComposedModel } from "./lorenz-composed";
export { createSirComposedModelDefinition, sirComposedModel, wrapSirComposedModel, SIR_EPIDEMIC_EXPERIENCE } from "./sir-composed";
export type { SirModelManifestExtras } from "./sir-composed";

export { WireResolutionError, resolveWireValue } from "./wire-resolution";
export type { WireResolutionContext } from "./wire-resolution";

export { default as composedModelSchema } from "./schema.json";
