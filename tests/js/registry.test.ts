import { describe, expect, it } from "vitest";
import { RendererRegistry } from "@compute-experience/renderers";
import { createRendererRegistry } from "@compute-experience/renderers";
import { models } from "../../examples";
import { resolveRenderer } from "@compute-experience/core";

describe("RendererRegistry", () => {
  it("fails on an unknown renderer", () => {
    const registry = new RendererRegistry();
    expect(() => registry.get("missing-renderer")).toThrow(/Renderer not found/);
  });

  it("selects renderers from the manifest name, not the model id", () => {
    const registry = createRendererRegistry();
    expect(resolveRenderer(models["lorenz-attractor"]!.manifest, registry).id).toBe("trajectory-3d");
    expect(resolveRenderer(models["rossler-attractor"]!.manifest, registry).id).toBe("trajectory-3d");
    expect(resolveRenderer(models["simple-pendulum"]!.manifest, registry).id).toBe("pendulum-2d");
    expect(resolveRenderer(models["sir-epidemic"]!.manifest, registry).id).toBe("timeseries-2d");
    expect(resolveRenderer(models["lorenz-attractor"]!.manifest, registry)).not.toBe(
      resolveRenderer(models["sir-epidemic"]!.manifest, registry),
    );
  });

  it("rejects duplicate registration", () => {
    const registry = createRendererRegistry();
    expect(() => registry.register({ id: "trajectory-3d", mount() {}, unmount() {}, update() {} })).toThrow(
      /already registered/,
    );
  });
});
