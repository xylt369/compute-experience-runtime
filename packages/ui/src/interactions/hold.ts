import type { ComputeRuntime } from "@compute-experience/core";
import type { InteractionPrimitive } from "./types";

/** hold — pause playback when the world stage is clicked */
export function bindHoldInteraction(options: {
  runtime: ComputeRuntime;
  stage: HTMLElement;
}): InteractionPrimitive {
  const onStageClick = () => {
    if (options.runtime.isPlaying()) options.runtime.pause();
  };
  options.stage.addEventListener("click", onStageClick);
  return {
    sync() {},
    dispose() {
      options.stage.removeEventListener("click", onStageClick);
    },
  };
}
