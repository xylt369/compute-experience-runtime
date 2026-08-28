import type { ComputeRuntime, ExperienceContract } from "@compute-experience/core";
import { composeExperience } from "@compute-experience/core";
import { bindModelChrome, type ModelChromeElements } from "./chrome";
import type { CounterfactualElements, CounterfactualHandle } from "./counterfactual";
import { composeInteractions, type ComposedInteractionsHandle } from "./interactions";
import type { BranchInteractionElements, WorldInteractionElements } from "./interactions/types";
import { bindMetricsPanel } from "./metrics";
import { bindParameterPanel } from "./params";
import { bindTransportBar, type TransportBarElements } from "./transport";

export interface WorldElements extends WorldInteractionElements {
  panel?: HTMLElement;
  hint?: HTMLElement;
}

export interface ExperienceElements extends ModelChromeElements {
  params?: HTMLElement;
  metrics?: HTMLElement;
  world?: WorldElements;
  counterfactual?: CounterfactualElements;
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
  onInspectionAnchor?: (point: { x: number; y: number } | null) => void;
}

export interface ExperienceHandle {
  sync(): void;
  dispose(): void;
  contract: ExperienceContract;
  interactions: ComposedInteractionsHandle;
  /** @deprecated Use interactions.branch */
  counterfactual?: CounterfactualHandle;
}

export function mountExperienceUI(options: MountExperienceOptions): ExperienceHandle {
  const { runtime, contract, elements } = options;
  const composition = composeExperience(contract);
  const disposers: Array<() => void> = [];
  const world = elements.world;

  if (composition.manifestPanel && elements.params) {
    disposers.push(bindParameterPanel({ root: elements.params, runtime }).dispose);
  }
  if (composition.manifestPanel && elements.metrics) {
    disposers.push(bindMetricsPanel({ root: elements.metrics, runtime }).dispose);
  }

  const branchElements: BranchInteractionElements | undefined =
    composition.branchPanel && elements.counterfactual
      ? {
          panel: elements.counterfactual.panel,
          timeline: elements.counterfactual.timeline,
          scrub: elements.counterfactual.scrub,
          divergence: elements.counterfactual.divergence,
        }
      : undefined;

  const interactions = composeInteractions(runtime, {
    contract,
    composition,
    world: composition.worldShell && world ? world : undefined,
    branch: branchElements,
    onInspectionAnchor: options.onInspectionAnchor,
  });
  disposers.push(interactions.dispose);

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
    onInspectionAnchor: interactions.mountHooks.onInspectionAnchor,
    onTrajectoryPick: interactions.mountHooks.onTrajectoryPick,
  });

  return {
    contract,
    interactions,
    counterfactual: interactions.branch,
    sync() {
      chrome.sync();
      transport?.sync();
      interactions.sync();
    },
    dispose() {
      for (const dispose of disposers) dispose();
      runtime.unmount();
    },
  };
}
