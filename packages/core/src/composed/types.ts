/** Scalar port type — first trace-safe primitive prototype supports only scalars. */
export type PortType = "scalar";

export type PrimitiveId =
  | "linear-coupling"
  | "product-coupling"
  | "scaled-negation"
  | "constant-offset"
  | "ratio"
  | "saturating-growth"
  | "nonlinear-restoring"
  | "magnitude"
  | "integrate";

export type WireKind = "state" | "parameter" | "node" | "constant" | "dt";

export interface StateWire {
  kind: "state";
  field: string;
}

export interface ParameterWire {
  kind: "parameter";
  id: string;
}

export interface NodeWire {
  kind: "node";
  nodeId: string;
  port: string;
}

export interface ConstantWire {
  kind: "constant";
  value: number;
}

export interface DtWire {
  kind: "dt";
}

export type Wire = StateWire | ParameterWire | NodeWire | ConstantWire | DtWire;

export interface ComposedNode {
  id: string;
  primitive: PrimitiveId;
  inputs: Record<string, Wire>;
  label?: string;
}

export interface IntegratorBinding {
  state: string;
  node: string;
}

export interface ComposedParameter {
  id: string;
  label?: string;
  default: number;
}

export interface ComposedTime {
  steps?: number;
  dt?: number;
  playbackRate?: number;
  unit?: string;
}

/** Declarative composed model — nodes wired from primitives into integrators. */
export interface ComposedModel {
  id: string;
  version: string;
  state: string[];
  parameters: ComposedParameter[];
  nodes: ComposedNode[];
  integrators: IntegratorBinding[];
  time?: ComposedTime;
  initial?: Record<string, number>;
  formulas?: Record<string, string>;
}

export interface ValidationDiagnostic {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  ok: boolean;
  diagnostics: ValidationDiagnostic[];
  /** Topological execution order when valid. */
  order?: string[];
}

export interface PrimitivePorts {
  inputs: Record<string, PortType>;
  outputs: Record<string, PortType>;
}

export interface NodeEvaluation {
  value: number;
  inputs: Record<string, number>;
  inputWires: Record<string, Wire>;
}
