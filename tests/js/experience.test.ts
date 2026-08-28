import { describe, expect, it } from "vitest";
import { experienceMatrix, resolveExperience } from "@compute-experience/core";
import { models } from "../../examples";

describe("experience contract", () => {
  it("resolves Lorenz as computational microscope with full trace capabilities", () => {
    const contract = resolveExperience(models["lorenz-attractor"]!);
    expect(contract.profile).toBe("microscope");
    expect(contract.world).toBe("trajectory-3d");
    expect(contract.capabilities.inspect).toBe(true);
    expect(contract.capabilities.trace).toBe(true);
    expect(contract.capabilities.intervene).toBe(true);
    expect(contract.capabilities.replay).toBe(true);
    expect(contract.targets).toEqual(["x", "y", "z"]);
    expect(contract.options?.autoPlay).toBe(true);
  });

  it("resolves SIR as counterfactual epidemic experience", () => {
    const contract = resolveExperience(models["sir-epidemic"]!);
    expect(contract.profile).toBe("counterfactual");
    expect(contract.world).toBe("timeseries-2d");
    expect(contract.capabilities.fork).toBe(true);
    expect(contract.capabilities.compare).toBe(true);
    expect(contract.capabilities.trace).toBe(false);
    expect(contract.options?.intervention?.mode).toBe("parameter");
    expect(contract.options?.intervention?.parameterId).toBe("interventionStartDay");
  });

  it("resolves pendulum as physical instrument", () => {
    const contract = resolveExperience(models["simple-pendulum"]!);
    expect(contract.profile).toBe("instrument");
    expect(contract.world).toBe("pendulum-2d");
    expect(contract.capabilities.intervene).toBe(true);
    expect(contract.capabilities.trace).toBe(false);
  });

  it("resolves rossler as lighter instrument with fork capability", () => {
    const contract = resolveExperience(models["rossler-attractor"]!);
    expect(contract.profile).toBe("instrument");
    expect(contract.world).toBe("trajectory-3d");
    expect(contract.capabilities.fork).toBe(true);
    expect(contract.capabilities.intervene).toBe(false);
  });

  it("resolves custom model as manifest playground", () => {
    const contract = resolveExperience(models["custom-logistic-growth"]!);
    expect(contract.profile).toBe("manifest");
    expect(contract.capabilities.inspect).toBe(false);
  });

  it("builds a capability matrix for all built-in models", () => {
    const matrix = experienceMatrix(models);
    expect(Object.keys(matrix)).toHaveLength(Object.keys(models).length);
    expect(matrix["lorenz-attractor"]?.profile).toBe("microscope");
    expect(matrix["sir-epidemic"]?.profile).toBe("counterfactual");
  });
});
