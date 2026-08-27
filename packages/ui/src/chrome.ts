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
    elements.rendererPill && (elements.rendererPill.textContent = `renderer: ${manifest.renderer}`);
    elements.stateCount &&
      (elements.stateCount.textContent = `${runtime.timeline.length} states`);
  };

  const unsubscribe = runtime.subscribe((event) => {
    if (event.type === "rebuild" || event.type === "frame") sync();
  });

  sync();

  return {
    sync,
    dispose: () => unsubscribe(),
  };
}
