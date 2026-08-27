import { describe, expect, it } from "vitest";
import { simulate } from "../../runtime/simulate";
import { pendulum } from "../../web/src/models/pendulum";
import { sir } from "../../web/src/models/sir";
import { isSnapshot } from "../../web/src/snapshot";

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
    expect(
      isSnapshot({
        model: "lorenz-attractor",
        params: { sigma: 10 },
        cursor: 3,
        savedAt: "2026-08-27T00:00:00.000Z",
        frames: [{ t: 0, state: { x: 1 } }],
      }),
    ).toBe(true);
    expect(isSnapshot({ model: "x" })).toBe(false);
  });
});
