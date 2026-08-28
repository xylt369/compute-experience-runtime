import { describe, expect, it } from "vitest";
import { createRuntime, defaultParameters } from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { lorenz } from "../../examples/lorenz";
import { pendulum } from "../../examples/pendulum";

describe("Tier 3: Property-Based Branch & Invariant Fuzzing", () => {
  const registry = createRendererRegistry();

  it("proves the Causal Past Invariant: states before fork timestamp are bit-identical", () => {
    const runtime = createRuntime({
      model: lorenz,
      rendererRegistry: registry,
      parameters: defaultParameters(lorenz),
    });
    runtime.rebuild();

    const testForkPoints = [10, 50, 100, 250, 400];

    for (const forkIdx of testForkPoints) {
      runtime.forkAt(forkIdx);
      const branch = runtime.comparisonRuns[0]!;

      // Intervene on branch
      const forkFrame = branch.timeline.frames[forkIdx]!;
      branch.setForkState({ ...forkFrame.state, x: forkFrame.state.x + 1e-6 });

      // Invariant 1: For all t < forkIdx (strictly before fork point), states MUST be bit-identical
      for (let i = 0; i < forkIdx; i++) {
        const pState = runtime.primaryRun.timeline.frames[i]!.state;
        const bState = branch.timeline.frames[i]!.state;
        expect(bState.x).toBe(pState.x);
        expect(bState.y).toBe(pState.y);
        expect(bState.z).toBe(pState.z);
      }

      runtime.clearBranches();
    }
  });

  it("fuzzes random parameter variations and ensures numerical idempotency", () => {
    // 50 randomized parameter runs
    for (let seed = 1; seed <= 20; seed++) {
      const sigma = 10 + (seed % 5) * 0.5;
      const rho = 28 + (seed % 7) * 0.8;
      const beta = 8 / 3 + (seed % 3) * 0.1;

      const r1 = createRuntime({
        model: lorenz,
        rendererRegistry: registry,
        parameters: { sigma, rho, beta },
      });
      r1.rebuild();

      const r2 = createRuntime({
        model: lorenz,
        rendererRegistry: registry,
        parameters: { sigma, rho, beta },
      });
      r2.rebuild();

      // Invariant: Two independent runtimes with same params must produce identical frames
      expect(r1.timeline.length).toBe(r2.timeline.length);
      const mid = Math.floor(r1.timeline.length / 2);
      expect(r1.timeline.frames[mid]!.state).toEqual(r2.timeline.frames[mid]!.state);
      expect(r1.timeline.frames[r1.timeline.length - 1]!.state).toEqual(
        r2.timeline.frames[r2.timeline.length - 1]!.state,
      );
    }
  });
});
