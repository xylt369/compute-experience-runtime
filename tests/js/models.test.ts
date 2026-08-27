import { describe, expect, it } from "vitest";
import {
  createRuntime,
  defaultParameters,
  defineModel,
  deserializeSnapshot,
  isSnapshot,
  serializeSnapshot,
  simulate,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { pendulum } from "../../examples/pendulum";
import { sir } from "../../examples/sir";

describe("authored JS models", () => {
  it("lets a nonlinear pendulum go over the top given enough energy", () => {
    const frames = simulate(pendulum, { gravity: 9.8, length: 1.6, angle: 0 }, {
      initial: { angle: 0, angularVelocity: 9 },
    });
    const maxAbs = Math.max(...frames.map((frame) => Math.abs(frame.state.angle)));
    expect(maxAbs).toBeGreaterThan(Math.PI);
  });

  it("moves the SIR infected peak earlier when contact rate rises", () => {
    const slow = simulate(sir, { population: 1000, contactRate: 0.35, recoveryRate: 0.12, initialInfected: 10 });
    const fast = simulate(sir, { population: 1000, contactRate: 1.2, recoveryRate: 0.12, initialInfected: 10 });
    const peak = (frames: typeof slow) => {
      let best = 0;
      let index = 0;
      frames.forEach((frame, i) => {
        if (frame.state.infected > best) {
          best = frame.state.infected;
          index = i;
        }
      });
      return index;
    };
    expect(peak(fast)).toBeLessThan(peak(slow));
  });
});

describe("defineModel", () => {
  it("returns the same model definition", () => {
    const model = defineModel({
      manifest: {
        id: "x",
        name: "X",
        description: "test",
        version: "0.1.0",
        renderer: "timeseries-2d",
        parameters: [],
        state: ["x"],
      },
      initial: () => ({ x: 1 }),
      step: (s) => s,
    });
    expect(model.manifest.id).toBe("x");
    expect(defaultParameters(model)).toEqual({});
  });
});

describe("snapshot shape", () => {
  it("accepts the shareable object and optional frames", () => {
    expect(
      isSnapshot({
        model: "lorenz-attractor",
        params: { sigma: 10 },
        cursor: 3,
        savedAt: "2026-08-27T00:00:00.000Z",
      }),
    ).toBe(true);
    const withFrames = {
      model: "lorenz-attractor",
      params: { sigma: 10 },
      cursor: 3,
      savedAt: "2026-08-27T00:00:00.000Z",
      frames: [{ t: 0, state: { x: 1 } }],
    };
    expect(isSnapshot(withFrames)).toBe(true);
    expect(deserializeSnapshot(serializeSnapshot(withFrames))).toEqual(withFrames);
    expect(isSnapshot({ model: "x" })).toBe(false);
  });
});

describe("createRuntime", () => {
  it("owns timeline, player, and snapshot without DOM", () => {
    const registry = createRendererRegistry();
    const runtime = createRuntime({ model: pendulum, rendererRegistry: registry });
    expect(runtime.timeline.length).toBe(0);
    runtime.rebuild();
    expect(runtime.timeline.length).toBeGreaterThan(0);
    expect(runtime.currentFrame()).toBeTruthy();
    const snap = runtime.snapshot(false);
    expect(snap.model).toBe("simple-pendulum");
    expect(snap.params.gravity).toBe(9.8);
  });
});
