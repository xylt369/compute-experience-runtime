import { describe, expect, it } from "vitest";
import {
  compareRuns,
  createRuntime,
  simulate,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { sir } from "../../examples/sir";

const DEFAULT_PARAMS = {
  population: 1000,
  contactRate: 0.55,
  recoveryRate: 0.12,
  initialInfected: 10,
  interventionStartDay: 20,
  interventionFactor: 0.45,
};

function forkDayIndex(day: number): number {
  const dt = sir.time?.dt ?? 0.25;
  return Math.round(day / dt);
}

describe("SIR counterfactual experience", () => {
  it("produces deterministic runs for the same parameters", () => {
    const a = simulate(sir, DEFAULT_PARAMS);
    const b = simulate(sir, DEFAULT_PARAMS);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i]!.state.infected).toBe(b[i]!.state.infected);
      expect(a[i]!.state.susceptible).toBe(b[i]!.state.susceptible);
    }
  });

  it("forking preserves the shared history prefix", () => {
    const runtime = createRuntime({
      model: sir,
      rendererRegistry: createRendererRegistry(),
      parameters: DEFAULT_PARAMS,
    });
    runtime.rebuild();
    runtime.seekIndex(forkDayIndex(15));
    const cursor = runtime.currentIndex();
    const branch = runtime.forkAt(cursor);
    for (let i = 0; i <= cursor; i += 1) {
      expect(branch.timeline.frames[i]).toBe(runtime.primaryRun.timeline.frames[i]);
    }
  });

  it("leaves the parent run unchanged when the branch intervenes", () => {
    const runtime = createRuntime({
      model: sir,
      rendererRegistry: createRendererRegistry(),
      parameters: DEFAULT_PARAMS,
    });
    runtime.rebuild();
    const forkIndex = forkDayIndex(15);
    runtime.forkAt(forkIndex);
    const branch = runtime.comparisonRuns[0]!;
    const parentInfected = runtime.primaryRun.timeline.frames[forkIndex]!.state.infected;
    branch.setParameters({ interventionStartDay: 10 });
    expect(runtime.primaryRun.parameters.interventionStartDay).toBe(20);
    expect(runtime.primaryRun.timeline.frames[forkIndex]!.state.infected).toBe(parentInfected);
  });

  it("applies intervention only to the branch future after the fork", () => {
    const runtime = createRuntime({
      model: sir,
      rendererRegistry: createRendererRegistry(),
      parameters: DEFAULT_PARAMS,
    });
    runtime.rebuild();
    const forkIndex = forkDayIndex(15);
    runtime.forkAt(forkIndex);
    const branch = runtime.comparisonRuns[0]!;
    branch.setParameters({ interventionStartDay: 10 });

    for (let i = 0; i <= forkIndex; i += 1) {
      expect(branch.timeline.frames[i]!.state.infected).toBe(
        runtime.primaryRun.timeline.frames[i]!.state.infected,
      );
    }
    expect(branch.timeline.frames[forkIndex + 20]!.state.infected).not.toBe(
      runtime.primaryRun.timeline.frames[forkIndex + 20]!.state.infected,
    );
  });

  it("plays both branches synchronously", () => {
    const runtime = createRuntime({
      model: sir,
      rendererRegistry: createRendererRegistry(),
      parameters: DEFAULT_PARAMS,
      syncPlayback: true,
    });
    runtime.rebuild();
    runtime.forkAt(forkDayIndex(15));
    runtime.comparisonRuns[0]!.setParameters({ interventionStartDay: 10 });
    runtime.setSyncPlayback(true);
    runtime.seekIndex(forkDayIndex(30));
    expect(runtime.primaryRun.currentIndex()).toBe(forkDayIndex(30));
    expect(runtime.comparisonRuns[0]!.currentIndex()).toBe(forkDayIndex(30));
  });

  it("reports state differences through compareRuns", () => {
    const runtime = createRuntime({
      model: sir,
      rendererRegistry: createRendererRegistry(),
      parameters: DEFAULT_PARAMS,
    });
    runtime.rebuild();
    runtime.forkAt(forkDayIndex(15));
    const branch = runtime.comparisonRuns[0]!;
    branch.setParameters({ interventionStartDay: 10 });
    const comparison = compareRuns(runtime.primaryRun, branch);
    expect(comparison.divergenceIndex).toBeGreaterThanOrEqual(forkDayIndex(15));
    expect(comparison.stateDifferences.some((diff) => diff.key === "infected")).toBe(true);
    expect((comparison.divergenceMagnitude ?? 0)).toBeGreaterThan(0);
  });

  it("supports rewind and re-fork from a new point", () => {
    const runtime = createRuntime({
      model: sir,
      rendererRegistry: createRendererRegistry(),
      parameters: DEFAULT_PARAMS,
    });
    runtime.rebuild();
    runtime.forkAt(forkDayIndex(12));
    expect(runtime.comparisonRuns).toHaveLength(1);
    runtime.clearBranches();
    runtime.seekIndex(forkDayIndex(18));
    runtime.forkAt(forkDayIndex(18));
    expect(runtime.comparisonRuns[0]!.forkPoint?.index).toBe(forkDayIndex(18));
  });

  it("restores branched counterfactual snapshots", () => {
    const registry = createRendererRegistry();
    const runtime = createRuntime({
      model: sir,
      rendererRegistry: registry,
      parameters: DEFAULT_PARAMS,
    });
    runtime.rebuild();
    runtime.forkAt(forkDayIndex(15));
    runtime.comparisonRuns[0]!.setParameters({ interventionStartDay: 10 });
    const snap = runtime.snapshot(true);
    const restored = createRuntime({
      model: sir,
      rendererRegistry: registry,
      parameters: DEFAULT_PARAMS,
    });
    restored.restore(snap);
    expect(restored.comparisonRuns.length).toBe(1);
    expect(restored.compare()?.divergenceIndex).toBeGreaterThanOrEqual(forkDayIndex(15));
  });
});
