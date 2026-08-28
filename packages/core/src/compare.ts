import type { ComputationalRun } from "./run";

export interface FieldDelta {
  key: string;
  a: number;
  b: number;
  delta: number;
  absoluteDelta: number;
  relativeDelta: number | null;
}

export interface ParameterDiff {
  key: string;
  a: number | undefined;
  b: number | undefined;
}

export interface RunComparison {
  runAId: string;
  runBId: string;
  sharedHistoryLength: number;
  divergenceIndex: number | null;
  divergenceTime: number | null;
  /** Max absolute state delta at the divergence frame. */
  divergenceMagnitude: number | null;
  /** State field with the largest delta at divergence. */
  divergenceField: string | null;
  currentTimeA: number;
  currentTimeB: number;
  parameterDifferences: ParameterDiff[];
  stateDifferences: FieldDelta[];
  derivedDifferences: FieldDelta[];
}

export interface CompareOptions {
  /** Minimum max-field delta to treat frames as diverged. Default 1e-9. */
  stateThreshold?: number;
}

const DEFAULT_STATE_THRESHOLD = 1e-9;

function relativeDelta(a: number, b: number): number | null {
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom < 1e-12) return a === b ? 0 : null;
  return (b - a) / denom;
}

export function fieldDelta(key: string, a: number, b: number): FieldDelta {
  const delta = b - a;
  return {
    key,
    a,
    b,
    delta,
    absoluteDelta: Math.abs(delta),
    relativeDelta: relativeDelta(a, b),
  };
}

export function recordDeltas(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): FieldDelta[] {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const out: FieldDelta[] = [];
  for (const key of keys) {
    const av = a?.[key];
    const bv = b?.[key];
    if (typeof av !== "number" || typeof bv !== "number") continue;
    out.push(fieldDelta(key, av, bv));
  }
  return out;
}

export function frameStateMaxDelta(
  a: { state: Record<string, number> },
  b: { state: Record<string, number> },
): { magnitude: number; field: string | null } {
  const keys = new Set([...Object.keys(a.state), ...Object.keys(b.state)]);
  let magnitude = 0;
  let field: string | null = null;
  for (const key of keys) {
    const av = a.state[key];
    const bv = b.state[key];
    if (typeof av !== "number" || typeof bv !== "number") continue;
    const delta = Math.abs(bv - av);
    if (delta > magnitude) {
      magnitude = delta;
      field = key;
    }
  }
  return { magnitude, field };
}

function framesWithinThreshold(
  a: { state: Record<string, number> },
  b: { state: Record<string, number> },
  threshold: number,
): boolean {
  return frameStateMaxDelta(a, b).magnitude < threshold;
}

/**
 * Deterministic comparison of two Runs with threshold-based divergence detection.
 */
export function compareRuns(
  runA: ComputationalRun,
  runB: ComputationalRun,
  options?: CompareOptions,
): RunComparison {
  const threshold = options?.stateThreshold ?? DEFAULT_STATE_THRESHOLD;
  const framesA = runA.timeline.frames;
  const framesB = runB.timeline.frames;
  const sharedCap = Math.min(framesA.length, framesB.length);

  let sharedHistoryLength = 0;
  let divergenceIndex: number | null = null;
  let divergenceMagnitude: number | null = null;
  let divergenceField: string | null = null;

  for (let i = 0; i < sharedCap; i += 1) {
    const { magnitude, field } = frameStateMaxDelta(framesA[i]!, framesB[i]!);
    if (magnitude >= threshold) {
      divergenceIndex = i;
      divergenceMagnitude = magnitude;
      divergenceField = field;
      break;
    }
    sharedHistoryLength = i + 1;
  }
  if (divergenceIndex === null && framesA.length !== framesB.length) {
    divergenceIndex = sharedCap;
    if (sharedCap > 0) {
      const { magnitude, field } = frameStateMaxDelta(framesA[sharedCap - 1]!, framesB[sharedCap - 1]!);
      divergenceMagnitude = magnitude;
      divergenceField = field;
    }
  }

  const paramKeys = new Set([...Object.keys(runA.parameters), ...Object.keys(runB.parameters)]);
  const parameterDifferences: ParameterDiff[] = [];
  for (const key of paramKeys) {
    const a = runA.parameters[key];
    const b = runB.parameters[key];
    if (a !== b) parameterDifferences.push({ key, a, b });
  }

  const frameA = runA.currentFrame();
  const frameB = runB.currentFrame();

  return {
    runAId: runA.id,
    runBId: runB.id,
    sharedHistoryLength,
    divergenceIndex,
    divergenceTime:
      divergenceIndex !== null
        ? (framesA[divergenceIndex]?.t ?? framesB[divergenceIndex]?.t ?? null)
        : null,
    divergenceMagnitude,
    divergenceField,
    currentTimeA: runA.currentTime(),
    currentTimeB: runB.currentTime(),
    parameterDifferences,
    stateDifferences: recordDeltas(frameA?.state, frameB?.state),
    derivedDifferences: recordDeltas(frameA?.derived, frameB?.derived),
  };
}

/** @deprecated Use compareRuns */
export const compare = compareRuns;

export { framesWithinThreshold, DEFAULT_STATE_THRESHOLD };
