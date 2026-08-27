import type { ComputeRuntime } from "@compute-experience/core";
import { bindModelChrome, type ModelChromeElements } from "./chrome";
import { bindMetricsPanel } from "./metrics";
import { bindParameterPanel } from "./params";
import { bindTransportBar, type TransportBarElements } from "./transport";

export interface ExperienceElements extends ModelChromeElements {
  params?: HTMLElement;
  metrics?: HTMLElement;
  viewport: HTMLElement;
  overlay?: HTMLElement;
  play?: HTMLButtonElement;
  scrub?: HTMLInputElement;
  time?: HTMLElement;
}

export interface MountExperienceOptions {
  runtime: ComputeRuntime;
  elements: ExperienceElements;
}

export interface ExperienceHandle {
  sync(): void;
  dispose(): void;
}

export function mountExperienceUI(options: MountExperienceOptions): ExperienceHandle {
  const { runtime, elements } = options;
  const disposers: Array<() => void> = [];

  if (elements.params) {
    disposers.push(bindParameterPanel({ root: elements.params, runtime }).dispose);
  }
  if (elements.metrics) {
    disposers.push(bindMetricsPanel({ root: elements.metrics, runtime }).dispose);
  }

  const chrome = bindModelChrome({ runtime, elements });
  disposers.push(chrome.dispose);

  let transport: { sync(): void; dispose(): void } | null = null;
  if (elements.play && elements.scrub && elements.time) {
    transport = bindTransportBar({
      runtime,
      elements: {
        play: elements.play,
        scrub: elements.scrub,
        time: elements.time,
      } satisfies TransportBarElements,
    });
    disposers.push(transport.dispose);
  }

  runtime.mount({ viewport: elements.viewport, overlay: elements.overlay });

  return {
    sync() {
      chrome.sync();
      transport?.sync();
    },
    dispose() {
      for (const dispose of disposers) dispose();
      runtime.unmount();
    },
  };
}
