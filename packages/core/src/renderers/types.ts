import type { RunComparison } from "../compare";
import type { ModelFrame, ModelManifest } from "../protocol/types";

export interface RendererMountOptions {
  overlay?: HTMLElement;
  onParams?: (params: Record<string, number>) => void;
  onInitialState?: (state: Record<string, number>) => void;
}

/** Optional multi-run view for comparison-capable renderers. */
export interface RunRenderView<Frame = ModelFrame> {
  id: string;
  label?: string;
  role?: "original" | "counterfactual" | string;
  frame: Frame;
  frames: readonly Frame[];
  cursor: number;
  params: Record<string, number>;
  isPrimary: boolean;
  forkIndex?: number;
  forkTime?: number;
}

export interface RendererView<Frame = ModelFrame, Manifest = ModelManifest> {
  frame: Frame;
  frames: readonly Frame[];
  cursor: number;
  trail: number;
  manifest: Manifest;
  params: Record<string, number>;
  /** Present when the runtime is comparing multiple runs. */
  primaryRun?: RunRenderView<Frame>;
  comparisonRuns?: RunRenderView<Frame>[];
  comparison?: RunComparison | null;
  syncTime?: number;
  /** In-place reshape metadata for propagation visualization. */
  reshape?: {
    frameIndex: number;
    field: string;
    priorFrames: readonly Frame[];
    generation: number;
  };
  /** Active computational inspection focus for trajectory highlighting. */
  inspection?: {
    frameIndex: number;
    field: string;
    highlightFrameIndex: number;
  };
}

export interface RuntimeRenderer<Frame = ModelFrame, Manifest = ModelManifest> {
  readonly id: string;
  mount(target: HTMLElement, options?: RendererMountOptions): void;
  unmount(): void;
  update(view: RendererView<Frame, Manifest>): void;
  resize?(): void;
}

export interface RendererRegistry<Frame = ModelFrame, Manifest = ModelManifest> {
  register(renderer: RuntimeRenderer<Frame, Manifest>): void;
  get(id: string): RuntimeRenderer<Frame, Manifest>;
  has(id: string): boolean;
}

export function resolveRenderer<Frame, Manifest extends { renderer: string }>(
  manifest: Manifest,
  registry: RendererRegistry<Frame, Manifest>,
): RuntimeRenderer<Frame, Manifest> {
  return registry.get(manifest.renderer);
}

/** @deprecated Use resolveRenderer */
export const rendererFor = resolveRenderer;
