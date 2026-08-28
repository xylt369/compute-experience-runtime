import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import schema from "../../packages/core/src/protocol/manifest-schema.json";
import { modelList } from "../../examples";
import appSource from "../../playground/src/app.ts?raw";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

describe("JS model manifests", () => {
  it("validates all catalog models against the authoring schema", () => {
    expect(modelList.length).toBeGreaterThanOrEqual(6);
    for (const model of modelList) {
      const ok = validate(model.manifest);
      expect(ok, JSON.stringify(validate.errors)).toBe(true);
      expect(model.manifest.renderer).toBeTruthy();
      expect(model.initial).toBeTypeOf("function");
      expect(model.step).toBeTypeOf("function");
    }
  });

  it("covers built-in models, the third-party custom-model, and three renderers", () => {
    const ids = modelList.map((model) => model.manifest.id).sort();
    expect(ids).toEqual(
      [
        "custom-logistic-growth",
        "lorenz-attractor",
        "rossler-attractor",
        "semantic-demo",
        "simple-pendulum",
        "sir-epidemic",
      ].sort(),
    );
    const renderers = new Set(modelList.map((model) => model.manifest.renderer));
    expect(renderers).toEqual(new Set(["trajectory-3d", "pendulum-2d", "timeseries-2d"]));
  });

  it("does not branch the playground shell on model ids", () => {
    expect(appSource).not.toMatch(/modelId\s*===\s*['"`]/);
    expect(appSource).not.toMatch(/currentId\s*===\s*['"`]/);
    expect(appSource).not.toMatch(/if\s*\(\s*model\.manifest\.id/);
    expect(appSource).toMatch(/mountExperienceUI\(/);
    expect(appSource).not.toMatch(/renderParams|renderMetrics|formatMetricValue/);
  });
});
