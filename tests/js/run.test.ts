import { describe, expect, it } from "vitest";
import {
  ComputationalRun,
  compareRuns,
  createRuntime,
  fieldDelta,
  serializeSnapshot,
  deserializeSnapshot,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { lorenz } from "../../examples/lorenz";
import { pendulum } from "../../examples/pendulum";

describe("ComputationalRun", () => {
  it("creates a run with model identity and timeline", () => {
    const run = new ComputationalRun({ model: pendulum, label: "primary" });
    run.rebuild();
    expect(run.meta.modelId).toBe("simple-pendulum");
    expect(run.meta.modelVersion).toBe(pendulum.manifest.version);
    expect(run.timeline.length).toBeGreaterThan(0);
    expect(run.parentRunId).toBeUndefined();
  });

  it("forkAt shares history then diverges after intervention", () => {
    const parent = new ComputationalRun({ model: lorenz });
    parent.rebuild();
    const forkIndex = 50;
    const parentPrefix = parent.timeline.frames.slice(0, forkIndex + 1).map((f) => f.state.x);
    const beforeLen = parent.timeline.length;

    const branch = parent.forkAt(forkIndex, { label: "branch" });
    expect(branch.parentRunId).toBe(parent.id);
    expect(branch.forkPoint?.index).toBe(forkIndex);
    expect(parent.timeline.length).toBe(beforeLen);

    for (let i = 0; i <= forkIndex; i += 1) {
      expect(branch.timeline.frames[i]!.state.x).toBe(parentPrefix[i]);
      expect(branch.timeline.frames[i]).toBe(parent.timeline.frames[i]);
    }

    const forkState = { ...branch.timeline.frames[forkIndex]!.state, x: branch.timeline.frames[forkIndex]!.state.x + 0.5 };
    branch.setForkState(forkState);

    expect(parent.timeline.frames[forkIndex]!.state.x).toBe(parentPrefix[forkIndex]);
    expect(branch.timeline.frames[forkIndex]!.state.x).toBe(forkState.x);
    expect(branch.timeline.frames[forkIndex + 10]!.state.x).not.toBe(
      parent.timeline.frames[forkIndex + 10]!.state.x,
    );
  });

  it("forkAtTime finds the correct index without moving parent cursor", () => {
    const parent = new ComputationalRun({ model: lorenz });
    parent.rebuild();
    parent.seekIndex(10);
    const cursorBefore = parent.currentIndex();
    const t = parent.timeline.frames[80]!.t;
    const branch = parent.forkAtTime(t);
    expect(parent.currentIndex()).toBe(cursorBefore);
    expect(branch.forkPoint?.index).toBe(80);
  });

  it("branch setParameters rebuilds from fork only", () => {
    const parent = new ComputationalRun({ model: lorenz });
    parent.rebuild();
    const forkIndex = 40;
    const branch = parent.forkAt(forkIndex);
    const sharedX = parent.timeline.frames[20]!.state.x;
    branch.setParameters({ rho: 40 });
    expect(branch.timeline.frames[20]!.state.x).toBe(sharedX);
    expect(branch.parameters.rho).toBe(40);
    expect(parent.parameters.rho).toBe(28);
    expect(branch.timeline.frames[forkIndex + 5]!.state.x).not.toBe(
      parent.timeline.frames[forkIndex + 5]!.state.x,
    );
  });

  it("supports independent playback cursors", () => {
    const parent = new ComputationalRun({ model: pendulum });
    parent.rebuild();
    const branch = parent.forkAt(20);
    parent.seekIndex(5);
    branch.seekIndex(30);
    expect(parent.currentIndex()).toBe(5);
    expect(branch.currentIndex()).toBe(30);
  });

  it("reshapeAt preserves prefix and recomputes the future in place", () => {
    const run = new ComputationalRun({ model: lorenz });
    run.rebuild();
    const before = run.timeline.frames.map((frame) => ({ ...frame.state }));
    const index = 45;
    const patched = { ...before[index]!, x: before[index]!.x + 0.08 };
    run.reshapeAt(index, patched);

    for (let i = 0; i < index; i += 1) {
      expect(run.timeline.frames[i]!.state.x).toBe(before[i]!.x);
    }
    expect(run.timeline.frames[index]!.state.x).toBeCloseTo(patched.x, 8);
    expect(run.timeline.frames[index + 8]!.state.x).not.toBe(before[index + 8]!.x);
    expect(run.timeline.length).toBe(before.length);
    expect(run.parentRunId).toBeUndefined();
  });
});

describe("compareRuns and deltas", () => {
  it("reports shared history, divergence, and field deltas", () => {
    const parent = new ComputationalRun({ model: lorenz });
    parent.rebuild();
    const branch = parent.forkAt(30);
    branch.setForkState({
      ...branch.timeline.frames[30]!.state,
      x: branch.timeline.frames[30]!.state.x + 1,
    });
    branch.seekIndex(60);
    parent.seekIndex(60);

    const comparison = compareRuns(parent, branch);
    expect(comparison.sharedHistoryLength).toBe(30);
    expect(comparison.divergenceIndex).toBe(30);
    expect(comparison.stateDifferences.length).toBeGreaterThan(0);
    const dx = comparison.stateDifferences.find((d) => d.key === "x");
    expect(dx?.absoluteDelta).toBeGreaterThan(0);

    const delta = fieldDelta("x", 1, 1.5);
    expect(delta.delta).toBe(0.5);
    expect(delta.absoluteDelta).toBe(0.5);
    expect(delta.relativeDelta).toBeCloseTo(0.5 / 1.5);
  });
});

describe("runtime fork and snapshot", () => {
  it("forks through createRuntime and restores branched snapshots", () => {
    const registry = createRendererRegistry();
    const runtime = createRuntime({ model: lorenz, rendererRegistry: registry });
    runtime.rebuild();
    runtime.seekIndex(45);
    const branch = runtime.forkAt(45, { nudge: { x: 0.4 } });
    expect(runtime.comparisonRuns).toHaveLength(1);
    expect(branch.parentRunId).toBe(runtime.primaryRun.id);

    const comparison = runtime.compare();
    expect(comparison).toBeTruthy();
    expect(comparison!.divergenceIndex).toBe(45);

    const snap = runtime.snapshot(true);
    expect(snap.runs?.length).toBe(2);
    const raw = serializeSnapshot(snap);
    const parsed = deserializeSnapshot(raw);

    const restored = createRuntime({ model: lorenz, rendererRegistry: registry });
    restored.restore(parsed);
    expect(restored.comparisonRuns.length).toBe(1);
    expect(restored.primaryRun.currentIndex()).toBe(snap.cursor);
    const again = restored.compare();
    expect(again?.divergenceIndex).toBe(45);
  });

  it("keeps parent immutable when forking from runtime", () => {
    const registry = createRendererRegistry();
    const runtime = createRuntime({ model: lorenz, rendererRegistry: registry });
    runtime.rebuild();
    const xBefore = runtime.primaryRun.timeline.frames[10]!.state.x;
    runtime.forkAt(10, { nudge: { x: 2 } });
    expect(runtime.primaryRun.timeline.frames[10]!.state.x).toBe(xBefore);
  });
});
