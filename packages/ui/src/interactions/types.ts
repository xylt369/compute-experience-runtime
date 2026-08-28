import type { ComputeRuntime, ExperienceContract } from "@compute-experience/core";

export interface InteractionPrimitive {
  sync(): void;
  dispose(): void;
}

export interface InteractionContext {
  runtime: ComputeRuntime;
  contract: ExperienceContract;
}

export interface WorldInteractionElements {
  stage: HTMLElement;
  stateReadout: HTMLElement;
  parameters?: HTMLElement;
  recipe?: HTMLElement;
  restore?: HTMLButtonElement;
  hint?: HTMLElement;
}

export interface BranchInteractionElements {
  panel: HTMLElement;
  timeline: HTMLElement;
  scrub: HTMLInputElement;
  divergence?: HTMLElement;
}
