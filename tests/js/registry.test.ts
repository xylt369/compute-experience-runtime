import { describe, expect, it } from "vitest";
import { RendererRegistry, rendererFor } from "../../runtime/renderer.registry";
import { models } from "../../web/src/models";
import { createRendererRegistry } from "../../web/src/renderers/register";

describe("RendererRegistry", () => {
  it("fails on an unknown renderer", () => {
    const registry = new RendererRegistry();
    expect(() => registry.get("missing-renderer")).toThrow(/Renderer not found/);
  });

  it("selects renderers from the manifest name, not the model id", () => {
    const registry = createRendererRegistry();
    expect(rendererFor(models["lorenz-attractor"]!.manifest, registry).id).toBe("trajectory-3d");
    expect(rendererFor(models["rossler-attractor"]!.manifest, registry).id).toBe("trajectory-3d");
    expect(rendererFor(models["simple-pendulum"]!.manifest, registry).id).toBe("pendulum-2d");
    expect(rendererFor(models["sir-epidemic"]!.manifest, registry).id).toBe("timeseries-2d");
    expect(rendererFor(models["lorenz-attractor"]!.manifest, registry)).not.toBe(
      rendererFor(models["sir-epidemic"]!.manifest, registry),
    );
  });

  it("rejects duplicate registration", () => {
    const registry = createRendererRegistry();
    expect(() => registry.register({ id: "trajectory-3d", mount() {}, unmount() {}, update() {} })).toThrow(
      /already registered/,
    );
  });
});
