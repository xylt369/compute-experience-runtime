import { describe, expect, it, vi } from "vitest";
import { main } from "../../bin/cx";

describe("Tier 4: POSIX CLI E2E Verification", () => {
  it("executes 'cx models' and exits cleanly with 0", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg) => logs.push(msg));

    const code = await main(["models"]);
    expect(code).toBe(0);
    expect(logs.some((l) => l.includes("lorenz-attractor"))).toBe(true);
    expect(logs.some((l) => l.includes("sir-epidemic"))).toBe(true);

    spy.mockRestore();
  });

  it("executes 'cx inspect sir-epidemic' and validates composed DAG", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg) => logs.push(msg));

    const code = await main(["inspect", "sir-epidemic"]);
    expect(code).toBe(0);
    expect(logs.some((l) => l.includes("Topological Order"))).toBe(true);

    spy.mockRestore();
  });

  it("executes 'cx run lorenz-attractor' in json mode and outputs valid frame array", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg) => logs.push(msg));

    const code = await main(["run", "lorenz-attractor", "--format", "json"]);
    expect(code).toBe(0);

    const jsonStr = logs.join("");
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(10);
    expect(parsed[0].state.x).toBeDefined();

    spy.mockRestore();
  });

  it("executes 'cx diff lorenz-attractor' and outputs divergence metrics", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg) => logs.push(msg));

    const code = await main(["diff", "lorenz-attractor", "--at", "5.0", "--intervene", "x=1e-8"]);
    expect(code).toBe(0);
    expect(logs.some((l) => l.includes("Counterfactual Run Divergence Report"))).toBe(true);
    expect(logs.some((l) => l.includes("Fork Timestamp"))).toBe(true);

    spy.mockRestore();
  });
});
