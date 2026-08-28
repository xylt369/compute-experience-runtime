import type { ComputeRuntime } from "@compute-experience/core";

export interface ModelChromeElements {
  modelName?: HTMLElement;
  modelDesc?: HTMLElement;
  modelId?: HTMLElement;
  stateCount?: HTMLElement;
  rendererPill?: HTMLElement;
}

export interface ModelChromeOptions {
  runtime: ComputeRuntime;
  elements: ModelChromeElements;
}

export interface ModelChrome {
  sync(): void;
  dispose(): void;
}

export function bindModelChrome(options: ModelChromeOptions): ModelChrome {
  const { runtime, elements } = options;

  const sync = () => {
    const { manifest } = runtime;
    elements.modelName && (elements.modelName.textContent = manifest.name);
    elements.modelDesc && (elements.modelDesc.textContent = manifest.description);
    elements.modelId && (elements.modelId.textContent = manifest.id);
    elements.rendererPill && (elements.rendererPill.textContent = manifest.renderer);
    const branchCount = runtime.comparisonRuns?.length ?? 0;
    elements.stateCount &&
      (elements.stateCount.textContent =
        branchCount > 0
          ? `${runtime.timeline.length} states · ${branchCount + 1} runs`
          : `${runtime.timeline.length} states`);
  };

  const unsubscribe = runtime.subscribe((event) => {
    if (
      event.type === "rebuild" ||
      event.type === "frame" ||
      event.type === "run-forked" ||
      event.type === "run-updated"
    ) {
      sync();
    }
  });

  sync();

  return {
    sync,
    dispose: () => unsubscribe(),
  };
}
