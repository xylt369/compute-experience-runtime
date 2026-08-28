import { describe, expect, it } from "vitest";
import { composeExperience, createRuntime, defaultParameters, resolveExperience } from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { composeInteractions } from "@compute-experience/ui";
import { models } from "../../examples";
import { semanticDemo } from "../../examples/semantic-demo";

describe("composeInteractions", () => {
  it("binds trace + inspect for Lorenz without referencing profile", () => {
    const model = models["lorenz-attractor"]!;
    const contract = resolveExperience(model);
    const composition = composeExperience(contract);
    expect(composition.interactions.trace).toBe(true);

    const runtime = createRuntime({
      model,
      rendererRegistry: createRendererRegistry(),
      parameters: defaultParameters(model),
    });

    const recipe = document.createElement("div");
    const stage = document.createElement("div");
    const readout = document.createElement("div");
    const parameters = document.createElement("div");

    const handle = composeInteractions(runtime, {
      contract,
      composition,
      world: { stage, stateReadout: readout, recipe, parameters },
    });

    expect(handle.trace).toBeDefined();
    expect(handle.branch).toBeUndefined();
    expect(handle.mountHooks.onTrajectoryPick).toBeTypeOf("function");
    handle.dispose();
    runtime.unmount();
  });

  it("binds inspect-only readout for semantic demo without a profile", () => {
    const contract = resolveExperience(semanticDemo);
    const composition = composeExperience(contract);
    expect(contract.profile).toBeUndefined();
    expect(composition.interactions.inspect).toBe(true);
    expect(composition.interactions.trace).toBe(false);

    const runtime = createRuntime({
      model: semanticDemo,
      rendererRegistry: createRendererRegistry(),
      parameters: defaultParameters(semanticDemo),
    });

    const stage = document.createElement("div");
    const readout = document.createElement("div");

    const handle = composeInteractions(runtime, {
      contract,
      composition,
      world: { stage, stateReadout: readout },
    });

    expect(handle.trace).toBeUndefined();
    expect(handle.branch).toBeUndefined();
    expect(handle.mountHooks.onTrajectoryPick).toBeUndefined();
    handle.dispose();
    runtime.unmount();
  });

  it("binds branch panel for SIR from fork + compare capabilities", () => {
    const model = models["sir-epidemic"]!;
    const contract = resolveExperience(model);
    const composition = composeExperience(contract);

    const runtime = createRuntime({
      model,
      rendererRegistry: createRendererRegistry(),
      parameters: defaultParameters(model),
    });

    const panel = document.createElement("div");
    const timeline = document.createElement("div");
    const scrub = document.createElement("input");

    const handle = composeInteractions(runtime, {
      contract,
      composition,
      branch: { panel, timeline, scrub },
    });

    expect(handle.branch).toBeDefined();
    expect(handle.trace).toBeUndefined();
    handle.dispose();
    runtime.unmount();
  });
});
