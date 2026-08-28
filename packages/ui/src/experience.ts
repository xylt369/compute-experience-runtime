import type { ComputeRuntime, ExperienceContract } from "@compute-experience/core";
import { bindModelChrome, type ModelChromeElements } from "./chrome";
import {
  bindCounterfactualUI,
  type CounterfactualElements,
  type CounterfactualHandle,
  type InterventionConfig,
} from "./counterfactual";
import { bindInspectorUI, type InspectorElements, type InspectorHandle } from "./inspector";
import { bindInstrumentUI, type InstrumentElements, type InstrumentHandle } from "./instrument";
import { bindMicroscopeUI, type MicroscopeElements, type MicroscopeHandle } from "./microscope";
import { bindMetricsPanel } from "./metrics";
import { bindParameterPanel } from "./params";
import { bindTransportBar, type TransportBarElements } from "./transport";

export interface WorldElements {
  stage: HTMLElement;
  stateReadout: HTMLElement;
  parameters?: HTMLElement;
  recipe?: HTMLElement;
  restore?: HTMLButtonElement;
  panel?: HTMLElement;
}

export interface ExperienceElements extends ModelChromeElements {
  params?: HTMLElement;
  metrics?: HTMLElement;
  world?: WorldElements;
  counterfactual?: CounterfactualElements;
  /** @deprecated Use world + contract */
  inspector?: InspectorElements;
  viewport: HTMLElement;
  overlay?: HTMLElement;
  play?: HTMLButtonElement;
  scrub?: HTMLInputElement;
  time?: HTMLElement;
}

export interface MountExperienceOptions {
  runtime: ComputeRuntime;
  contract: ExperienceContract;
  elements: ExperienceElements;
  /** @deprecated Use contract */
  counterfactualMode?: boolean;
  inspectorMode?: boolean;
  microscopeMode?: boolean;
  perturbField?: string;
  intervention?: InterventionConfig;
  showOutcomes?: boolean;
  onInspectorFocus?: () => void;
  onInspectionAnchor?: (point: { x: number; y: number } | null) => void;
}

export interface ExperienceHandle {
  sync(): void;
  dispose(): void;
  contract: ExperienceContract;
  counterfactual?: CounterfactualHandle;
  inspector?: InspectorHandle;
  microscope?: MicroscopeHandle;
  instrument?: InstrumentHandle;
}

function interventionFromContract(contract: ExperienceContract): InterventionConfig | undefined {
  const raw = contract.options?.intervention;
  if (!raw) return undefined;
  if (raw.mode === "parameter" && raw.parameterId != null && raw.forkValue != null) {
    return {
      mode: "parameter",
      parameterId: raw.parameterId,
      forkValue: raw.forkValue,
      label: raw.label,
    };
  }
  if (raw.mode === "state" && raw.perturbField) {
    return {
      mode: "state",
      perturbField: raw.perturbField,
      defaultEpsilon: raw.defaultEpsilon,
    };
  }
  return undefined;
}

export function mountExperienceUI(options: MountExperienceOptions): ExperienceHandle {
  const { runtime, contract, elements } = options;
  const disposers: Array<() => void> = [];
  let counterfactual: CounterfactualHandle | undefined;
  let inspector: InspectorHandle | undefined;
  let microscope: MicroscopeHandle | undefined;
  let instrument: InstrumentHandle | undefined;
  const world = elements.world;

  if (contract.profile === "manifest" && elements.params) {
    disposers.push(bindParameterPanel({ root: elements.params, runtime }).dispose);
  }

  switch (contract.profile) {
    case "microscope":
      if (world) {
        microscope = bindMicroscopeUI({
          runtime,
          elements: {
            recipe: world.recipe!,
            constants: world.parameters!,
            stateReadout: world.stateReadout,
            stage: world.stage,
            restore: world.restore,
          },
          onAnchor: options.onInspectionAnchor,
        });
        disposers.push(microscope.dispose);
      }
      break;
    case "counterfactual":
      if (elements.counterfactual) {
        counterfactual = bindCounterfactualUI({
          runtime,
          elements: elements.counterfactual,
          intervention: options.intervention ?? interventionFromContract(contract),
          showOutcomes: options.showOutcomes ?? contract.options?.showOutcomes,
        });
        disposers.push(counterfactual.dispose);
      }
      break;
    case "instrument":
      if (world) {
        instrument = bindInstrumentUI({ runtime, contract, elements: world });
        disposers.push(instrument.dispose);
      }
      break;
    case "manifest":
      if (elements.metrics) {
        disposers.push(bindMetricsPanel({ root: elements.metrics, runtime }).dispose);
      }
      break;
    default:
      if (options.inspectorMode && elements.inspector) {
        inspector = bindInspectorUI({
          runtime,
          elements: elements.inspector,
          onFocus: options.onInspectorFocus,
        });
        disposers.push(inspector.dispose);
      }
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

  const caps = contract.capabilities;

  runtime.mount({
    viewport: elements.viewport,
    overlay: elements.overlay,
    onInspectionAnchor: (point) => {
      options.onInspectionAnchor?.(point);
      microscope?.setAnchor(point);
    },
    onTrajectoryPick: caps.inspect
      ? (pick) => {
          microscope?.handleTrajectoryPick(pick);
        }
      : undefined,
  });

  return {
    contract,
    sync() {
      chrome.sync();
      transport?.sync();
      counterfactual?.sync();
      inspector?.sync();
      microscope?.sync();
      instrument?.sync();
    },
    dispose() {
      for (const dispose of disposers) dispose();
      runtime.unmount();
    },
    counterfactual,
    inspector,
    microscope,
    instrument,
  };
}
