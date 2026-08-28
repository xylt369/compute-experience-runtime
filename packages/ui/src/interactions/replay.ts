import type { ComputeRuntime, ExperienceContract, ExperienceSnapshot } from "@compute-experience/core";
import { fmt } from "./format";
import type { InteractionPrimitive } from "./types";

/** replay — restore pre-intervention baseline */
export function bindReplayInteraction(options: {
  runtime: ComputeRuntime;
  restore: HTMLButtonElement;
  onRestore?: () => void;
}): InteractionPrimitive {
  const { runtime, restore } = options;
  let baseline: ExperienceSnapshot | null = null;

  const captureBaseline = () => {
    baseline = runtime.snapshot(true);
  };

  const onRestoreClick = (event: Event) => {
    event.stopPropagation();
    if (!baseline) return;
    runtime.pause();
    runtime.restore(baseline);
    runtime.clearInspection();
    restore.setAttribute("hidden", "");
    options.onRestore?.();
  };

  restore.addEventListener("click", onRestoreClick);

  const unsubscribe = runtime.subscribe((event) => {
    if (event.type === "reshape") {
      restore.removeAttribute("hidden");
    }
    if (event.type === "rebuild") {
      captureBaseline();
    }
  });

  captureBaseline();

  return {
    sync() {
      captureBaseline();
    },
    dispose() {
      unsubscribe();
      restore.removeEventListener("click", onRestoreClick);
    },
  };
}
