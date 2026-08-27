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
  currentTimeA: number;
  currentTimeB: number;
  parameterDifferences: ParameterDiff[];
  stateDifferences: FieldDelta[];
  derivedDifferences: FieldDelta[];
}

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

function framesEqual(a: { state: Record<string, number> }, b: { state: Record<string, number> }): boolean {
  const keys = new Set([...Object.keys(a.state), ...Object.keys(b.state)]);
  for (const key of keys) {
    if ((a.state[key] ?? NaN) !== (b.state[key] ?? NaN)) return false;
  }
  return true;
}

/**
 * Deterministic comparison of two Runs.
 * Divergence is the first index where state values differ.
 */
export function compareRuns(runA: ComputationalRun, runB: ComputationalRun): RunComparison {
  const framesA = runA.timeline.frames;
  const framesB = runB.timeline.frames;
  const sharedCap = Math.min(framesA.length, framesB.length);

  let sharedHistoryLength = 0;
  let divergenceIndex: number | null = null;
  for (let i = 0; i < sharedCap; i += 1) {
    if (!framesEqual(framesA[i]!, framesB[i]!)) {
      divergenceIndex = i;
      break;
    }
    sharedHistoryLength = i + 1;
  }
  if (divergenceIndex === null && framesA.length !== framesB.length) {
    divergenceIndex = sharedCap;
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
    currentTimeA: runA.currentTime(),
    currentTimeB: runB.currentTime(),
    parameterDifferences,
    stateDifferences: recordDeltas(frameA?.state, frameB?.state),
    derivedDifferences: recordDeltas(frameA?.derived, frameB?.derived),
  };
}

/** @deprecated Use compareRuns */
export const compare = compareRuns;
