import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createRuntime,
  defaultParameters,
  simulate,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { customModel } from "../../examples/custom-model";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelSource = readFileSync(resolve(root, "examples/custom-model/model.ts"), "utf8");

describe("custom-model third-party authoring", () => {
  it("contains only model protocol surface — no UI imports", () => {
    expect(modelSource).toMatch(/defineModel\(/);
    expect(modelSource).toMatch(/initial\(/);
    expect(modelSource).toMatch(/step\(/);
    expect(modelSource).toMatch(/derive\(/);
    expect(modelSource).not.toMatch(/@compute-experience\/ui/);
    expect(modelSource).not.toMatch(/@compute-experience\/renderers/);
    expect(modelSource).not.toMatch(/document\.|HTMLElement|createElement|mountExperienceUI/);
    expect(modelSource).not.toMatch(/slider|timeline|snapshot|play\(|pause\(/i);
  });

  it("approaches carrying capacity under default parameters", () => {
    const params = defaultParameters(customModel);
    const frames = simulate(customModel, params);
    const last = frames.at(-1)!;
    expect(last.state.population).toBeGreaterThan(params.initialPopulation);
    expect(last.state.population).toBeLessThanOrEqual(params.carryingCapacity * 1.01);
    expect(last.derived?.saturation).toBeGreaterThan(0.5);
  });

  it("runs through createRuntime without any model-specific UI", () => {
    const runtime = createRuntime({
      model: customModel,
      rendererRegistry: createRendererRegistry(),
    });
    runtime.rebuild();
    expect(runtime.manifest.id).toBe("custom-logistic-growth");
    expect(runtime.timeline.length).toBeGreaterThan(0);
    const snap = runtime.snapshot(false);
    expect(snap.model).toBe("custom-logistic-growth");
    expect(snap.params.growthRate).toBeDefined();
  });
});
