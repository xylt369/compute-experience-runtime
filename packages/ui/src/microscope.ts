import type { ComputeRuntime, ExperienceContract } from "@compute-experience/core";
import { composeExperience } from "@compute-experience/core";
import { composeInteractions, type TraceInteractionHandle } from "./interactions";

export interface MicroscopeElements {
  recipe: HTMLElement;
  constants: HTMLElement;
  stateReadout: HTMLElement;
  stage: HTMLElement;
  restore?: HTMLButtonElement;
}

export interface MicroscopeOptions {
  runtime: ComputeRuntime;
  contract: ExperienceContract;
  elements: MicroscopeElements;
  onAnchor?: (point: { x: number; y: number } | null) => void;
}

/** @deprecated Use composeInteractions — trace + inspect + intervene + replay primitives. */
export interface MicroscopeHandle {
  sync(): void;
  setAnchor(point: { x: number; y: number } | null): void;
  handleTrajectoryPick(pick: { frameIndex: number; screen: { x: number; y: number } }): void;
  dispose(): void;
}

/** @deprecated Use composeInteractions with trace capability. */
export function bindMicroscopeUI(options: MicroscopeOptions): MicroscopeHandle {
  const composition = composeExperience(options.contract);
  const composed = composeInteractions(options.runtime, {
    contract: options.contract,
    composition,
    world: {
      stage: options.elements.stage,
      stateReadout: options.elements.stateReadout,
      parameters: options.elements.constants,
      recipe: options.elements.recipe,
      restore: options.elements.restore,
    },
    onInspectionAnchor: options.onAnchor,
  });

  const trace = composed.trace as TraceInteractionHandle | undefined;

  return {
    sync: () => composed.sync(),
    setAnchor: (point) => trace?.setAnchor(point),
    handleTrajectoryPick: (pick) => trace?.handleTrajectoryPick(pick),
    dispose: () => composed.dispose(),
  };
}
