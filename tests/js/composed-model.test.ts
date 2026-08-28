import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  createComposedExecutor,
  createSirComposedModelDefinition,
  explainField,
  findTraceTerm,
  lorenzComposedModel,
  referenceTarget,
  simulate,
  sirComposedModel,
  validateComposedModel,
  WireResolutionError,
} from "@compute-experience/core";
import { lorenz } from "../../examples/lorenz";
import { sir } from "../../examples/sir";
import composedSchema from "../../packages/core/src/composed/schema.json";

const PARAMS = { sigma: 10, rho: 28, beta: 8 / 3 };
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(composedSchema);

describe("composed model schema", () => {
  it("validates the Lorenz composed graph against JSON schema", () => {
    expect(validateSchema(lorenzComposedModel)).toBe(true);
  });

  it("validates the SIR composed graph against JSON schema", () => {
    expect(validateSchema(sirComposedModel)).toBe(true);
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

const SIR_PARAM_SETS = [
  {
    population: 1000,
    contactRate: 0.55,
    recoveryRate: 0.12,
    initialInfected: 10,
    interventionStartDay: 20,
    interventionFactor: 0.45,
  },
  {
    population: 1000,
    contactRate: 0.35,
    recoveryRate: 0.12,
    initialInfected: 10,
    interventionStartDay: 20,
    interventionFactor: 0.45,
  },
  {
    population: 1000,
    contactRate: 1.2,
    recoveryRate: 0.12,
    initialInfected: 10,
    interventionStartDay: 20,
    interventionFactor: 0.45,
  },
  {
    population: 500,
    contactRate: 0.8,
    recoveryRate: 0.25,
    initialInfected: 5,
    interventionStartDay: 5,
    interventionFactor: 0.6,
  },
  {
    population: 2000,
    contactRate: 0.45,
    recoveryRate: 0.08,
    initialInfected: 20,
    interventionStartDay: 999,
    interventionFactor: 0.3,
  },
] as const;

const SIR_STEP_COUNTS = [100, 500, 900] as const;

describe("composed SIR executor", () => {
  const composedSir = createSirComposedModelDefinition();

  it("accepts the SIR graph with flux nodes before integrators", () => {
    const result = validateComposedModel(sirComposedModel);
    expect(result.ok).toBe(true);
    expect(result.order!.indexOf("infection_flux")).toBeLessThan(result.order!.indexOf("dI_rate"));
    expect(result.order!.indexOf("recovery_flux")).toBeLessThan(result.order!.indexOf("dI_rate"));
    expect(result.order!.indexOf("dI_rate")).toBeLessThan(result.order!.indexOf("i_next"));
  });

  it.each(SIR_PARAM_SETS)("matches hand-written SIR for parameters %#", (params) => {
    const handFrames = simulate(sir, params);
    const composedFrames = simulate(composedSir, params);
    expect(composedFrames.length).toBe(handFrames.length);
    for (let i = 0; i < handFrames.length; i += 1) {
      for (const key of ["susceptible", "infected", "recovered"] as const) {
        expect(composedFrames[i]!.state[key]).toBeCloseTo(handFrames[i]!.state[key], 10);
      }
    }
  });

  it.each(SIR_STEP_COUNTS)("matches hand-written SIR for %i steps", (steps) => {
    const params = SIR_PARAM_SETS[0]!;
    const handFrames = simulate(sir, params, { steps });
    const composedFrames = simulate(composedSir, params, { steps });
    expect(composedFrames.length).toBe(handFrames.length);
    for (let i = 0; i < handFrames.length; i += 1) {
      for (const key of ["susceptible", "infected", "recovered"] as const) {
        expect(composedFrames[i]!.state[key]).toBeCloseTo(handFrames[i]!.state[key], 10);
      }
    }
  });

  it("exposes infection and recovery fluxes with integrator fan-in on infected", () => {
    const params = SIR_PARAM_SETS[0]!;
    const frames = simulate(composedSir, params);
    const frameIndex = 80;
    const trace = explainField(composedSir, frames, frameIndex, "infected", params)!;

    const infectionFlux = findTraceTerm(trace.result, "infection_flux");
    const recoveryFlux = findTraceTerm(trace.result, "recovery_flux");
    const dIRate = findTraceTerm(trace.result, "dI_rate");

    expect(infectionFlux?.label).toBe("β·S·I/N");
    expect(recoveryFlux?.label).toBe("γ·I");
    expect(dIRate?.label).toBe("β·S·I/N − γ·I");
    expect(dIRate?.children?.map((c) => c.id)).toEqual(
      expect.arrayContaining(["infection_flux", "recovery_flux"]),
    );

    const integrateTerm = findTraceTerm(trace.result, "i_next");
    expect(integrateTerm?.children?.some((c) => c.id === "dI_rate")).toBe(true);
  });

  it("routes recovery flux directly into the recovered integrator", () => {
    const params = SIR_PARAM_SETS[0]!;
    const frames = simulate(composedSir, params);
    const trace = explainField(composedSir, frames, 80, "recovered", params)!;
    const recoveryFlux = findTraceTerm(trace.result, "recovery_flux");
    expect(recoveryFlux?.label).toBe("γ·I");
    expect(findTraceTerm(trace.result, "r_next")?.children?.some((c) => c.id === "recovery_flux")).toBe(
      true,
    );
  });
});

describe("wire resolution", () => {
  const lorenzExecutor = createComposedExecutor(lorenzComposedModel);

  it("throws MISSING_STATE instead of silently using 0", () => {
    expect(() =>
      lorenzExecutor.step({ y: 1, z: 1 }, PARAMS, 0.01),
    ).toThrow(WireResolutionError);
    try {
      lorenzExecutor.step({ y: 1, z: 1 }, PARAMS, 0.01);
    } catch (error) {
      expect(error).toBeInstanceOf(WireResolutionError);
      expect((error as WireResolutionError).code).toBe("MISSING_STATE");
      expect((error as WireResolutionError).path).toBe("state/x");
    }
  });

  it("throws MISSING_PARAMETER instead of silently using 0", () => {
    expect(() =>
      lorenzExecutor.step({ x: 1, y: 1, z: 1 }, { rho: 28, beta: 8 / 3 }, 0.01),
    ).toThrow(WireResolutionError);
    try {
      lorenzExecutor.step({ x: 1, y: 1, z: 1 }, { rho: 28, beta: 8 / 3 }, 0.01);
    } catch (error) {
      expect((error as WireResolutionError).code).toBe("MISSING_PARAMETER");
      expect((error as WireResolutionError).path).toBe("parameter/sigma");
    }
  });

  it("throws MISSING_PARAMETER when explain trace resolves parameters strictly", () => {
    const composedModel = lorenzExecutor.toModelDefinition({ renderer: "trajectory-3d" });
    const frames = simulate(lorenz, PARAMS);
    expect(() =>
      explainField(composedModel, frames, 42, "x", { rho: 28, beta: 8 / 3 }),
    ).toThrow(WireResolutionError);
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
