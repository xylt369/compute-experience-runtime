import type { ComputeRuntime } from "@compute-experience/core";
import type { InteractionPrimitive } from "./types";

export interface WorldHintHandle extends InteractionPrimitive {
  dismiss(): void;
}

/** Ephemeral in-world cue — disappears after first inspection. */
export function bindWorldHint(options: {
  runtime: ComputeRuntime;
  hint: HTMLElement;
  message: string;
  enabled: boolean;
}): WorldHintHandle {
  const { runtime, hint, message, enabled } = options;
  if (!enabled) {
    hint.hidden = true;
    return { sync() {}, dispose() {}, dismiss() {} };
  }

  let dismissed = false;
  const hide = () => {
    dismissed = true;
    hint.hidden = true;
  };

  const sync = () => {
    if (dismissed) return;
    hint.textContent = message;
    hint.hidden = runtime.isPlaying();
  };

  const unsubscribe = runtime.subscribe((event) => {
    if (event.type === "inspect") hide();
    if (event.type === "frame") sync();
  });

  sync();

  return {
    sync,
    dispose: () => {
      unsubscribe();
      hint.hidden = true;
    },
    dismiss: hide,
  };
}
