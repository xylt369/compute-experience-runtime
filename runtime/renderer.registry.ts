import type { ModelFrame, ModelManifest } from "./model.schema";

export interface RendererMountOptions {
  overlay?: HTMLElement;
  onParams?: (params: Record<string, number>) => void;
  onInitialState?: (state: Record<string, number>) => void;
}

export interface RendererView<Frame = ModelFrame, Manifest = ModelManifest> {
  frame: Frame;
  frames: Frame[];
  cursor: number;
  trail: number;
  manifest: Manifest;
}

export interface RuntimeRenderer<Frame = ModelFrame, Manifest = ModelManifest> {
  readonly id: string;
  mount(target: HTMLElement, options?: RendererMountOptions): void;
  unmount(): void;
  update(view: RendererView<Frame, Manifest>): void;
  resize?(): void;
}

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

export function rendererFor<Frame, Manifest extends { renderer: string }>(
  manifest: Manifest,
  registry: RendererRegistry<Frame, Manifest>,
): RuntimeRenderer<Frame, Manifest> {
  return registry.get(manifest.renderer);
}
