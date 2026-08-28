import { beforeEach, describe, expect, it, vi } from "vitest";
import { lotkaVolterra } from "../../examples/lotka-volterra";
import { vanDerPol } from "../../examples/van-der-pol";
import { simulate } from "@compute-experience/core";
import { mountExperience } from "@compute-experience/ui";

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;

  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    setTransform: vi.fn(),
  }) as any;
});

describe("Museum Dynamic System Models", () => {
  it("simulates Lotka-Volterra predator-prey dynamics with bounded positive populations", () => {
    const frames = simulate(lotkaVolterra, { alpha: 1.1, beta: 0.4, gamma: 0.4, delta: 0.1 });
    expect(frames.length).toBe(600);

    for (const frame of frames) {
      expect(frame.state.prey).toBeGreaterThanOrEqual(0);
      expect(frame.state.predator).toBeGreaterThanOrEqual(0);
    }

    // Verify oscillation: prey should have peaks and troughs
    const preys = frames.map((f) => f.state.prey as number);
    const maxPrey = Math.max(...preys);
    const minPrey = Math.min(...preys);
    expect(maxPrey).toBeGreaterThan(minPrey + 5);
  });

  it("simulates Van der Pol oscillator and exhibits limit cycle", () => {
    const frames = simulate(vanDerPol, { mu: 1.5 });
    expect(frames.length).toBe(600);

    const tail = frames.slice(300);
    const xs = tail.map((f) => f.state.x as number);
    const maxVal = Math.max(...xs);
    const minVal = Math.min(...xs);

    // Limit cycle amplitude around ~2
    expect(maxVal).toBeGreaterThan(1.5);
    expect(minVal).toBeLessThan(-1.5);
  });

  it("mounts universal embed experience into DOM element", () => {
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { value: 600 });
    Object.defineProperty(host, "clientHeight", { value: 400 });
    document.body.appendChild(host);

    const handle = mountExperience(host, {
      model: lotkaVolterra,
      counterfactual: true,
      autostart: false,
    });

    expect(handle.runtime).toBeDefined();
    expect(host.classList.contains("cx-embed-host")).toBe(true);

    handle.seek(2.0);
    expect(handle.runtime.currentIndex()).toBeGreaterThan(0);

    handle.fork(2.0, { field: "prey", delta: 10 });
    expect(handle.runtime.comparisonRuns.length).toBe(1);

    handle.destroy();
    expect(host.classList.contains("cx-embed-host")).toBe(false);
    host.remove();
  });
});
