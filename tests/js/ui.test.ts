import { describe, expect, it } from "vitest";
import { defineModel } from "@compute-experience/core";
import { formatParameterValue, parameterDigits } from "@compute-experience/ui";

describe("manifest-driven parameter formatting", () => {
  it("formats numeric parameters with units and precision", () => {
    const parameter = {
      id: "rate",
      label: "Rate",
      type: "number" as const,
      default: 1,
      min: 0,
      max: 5,
      step: 0.1,
      unit: "Hz",
    };
    expect(parameterDigits(parameter)).toBe(1);
    expect(formatParameterValue(parameter, 2.34)).toBe("2.3 Hz");
  });

  it("formats boolean and enum parameters", () => {
    expect(
      formatParameterValue(
        { id: "on", label: "On", type: "boolean", default: true },
        1,
      ),
    ).toBe("on");
    expect(
      formatParameterValue(
        {
          id: "mode",
          label: "Mode",
          type: "enum",
          default: "slow",
          options: ["slow", "fast"],
        },
        1,
      ),
    ).toBe("fast");
  });
});

describe("defineModel with extended parameter types", () => {
  it("accepts boolean and enum manifest fields", () => {
    const model = defineModel({
      manifest: {
        id: "typed-params",
        name: "Typed",
        description: "test",
        version: "0.1.0",
        renderer: "timeseries-2d",
        parameters: [
          { id: "enabled", label: "Enabled", type: "boolean", default: true },
          {
            id: "mode",
            label: "Mode",
            type: "enum",
            default: "a",
            options: ["a", "b"],
          },
        ],
        state: ["x"],
      },
      initial: () => ({ x: 0 }),
      step: (state) => state,
    });
    expect(model.manifest.parameters).toHaveLength(2);
  });
});
