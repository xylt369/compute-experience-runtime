import type { ComputeRuntime, ExperienceContract } from "@compute-experience/core";
import { composeExperience } from "@compute-experience/core";
import { composeInteractions } from "./interactions";

export interface InstrumentElements {
  stage: HTMLElement;
  stateReadout: HTMLElement;
  parameters?: HTMLElement;
}

export interface InstrumentHandle {
  sync(): void;
  dispose(): void;
}

/** @deprecated Use composeInteractions with inspect capability (no trace). */
export function bindInstrumentUI(options: {
  runtime: ComputeRuntime;
  contract: ExperienceContract;
  elements: InstrumentElements;
}): InstrumentHandle {
  const composition = composeExperience(options.contract);
  const composed = composeInteractions(options.runtime, {
    contract: options.contract,
    composition,
    world: options.elements,
  });
  return {
    sync: () => composed.sync(),
    dispose: () => composed.dispose(),
  };
}
