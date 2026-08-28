import { describe, expect, it } from "vitest";
import {
  createRuntime,
  explainField,
  findTraceTerm,
  inspectionEditTarget,
  referenceTarget,
  simulate,
  traceOperandRows,
  traceTermPath,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { lorenz } from "../../examples/lorenz";
import { pendulum } from "../../examples/pendulum";

const PARAMS = { sigma: 10, rho: 28, beta: 8 / 3 };

describe("explain() compatibility", () => {
  it("returns null for models without explain()", () => {
    const frames = simulate(pendulum, { gravity: 9.8, length: 1, angle: 0.5 });
    const trace = explainField(pendulum, frames, 10, "angle", { gravity: 9.8, length: 1, angle: 0.5 });
    expect(trace).toBeNull();
  });

  it("generates Lorenz trace at a specific frame with correct time semantics", () => {
    const frames = simulate(lorenz, PARAMS);
    const trace = explainField(lorenz, frames, 42, "z", PARAMS);
    expect(trace).not.toBeNull();
    expect(trace!.field).toBe("z");
    expect(trace!.frameIndex).toBe(42);
    expect(trace!.inputFrameIndex).toBe(41);
    expect(trace!.time).toBeCloseTo(frames[42]!.t, 8);
    expect(trace!.inputTime).toBeCloseTo(frames[41]!.t, 8);
    expect(trace!.result.value).toBeCloseTo(frames[42]!.state.z, 8);
    expect(trace!.formula).toContain("z_next");
  });

  it("marks frame zero as initial", () => {
    const frames = simulate(lorenz, PARAMS);
    const trace = explainField(lorenz, frames, 0, "x", PARAMS);
    expect(trace?.initial).toBe(true);
    expect(trace?.inputFrameIndex).toBe(0);
  });
});

describe("trace navigation helpers", () => {
  it("finds nested terms and builds ancestor paths", () => {
    const frames = simulate(lorenz, PARAMS);
    const trace = explainField(lorenz, frames, 20, "z", PARAMS)!;
    const product = findTraceTerm(trace.result, "x_times_y");
    expect(product?.label).toBe("x·y");
    const path = traceTermPath(trace.result, "x_prev");
    expect(path.map((node) => node.id)).toContain("x_times_y");
    const ref = product?.refs?.[0];
    expect(ref).toBeTruthy();
    const target = referenceTarget(ref!);
    expect(target?.field).toBe("x");
    expect(target?.frameIndex).toBe(19);
  });

  it("exposes operand rows for equation display", () => {
    const frames = simulate(lorenz, PARAMS);
    const trace = explainField(lorenz, frames, 30, "z", PARAMS)!;
    const rows = traceOperandRows(trace, null);
    expect(rows.some((row) => row.label.includes("x"))).toBe(true);
    expect(rows.some((row) => row.label.includes("dt") || row.id === "dt")).toBe(true);
  });

  it("resolves edit target for nested term navigation", () => {
    const frames = simulate(lorenz, PARAMS);
    const trace = explainField(lorenz, frames, 30, "z", PARAMS)!;
    const target = inspectionEditTarget(trace, "z", "x_prev");
    expect(target.frameIndex).toBe(29);
    expect(target.field).toBe("x");
  });
});

describe("runtime inspect / intervene / replay", () => {
  it("inspects a field at the current frame", () => {
    const runtime = createRuntime({ model: lorenz, rendererRegistry: createRendererRegistry() });
    runtime.rebuild();
    runtime.seekIndex(30);
    const state = runtime.inspect(30, "z");
    expect(state?.trace.field).toBe("z");
    expect(state?.navigation).toHaveLength(1);
    expect(state?.trace.inputFrameIndex).toBe(29);
  });

  it("seeks when navigating to a referenced frame", () => {
    const runtime = createRuntime({ model: lorenz, rendererRegistry: createRendererRegistry() });
    runtime.rebuild();
    runtime.inspect(30, "z");
    runtime.inspect(29, "x", null, { push: true, seek: true });
    expect(runtime.currentIndex()).toBe(29);
  });

  it("supports recursive inspection navigation", () => {
    const runtime = createRuntime({ model: lorenz, rendererRegistry: createRendererRegistry() });
    runtime.rebuild();
    runtime.inspect(25, "z");
    const deeper = runtime.inspect(24, "x", null, { push: true, seek: true });
    expect(deeper?.navigation.length).toBe(2);
    const back = runtime.inspectionBack();
    expect(back?.field).toBe("z");
    expect(runtime.currentIndex()).toBe(25);
  });

  it("intervenes in-place and preserves frames before N", () => {
    const runtime = createRuntime({ model: lorenz, rendererRegistry: createRendererRegistry() });
    runtime.rebuild();
    const before = runtime.primaryRun.timeline.frames.map((frame) => ({ ...frame.state }));
    const index = 40;
    const originalX = before[index]!.x;
    runtime.intervene({ frameIndex: index, field: "x", value: originalX + 0.05 });
    for (let i = 0; i < index; i += 1) {
      expect(runtime.primaryRun.timeline.frames[i]!.state.x).toBe(before[i]!.x);
    }
    expect(runtime.primaryRun.timeline.frames[index]!.state.x).toBeCloseTo(originalX + 0.05, 8);
    expect(runtime.primaryRun.timeline.frames[index + 10]!.state.x).not.toBe(before[index + 10]!.x);
    expect(runtime.reshape?.frameIndex).toBe(index);
    expect(runtime.comparisonRuns).toHaveLength(0);
  });

  it("replays deterministically after intervention", () => {
    const runtimeA = createRuntime({ model: lorenz, rendererRegistry: createRendererRegistry() });
    const runtimeB = createRuntime({ model: lorenz, rendererRegistry: createRendererRegistry() });
    runtimeA.rebuild();
    runtimeB.rebuild();
    runtimeA.intervene({ frameIndex: 35, field: "y", value: 12.5 });
    runtimeB.intervene({ frameIndex: 35, field: "y", value: 12.5 });
    const tailA = runtimeA.primaryRun.timeline.frames.slice(36, 50).map((f) => f.state.z);
    const tailB = runtimeB.primaryRun.timeline.frames.slice(36, 50).map((f) => f.state.z);
    expect(tailA).toEqual(tailB);
  });

  it("restores pre-intervention state from snapshot", () => {
    const registry = createRendererRegistry();
    const runtime = createRuntime({ model: lorenz, rendererRegistry: registry });
    runtime.rebuild();
    const snap = runtime.snapshot(true);
    const index = 35;
    const original = runtime.primaryRun.timeline.frames[index]!.state.x;
    runtime.intervene({ frameIndex: index, field: "x", value: original + 0.2 });
    expect(runtime.primaryRun.timeline.frames[index]!.state.x).not.toBeCloseTo(original, 8);
    runtime.restore(snap);
    expect(runtime.primaryRun.timeline.frames[index]!.state.x).toBeCloseTo(original, 8);
  });

  it("keeps existing fork behavior intact", () => {
    const runtime = createRuntime({ model: lorenz, rendererRegistry: createRendererRegistry() });
    runtime.rebuild();
    runtime.forkAt(20);
    expect(runtime.comparisonRuns).toHaveLength(1);
    runtime.comparisonRuns[0]!.setForkState({
      ...runtime.comparisonRuns[0]!.timeline.frames[20]!.state,
      x: runtime.primaryRun.timeline.frames[20]!.state.x + 1e-6,
    });
    expect(runtime.compare()?.divergenceIndex).toBe(20);
  });
});
