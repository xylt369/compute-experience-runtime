/** Author-provided execution structure — not inferred causality. */

export type TraceRefKind = "state" | "parameter" | "term" | "constant" | "dt";

/** Pointer to an inspectable ancestor (state, parameter, or nested term). */
export interface TraceReference {
  kind: TraceRefKind;
  id: string;
  label: string;
  value: number;
  /** Frame whose state produced this value (temporal navigation). */
  frameIndex?: number;
  field?: string;
  termId?: string;
}

/** One node in an authored decomposition of a computed value. */
export interface TraceTerm {
  id: string;
  label: string;
  symbol?: string;
  value: number;
  role: "result" | "sum" | "product" | "difference" | "operand" | "coefficient";
  children?: TraceTerm[];
  refs?: TraceReference[];
}

/** Trace explaining how a state field at a specific frame was computed. */
export interface ComputationTrace {
  field: string;
  /** Result frame index (state at t + Δt). */
  frameIndex: number;
  /** Result time. */
  time: number;
  dt: number;
  /** Input frame index (state at t). */
  inputFrameIndex: number;
  /** Input time. */
  inputTime: number;
  formula: string;
  result: TraceTerm;
  initial?: boolean;
}

export interface ExplainStepContext {
  /** State at the start of the Euler step. */
  state: Record<string, number>;
  /** State one frame earlier (for nested temporal hops). */
  prevState: Record<string, number>;
  parameters: Record<string, unknown>;
  dt: number;
  t: number;
  frameIndex: number;
}

export interface InspectionTarget {
  frameIndex: number;
  field: string;
  termId: string | null;
  label: string;
}

export interface InspectionState {
  frameIndex: number;
  field: string;
  termId: string | null;
  trace: ComputationTrace;
  value: number;
  navigation: InspectionTarget[];
}

export interface StateIntervention {
  frameIndex: number;
  field: string;
  value: number;
}

export interface ReshapeInfo {
  frameIndex: number;
  field: string;
  priorFrames: readonly { t: number; state: Record<string, number> }[];
  generation: number;
}

export function findTraceTerm(root: TraceTerm, termId: string): TraceTerm | null {
  if (root.id === termId) return root;
  for (const child of root.children ?? []) {
    const found = findTraceTerm(child, termId);
    if (found) return found;
  }
  return null;
}

export function traceTermPath(root: TraceTerm, termId: string): TraceTerm[] {
  const walk = (node: TraceTerm, path: TraceTerm[]): TraceTerm[] | null => {
    const next = [...path, node];
    if (node.id === termId) return next;
    for (const child of node.children ?? []) {
      const found = walk(child, next);
      if (found) return found;
    }
    return null;
  };
  return walk(root, []) ?? [];
}

export function referenceTarget(ref: TraceReference): InspectionTarget | null {
  if (ref.frameIndex == null || !ref.field) return null;
  return {
    frameIndex: ref.frameIndex,
    field: ref.field,
    termId: ref.termId ?? null,
    label: ref.label,
  };
}

export function flattenInspectableTerms(root: TraceTerm, termId: string | null): TraceTerm[] {
  if (!termId) {
    const items: TraceTerm[] = [root];
    for (const child of root.children ?? []) items.push(child);
    return items;
  }
  const focus = findTraceTerm(root, termId);
  if (!focus) return [root];
  const items: TraceTerm[] = [focus];
  for (const child of focus.children ?? []) items.push(child);
  return items;
}

export interface TraceOperandRow {
  id: string;
  label: string;
  value: number;
  termId?: string;
  ref?: TraceReference;
}

/** Flat operand rows for equation-oriented inspector display. */
export function traceOperandRows(trace: ComputationTrace, termId: string | null): TraceOperandRow[] {
  const focus = termId ? findTraceTerm(trace.result, termId) : trace.result;
  if (!focus) return [];

  if (focus.children?.length) {
    return focus.children.map((child) => ({
      id: child.id,
      label: child.label,
      value: child.value,
      termId: child.id,
      ref: child.refs?.[0],
    }));
  }

  return (focus.refs ?? []).map((ref) => ({
    id: ref.id,
    label: ref.label,
    value: ref.value,
    ref,
  }));
}

export function inspectionEditTarget(
  trace: ComputationTrace,
  field: string,
  termId: string | null,
): { frameIndex: number; field: string; time: number } {
  if (termId) {
    const term = findTraceTerm(trace.result, termId);
    const stateRef = term?.refs?.find((ref) => ref.kind === "state" && ref.frameIndex != null && ref.field);
    if (stateRef?.frameIndex != null && stateRef.field) {
      return { frameIndex: stateRef.frameIndex, field: stateRef.field, time: trace.inputTime };
    }
    for (const child of term?.children ?? []) {
      const nested = child.refs?.find((ref) => ref.kind === "state" && ref.frameIndex != null && ref.field);
      if (nested?.frameIndex != null && nested.field) {
        return { frameIndex: nested.frameIndex, field: nested.field, time: trace.inputTime };
      }
    }
  }

  if (trace.initial) {
    return { frameIndex: trace.frameIndex, field, time: trace.time };
  }

  return { frameIndex: trace.frameIndex, field, time: trace.time };
}
