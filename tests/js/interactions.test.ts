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

  it("binds trace lens for Lorenz without branch panel or state readout chrome", () => {
    const model = models["lorenz-attractor"]!;
    const contract = resolveExperience(model);
    const composition = composeExperience(contract);
    expect(composition.traceLens).toBe(true);
    expect(composition.branchPanel).toBe(false);
    expect(composition.worldReadout).toBe(false);

    const runtime = createRuntime({
      model,
      rendererRegistry: createRendererRegistry(),
      parameters: defaultParameters(model),
    });
    runtime.rebuild();

    const recipe = document.createElement("div");
    const stage = document.createElement("div");
    stage.getBoundingClientRect = () =>
      ({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600 }) as DOMRect;

    const handle = composeInteractions(runtime, {
      contract,
      composition,
      world: { stage, stateReadout: document.createElement("div"), recipe, hint: document.createElement("div") },
    });

    expect(handle.trace).toBeDefined();
    expect(handle.branch).toBeUndefined();
    runtime.pause();
    runtime.seekIndex(40);
    handle.trace!.handleTrajectoryPick({ frameIndex: 40, screen: { x: 320, y: 240 } });
    expect(recipe.querySelector(".micro-recipe-kicker")?.textContent).toBe("Why here?");
    expect(recipe.querySelector(".micro-hint")?.textContent).toMatch(/Follow a contributing value/i);

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
