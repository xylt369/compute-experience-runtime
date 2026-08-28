import { describe, expect, it } from "vitest";
import {
  composeExperience,
  experienceMatrix,
  inspectableTargets,
  resolveExperience,
} from "@compute-experience/core";
import { models } from "../../examples";
import { semanticDemo } from "../../examples/semantic-demo";

describe("experience contract", () => {
  it("resolves Lorenz with structured targets and trace-lens composition", () => {
    const contract = resolveExperience(models["lorenz-attractor"]!);
    expect(contract.profile).toBe("microscope");
    expect(contract.world).toBe("trajectory-3d");
    expect(contract.capabilities.trace).toBe(true);
    expect(contract.targets).toHaveLength(6);
    expect(contract.targets[0]).toMatchObject({ id: "x", kind: "state", traceable: true });
    const composition = composeExperience(contract);
    expect(composition.traceLens).toBe(true);
    expect(composition.branchPanel).toBe(false);
    expect(composition.manifestPanel).toBe(false);
  });

  it("resolves SIR via branch-panel composition (not trace lens)", () => {
    const contract = resolveExperience(models["sir-epidemic"]!);
    expect(contract.world).toBe("timeseries-2d");
    expect(contract.capabilities.fork).toBe(true);
    expect(contract.capabilities.trace).toBe(false);
    expect(contract.targets.some((t) => t.id === "interventionStartDay")).toBe(true);
    const composition = composeExperience(contract);
    expect(composition.branchPanel).toBe(true);
    expect(composition.traceLens).toBe(false);
    expect(composition.worldReadout).toBe(false);
  });

  it("resolves pendulum as world readout without trace lens", () => {
    const contract = resolveExperience(models["simple-pendulum"]!);
    expect(contract.world).toBe("pendulum-2d");
    const composition = composeExperience(contract);
    expect(composition.traceLens).toBe(false);
    expect(composition.worldReadout).toBe(true);
    expect(inspectableTargets(contract).map((t) => t.id)).toContain("angle");
  });

  it("resolves rossler with fork capability and world readout", () => {
    const contract = resolveExperience(models["rossler-attractor"]!);
    expect(contract.capabilities.fork).toBe(true);
    expect(contract.capabilities.intervene).toBe(false);
    const composition = composeExperience(contract);
    expect(composition.traceLens).toBe(false);
    expect(composition.worldReadout).toBe(true);
  });

  it("resolves custom model as manifest panel", () => {
    const contract = resolveExperience(models["custom-logistic-growth"]!);
    const composition = composeExperience(contract);
    expect(composition.manifestPanel).toBe(true);
    expect(composition.worldShell).toBe(false);
  });

  it("allows semantic-only model without profile preset", () => {
    const contract = resolveExperience(semanticDemo);
    expect(contract.profile).toBeUndefined();
    expect(contract.capabilities.inspect).toBe(true);
    expect(contract.capabilities.trace).toBe(false);
    const composition = composeExperience(contract);
    expect(composition.traceLens).toBe(false);
    expect(composition.branchPanel).toBe(false);
    expect(composition.worldReadout).toBe(true);
    expect(composition.manifestPanel).toBe(false);
    expect(contract.targets[0]).toMatchObject({ id: "signal", kind: "state", inspectable: true });
  });

  it("builds capability matrix with composition for all models", () => {
    const matrix = experienceMatrix(models);
    expect(Object.keys(matrix)).toHaveLength(Object.keys(models).length);
    expect(matrix["lorenz-attractor"]?.composition.traceLens).toBe(true);
    expect(matrix["sir-epidemic"]?.composition.branchPanel).toBe(true);
    expect(matrix["semantic-demo"]?.composition.worldReadout).toBe(true);
  });
});

describe("composeExperience semantics", () => {
  it("derives trace lens from inspect + trace capabilities", () => {
    const contract = resolveExperience(models["lorenz-attractor"]!);
    expect(composeExperience(contract).traceLens).toBe(true);
  });

  it("derives interaction primitives from capabilities", () => {
    const lorenz = composeExperience(resolveExperience(models["lorenz-attractor"]!));
    expect(lorenz.interactions).toMatchObject({
      inspect: true,
      trace: true,
      intervene: true,
      hold: true,
    });

    const sir = composeExperience(resolveExperience(models["sir-epidemic"]!));
    expect(sir.interactions.trace).toBe(false);
    expect(sir.interactions.fork).toBe(true);
    expect(sir.interactions.compare).toBe(true);

    const demo = composeExperience(resolveExperience(semanticDemo));
    expect(demo.interactions).toMatchObject({
      inspect: true,
      trace: false,
      intervene: false,
      hold: true,
    });
  });
});
