import {
  createRuntime,
  defaultParameters,
  resolveExperience,
  type ComputeRuntime,
  type ModelDefinition,
  type ModelFrame,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { mountExperienceUI, type ExperienceHandle } from "./experience";

export interface EmbedExperienceOptions {
  model: ModelDefinition;
  parameters?: Record<string, number>;
  counterfactual?: boolean;
  theme?: "light" | "dark";
  autostart?: boolean;
  showChrome?: boolean;
  onFrame?: (frame: ModelFrame) => void;
  onFork?: (forkTime: number) => void;
}

export interface EmbedExperienceHandle {
  readonly runtime: ComputeRuntime;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(time: number): void;
  seekIndex(index: number): void;
  fork(time?: number, intervention?: { field: string; delta: number }): void;
  setParameters(params: Record<string, number>): void;
  destroy(): void;
}

const defaultRegistry = createRendererRegistry();

/**
 * Universal 1-line embedding API for Compute Experience simulations.
 * Embeds a full interactive simulation canvas into any target DOM element.
 */
export function mountExperience(
  target: HTMLElement | string,
  options: EmbedExperienceOptions,
): EmbedExperienceHandle {
  const container = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
  if (!container) throw new Error(`mountExperience: target element not found`);

  container.classList.add("cx-embed-host");
  if (options.theme === "dark") container.classList.add("cx-dark");

  const model = options.model;
  const runtime = createRuntime({
    model,
    rendererRegistry: defaultRegistry,
    parameters: options.parameters ?? defaultParameters(model),
    syncPlayback: true,
  });

  // Create inner DOM structure
  const viewport = document.createElement("div");
  viewport.className = "cx-embed-viewport";
  viewport.style.position = "relative";
  viewport.style.width = "100%";
  viewport.style.height = "100%";
  viewport.style.minHeight = "320px";
  container.appendChild(viewport);

  const overlay = document.createElement("div");
  overlay.className = "renderer-overlay";
  viewport.appendChild(overlay);

  const contract = resolveExperience(model);

  const experience: ExperienceHandle = mountExperienceUI({
    runtime,
    contract,
    elements: {
      viewport,
      overlay,
    },
  });

  if (options.onFrame) {
    runtime.subscribe((event) => {
      if (event.type === "frame") {
        const f = runtime.currentFrame();
        if (f) options.onFrame!(f);
      }
    });
  }

  if (options.autostart) {
    runtime.play();
  }

  return {
    runtime,
    play: () => runtime.play(),
    pause: () => runtime.pause(),
    toggle: () => runtime.toggle(),
    seek: (t: number) => runtime.seek(t),
    seekIndex: (idx: number) => runtime.seekIndex(idx),
    fork: (time?: number, intervention?: { field: string; delta: number }) => {
      runtime.pause();
      if (time !== undefined) {
        runtime.forkAtTime(time);
      } else {
        runtime.forkAt(runtime.currentIndex());
      }
      if (intervention) {
        const branch = runtime.comparisonRuns[0];
        if (branch && branch.forkPoint) {
          const forkFrame = branch.timeline.frames[branch.forkPoint.index];
          if (forkFrame) {
            branch.setForkState({
              ...forkFrame.state,
              [intervention.field]: (forkFrame.state[intervention.field] ?? 0) + intervention.delta,
            });
          }
        }
      }
      options.onFork?.(runtime.currentFrame()?.t ?? 0);
    },
    setParameters: (p: Record<string, number>) => runtime.setParameters(p),
    destroy: () => {
      experience.dispose();
      container.replaceChildren();
      container.classList.remove("cx-embed-host", "cx-dark");
    },
  };
}
