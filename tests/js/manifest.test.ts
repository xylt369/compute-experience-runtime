import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import schema from "../../packages/core/src/protocol/manifest-schema.json";
import { modelList } from "../../examples";
import appSource from "../../playground/src/app.ts?raw";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

describe("JS model manifests", () => {
  it("validates all four demo models against the authoring schema", () => {
    expect(modelList).toHaveLength(4);
    for (const model of modelList) {
      const ok = validate(model.manifest);
      expect(ok, JSON.stringify(validate.errors)).toBe(true);
      expect(model.manifest.renderer).toBeTruthy();
      expect(model.initial).toBeTypeOf("function");
      expect(model.step).toBeTypeOf("function");
    }
  });

  it("covers the four intended models and three renderers", () => {
    const ids = modelList.map((model) => model.manifest.id).sort();
    expect(ids).toEqual(["lorenz-attractor", "rossler-attractor", "simple-pendulum", "sir-epidemic"].sort());
    const renderers = new Set(modelList.map((model) => model.manifest.renderer));
    expect(renderers).toEqual(new Set(["trajectory-3d", "pendulum-2d", "timeseries-2d"]));
  });

  it("does not branch the playground shell on model ids", () => {
    expect(appSource).not.toMatch(/modelId\s*===\s*['"`]/);
    expect(appSource).not.toMatch(/currentId\s*===\s*['"`]/);
    expect(appSource).not.toMatch(/if\s*\(\s*model\.manifest\.id/);
    expect(appSource).toMatch(/createRuntime\(/);
  });
});
