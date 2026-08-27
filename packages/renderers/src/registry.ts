import type { ModelFrame, ModelManifest, RuntimeRenderer } from "@compute-experience/core";

export class RendererRegistry<Frame = ModelFrame, Manifest = ModelManifest> {
  private readonly renderers = new Map<string, RuntimeRenderer<Frame, Manifest>>();

  register(renderer: RuntimeRenderer<Frame, Manifest>): void {
    if (this.renderers.has(renderer.id)) {
      throw new Error(`Renderer already registered: ${renderer.id}`);
    }
    this.renderers.set(renderer.id, renderer);
  }

  get(id: string): RuntimeRenderer<Frame, Manifest> {
    const renderer = this.renderers.get(id);
    if (!renderer) throw new Error(`Renderer not found: ${id}`);
    return renderer;
  }

  has(id: string): boolean {
    return this.renderers.has(id);
  }
}
