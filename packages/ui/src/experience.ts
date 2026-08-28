import type { ComputeRuntime } from "@compute-experience/core";
import { bindModelChrome, type ModelChromeElements } from "./chrome";
import { bindCounterfactualUI, type CounterfactualElements, type CounterfactualHandle, type InterventionConfig } from "./counterfactual";
import { bindInspectorUI, type InspectorElements, type InspectorHandle } from "./inspector";
import { bindMicroscopeUI, type MicroscopeElements, type MicroscopeHandle } from "./microscope";
import { bindMetricsPanel } from "./metrics";
import { bindParameterPanel } from "./params";
import { bindTransportBar, type TransportBarElements } from "./transport";

export interface ExperienceElements extends ModelChromeElements {
  params?: HTMLElement;
  metrics?: HTMLElement;
  counterfactual?: CounterfactualElements;
  inspector?: InspectorElements;
  microscope?: MicroscopeElements;
  viewport: HTMLElement;
  overlay?: HTMLElement;
  play?: HTMLButtonElement;
  scrub?: HTMLInputElement;
  time?: HTMLElement;
}

export interface MountExperienceOptions {
  runtime: ComputeRuntime;
  elements: ExperienceElements;
  /** When true, hide generic metrics and use counterfactual panel instead. */
  counterfactualMode?: boolean;
  /** When true, use computational inspector (trace / intervene / replay). */
  inspectorMode?: boolean;
  /** When true, use in-world computational microscope (Lorenz). */
  microscopeMode?: boolean;
  /** @deprecated Use intervention */
  perturbField?: string;
  intervention?: InterventionConfig;
  showOutcomes?: boolean;
  onInspectorFocus?: () => void;
  onInspectionAnchor?: (point: { x: number; y: number } | null) => void;
}

export interface ExperienceHandle {
  sync(): void;
  dispose(): void;
  counterfactual?: CounterfactualHandle;
  inspector?: InspectorHandle;
  microscope?: MicroscopeHandle;
}

export function mountExperienceUI(options: MountExperienceOptions): ExperienceHandle {
  const { runtime, elements } = options;
  const disposers: Array<() => void> = [];
  let counterfactual: CounterfactualHandle | undefined;
  let inspector: InspectorHandle | undefined;
  let microscope: MicroscopeHandle | undefined;

  if (elements.params) {
    disposers.push(bindParameterPanel({ root: elements.params, runtime }).dispose);
  }
  if (options.microscopeMode && elements.microscope) {
    microscope = bindMicroscopeUI({
      runtime,
      elements: elements.microscope,
      onAnchor: options.onInspectionAnchor,
    });
    disposers.push(microscope.dispose);
  } else if (options.inspectorMode && elements.inspector) {
    inspector = bindInspectorUI({
      runtime,
      elements: elements.inspector,
      onFocus: options.onInspectorFocus,
    });
    disposers.push(inspector.dispose);
  } else if (options.counterfactualMode && elements.counterfactual) {
    counterfactual = bindCounterfactualUI({
      runtime,
      elements: elements.counterfactual,
      perturbField: options.perturbField,
      intervention: options.intervention,
      showOutcomes: options.showOutcomes,
    });
    disposers.push(counterfactual.dispose);
  } else if (elements.metrics) {
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

  runtime.mount({
    viewport: elements.viewport,
    overlay: elements.overlay,
    onInspectionAnchor: (point) => {
      options.onInspectionAnchor?.(point);
      microscope?.setAnchor(point);
    },
    onTrajectoryPick: (pick) => {
      microscope?.handleTrajectoryPick(pick);
    },
  });

  return {
    sync() {
      chrome.sync();
      transport?.sync();
      counterfactual?.sync();
      inspector?.sync();
      microscope?.sync();
    },
    dispose() {
      for (const dispose of disposers) dispose();
      runtime.unmount();
    },
    counterfactual,
    inspector,
    microscope,
  };
}
