import { describe, expect, it } from "vitest";
import {
  compareRuns,
  createRuntime,
  DEFAULT_STATE_THRESHOLD,
  frameStateMaxDelta,
  framesWithinThreshold,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { lorenz } from "../../examples/lorenz";

describe("threshold-based divergence", () => {
  it("treats tiny floating noise as shared history", () => {
    const a = { state: { x: 1, y: 2, z: 3 } };
    const b = { state: { x: 1 + 1e-12, y: 2, z: 3 } };
    expect(framesWithinThreshold(a, b, DEFAULT_STATE_THRESHOLD)).toBe(true);
    expect(frameStateMaxDelta(a, b).magnitude).toBeLessThan(DEFAULT_STATE_THRESHOLD);
  });

  it("detects meaningful divergence with magnitude and field", () => {
    const parent = createRuntime({ model: lorenz, rendererRegistry: createRendererRegistry() });
    parent.rebuild();
    const branch = parent.forkAt(40);
    branch.setForkState({ ...branch.timeline.frames[40]!.state, x: branch.timeline.frames[40]!.state.x + 1e-6 });
    const comparison = compareRuns(parent.primaryRun, branch);
    expect(comparison.divergenceIndex).toBe(40);
    expect(comparison.divergenceMagnitude).toBeGreaterThanOrEqual(1e-6);
    expect(comparison.divergenceField).toBe("x");
  });
});

describe("counterfactual run flow", () => {
  it("forks from current cursor and preserves shared prefix", () => {
    const runtime = createRuntime({ model: lorenz, rendererRegistry: createRendererRegistry() });
    runtime.rebuild();
    runtime.seekIndex(52);
    const cursor = runtime.currentIndex();
    const branch = runtime.forkAt(cursor);
    expect(branch.forkPoint?.index).toBe(cursor);
    for (let i = 0; i <= cursor; i += 1) {
      expect(branch.timeline.frames[i]).toBe(runtime.primaryRun.timeline.frames[i]);
    }
  });

  it("intervention changes only branch future", () => {
    const runtime = createRuntime({ model: lorenz, rendererRegistry: createRendererRegistry() });
    runtime.rebuild();
    runtime.forkAt(35);
    const branch = runtime.comparisonRuns[0]!;
    const parentX = runtime.primaryRun.timeline.frames[35]!.state.x;
    branch.setForkState({ ...branch.timeline.frames[35]!.state, x: parentX + 1e-7 });
    expect(runtime.primaryRun.timeline.frames[35]!.state.x).toBe(parentX);
    expect(branch.timeline.frames[35]!.state.x).toBeCloseTo(parentX + 1e-7, 10);
    expect(branch.timeline.frames[50]!.state.x).not.toBe(runtime.primaryRun.timeline.frames[50]!.state.x);
  });

  it("supports synchronized seek across runs", () => {
    const runtime = createRuntime({ model: lorenz, rendererRegistry: createRendererRegistry(), syncPlayback: true });
    runtime.rebuild();
    runtime.forkAt(20);
    runtime.comparisonRuns[0]!.setForkState({
      ...runtime.comparisonRuns[0]!.timeline.frames[20]!.state,
      x: runtime.primaryRun.timeline.frames[20]!.state.x + 1e-5,
    });
    runtime.setSyncPlayback(true);
    runtime.seek(0.25);
    expect(runtime.primaryRun.currentTime()).toBeCloseTo(0.25, 2);
    expect(runtime.comparisonRuns[0]!.currentTime()).toBeCloseTo(0.25, 2);
  });

  it("clears and re-forks from a new point", () => {
    const runtime = createRuntime({ model: lorenz, rendererRegistry: createRendererRegistry() });
    runtime.rebuild();
    runtime.forkAt(10);
    expect(runtime.comparisonRuns).toHaveLength(1);
    runtime.clearBranches();
    expect(runtime.comparisonRuns).toHaveLength(0);
    runtime.seekIndex(70);
    runtime.forkAt(70);
    expect(runtime.comparisonRuns[0]!.forkPoint?.index).toBe(70);
  });

  it("seeks to divergence via comparison metadata", () => {
    const runtime = createRuntime({ model: lorenz, rendererRegistry: createRendererRegistry() });
    runtime.rebuild();
    runtime.forkAt(30);
    const branch = runtime.comparisonRuns[0]!;
    branch.setForkState({ ...branch.timeline.frames[30]!.state, x: branch.timeline.frames[30]!.state.x + 0.01 });
    const comparison = runtime.compare();
    expect(comparison?.divergenceIndex).toBe(30);
    runtime.pause();
    runtime.seekIndex(Math.max(0, comparison!.divergenceIndex! - 1));
    expect(runtime.currentIndex()).toBe(29);
  });

  it("restores branched counterfactual snapshots", () => {
    const registry = createRendererRegistry();
    const runtime = createRuntime({ model: lorenz, rendererRegistry: registry });
    runtime.rebuild();
    runtime.forkAt(25);
    runtime.comparisonRuns[0]!.setForkState({
      ...runtime.comparisonRuns[0]!.timeline.frames[25]!.state,
      x: runtime.primaryRun.timeline.frames[25]!.state.x + 1e-4,
    });
    const snap = runtime.snapshot(true);
    const restored = createRuntime({ model: lorenz, rendererRegistry: registry });
    restored.restore(snap);
    expect(restored.comparisonRuns.length).toBe(1);
    expect(restored.compare()?.divergenceIndex).toBe(25);
  });
});
