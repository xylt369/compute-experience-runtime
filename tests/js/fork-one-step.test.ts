import { describe, expect, it } from "vitest";
import {
  composeExperience,
  createRuntime,
  defaultParameters,
  resolveExperience,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { bindCounterfactualUI, composeInteractions, type InterventionConfig } from "@compute-experience/ui";
import { models } from "../../examples";

describe("one-step fork interaction", () => {
  it("select point → fork → adjust one target → continue from seam", () => {
    const model = models["sir-epidemic"]!;
    const contract = resolveExperience(model);
    const composition = composeExperience(contract);
    const runtime = createRuntime({
      model,
      rendererRegistry: createRendererRegistry(),
      parameters: defaultParameters(model),
      syncPlayback: true,
    });
    runtime.rebuild();

    const panel = document.createElement("div");
    const timeline = document.createElement("div");
    const scrub = document.createElement("input");

    const handle = bindCounterfactualUI({
      runtime,
      elements: { panel, timeline, scrub },
      intervention: contract.options?.intervention as InterventionConfig | undefined,
    });

    runtime.pause();
    runtime.seekIndex(60);
    expect(handle.beginForkAtCursor()).toBe(true);
    expect(runtime.comparisonRuns.length).toBe(1);

    const branch = runtime.comparisonRuns[0]!;
    expect(branch.forkPoint?.index).toBe(60);
    expect(branch.parameters.interventionStartDay).toBe(10);
    expect(runtime.primaryRun.parameters.interventionStartDay).toBe(20);
    expect(panel.querySelector(".fork-seam")).toBeTruthy();
    expect(panel.querySelector(".fork-continue")).toBeTruthy();

    handle.applyIntervention(5);
    expect(branch.parameters.interventionStartDay).toBe(5);
    expect(runtime.primaryRun.parameters.interventionStartDay).toBe(20);

    handle.continueFromFork();
    expect(runtime.isPlaying()).toBe(true);
    expect(runtime.currentIndex()).toBe(60);
    expect(panel.hidden).toBe(true);

    handle.dispose();
    runtime.unmount();
  });

  it("composeInteractions exposes the same one-step fork handle for SIR", () => {
    const model = models["sir-epidemic"]!;
    const contract = resolveExperience(model);
    const composition = composeExperience(contract);
    const runtime = createRuntime({
      model,
      rendererRegistry: createRendererRegistry(),
      parameters: defaultParameters(model),
      syncPlayback: true,
    });
    runtime.rebuild();

    const panel = document.createElement("div");
    const timeline = document.createElement("div");
    const scrub = document.createElement("input");

    const handle = composeInteractions(runtime, {
      contract,
      composition,
      branch: { panel, timeline, scrub },
    });

    runtime.seekIndex(45);
    expect(handle.branch?.beginForkAtCursor()).toBe(true);
    handle.branch?.applyIntervention(8);
    expect(runtime.comparisonRuns[0]!.parameters.interventionStartDay).toBe(8);
    handle.branch?.continueFromFork();
    expect(runtime.isPlaying()).toBe(true);

    handle.dispose();
    runtime.unmount();
  });
});
