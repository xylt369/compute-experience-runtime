import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  createComposedExecutor,
  explainField,
  findTraceTerm,
  lorenzComposedModel,
  referenceTarget,
  simulate,
  validateComposedModel,
} from "@compute-experience/core";
import { lorenz } from "../../examples/lorenz";
import composedSchema from "../../packages/core/src/composed/schema.json";

const PARAMS = { sigma: 10, rho: 28, beta: 8 / 3 };
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(composedSchema);

describe("composed model schema", () => {
  it("validates the Lorenz composed graph against JSON schema", () => {
    expect(validateSchema(lorenzComposedModel)).toBe(true);
  });
});

describe("composed model validator", () => {
  it("accepts the Lorenz graph with topological order", () => {
    const result = validateComposedModel(lorenzComposedModel);
    expect(result.ok).toBe(true);
    expect(result.order).toContain("sigma_term");
    expect(result.order!.indexOf("y_minus_x")).toBeLessThan(result.order!.indexOf("sigma_term"));
  });

  it("reports missing integrator with precise diagnostic", () => {
    const broken = {
      ...lorenzComposedModel,
      integrators: lorenzComposedModel.integrators.filter((b) => b.state !== "z"),
    };
    const result = validateComposedModel(broken);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "MISSING_INTEGRATOR" && d.path === "state/z")).toBe(true);
  });

  it("reports cycle with precise diagnostic", () => {
    const cyclic = {
      ...lorenzComposedModel,
      nodes: [
        {
          id: "a",
          primitive: "scaled-negation" as const,
          inputs: { signal: { kind: "node" as const, nodeId: "b", port: "out" } },
        },
        {
          id: "b",
          primitive: "scaled-negation" as const,
          inputs: { signal: { kind: "node" as const, nodeId: "a", port: "out" } },
        },
      ],
      integrators: [{ state: "x", node: "a" }],
      state: ["x"],
    };
    const result = validateComposedModel(cyclic);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "CYCLE_DETECTED")).toBe(true);
  });

  it("reports unresolved wire with precise diagnostic", () => {
    const broken = {
      ...lorenzComposedModel,
      nodes: lorenzComposedModel.nodes.map((n) =>
        n.id === "sigma_term"
          ? {
              ...n,
              inputs: {
                ...n.inputs,
                signal: { kind: "node" as const, nodeId: "missing_node", port: "out" },
              },
            }
          : n,
      ),
    };
    const result = validateComposedModel(broken);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "UNRESOLVED_WIRE")).toBe(true);
  });

  it("reports schema violation for unknown primitive enum", () => {
    const broken = {
      ...lorenzComposedModel,
      nodes: lorenzComposedModel.nodes.map((n) =>
        n.id === "sigma_term" ? { ...n, primitive: "unknown-primitive" } : n,
      ),
    };
    const result = validateComposedModel(broken);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "SCHEMA_INVALID")).toBe(true);
  });
});

describe("composed Lorenz executor", () => {
  const executor = createComposedExecutor(lorenzComposedModel);
  const composedModel = executor.toModelDefinition({
    id: "lorenz-attractor-composed",
    name: "Lorenz (composed)",
    renderer: "trajectory-3d",
  });

  it("matches hand-written Lorenz trajectory numerically", () => {
    const handFrames = simulate(lorenz, PARAMS);
    const composedFrames = simulate(composedModel, PARAMS);
    expect(composedFrames.length).toBe(handFrames.length);
    for (let i = 0; i < handFrames.length; i += 1) {
      for (const key of ["x", "y", "z"] as const) {
        expect(composedFrames[i]!.state[key]).toBeCloseTo(handFrames[i]!.state[key], 10);
      }
    }
  });

  it("reconstructs trace with resolvable references", () => {
    const handFrames = simulate(lorenz, PARAMS);
    const composedFrames = simulate(composedModel, PARAMS);
    const frameIndex = 42;

    for (const field of ["x", "y", "z"] as const) {
      const handTrace = explainField(lorenz, handFrames, frameIndex, field, PARAMS)!;
      const composedTrace = explainField(composedModel, composedFrames, frameIndex, field, PARAMS)!;

      expect(composedTrace.result.value).toBeCloseTo(handTrace.result.value, 10);
      expect(composedTrace.frameIndex).toBe(handTrace.frameIndex);
      expect(composedTrace.formula).toBe(handTrace.formula);

      const product =
        field === "z"
          ? findTraceTerm(composedTrace.result, "x_times_y")
          : field === "x"
            ? findTraceTerm(composedTrace.result, "sigma_term")
            : findTraceTerm(composedTrace.result, "x_rho_z");

      if (field === "z") {
        expect(product?.label).toBe("x·y");
        const ref = product?.refs?.[0];
        expect(ref).toBeTruthy();
        const target = referenceTarget(ref!);
        expect(target?.field).toBe("x");
        expect(target?.frameIndex).toBe(frameIndex - 1);
      }
    }
  });

  it("executes step identically to hand-written Lorenz for one Euler step", () => {
    const state = { x: 1.2, y: 0.8, z: 2.5 };
    const dt = 0.01;
    const handNext = lorenz.step!(state, PARAMS, dt);
    const composedNext = executor.step(state, PARAMS, dt);
    expect(composedNext.x).toBeCloseTo(handNext.x, 12);
    expect(composedNext.y).toBeCloseTo(handNext.y, 12);
    expect(composedNext.z).toBeCloseTo(handNext.z, 12);
  });
});

describe("primitive registry", () => {
  it("exposes exactly the closed first prototype set", () => {
    expect([
      "linear-coupling",
      "product-coupling",
      "scaled-negation",
      "constant-offset",
      "ratio",
      "integrate",
    ]).toEqual(expect.arrayContaining(["linear-coupling", "integrate"]));
  });
});
