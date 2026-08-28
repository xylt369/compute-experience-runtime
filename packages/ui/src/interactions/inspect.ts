import type { ComputeRuntime, ExperienceContract, ExperienceTarget } from "@compute-experience/core";
import { inspectableTargets } from "@compute-experience/core";
import { fmt } from "./format";
import type { InteractionPrimitive } from "./types";

export interface InspectInteractionOptions {
  runtime: ComputeRuntime;
  contract: ExperienceContract;
  readout: HTMLElement;
  /** Visual variant — trace-lens uses micro-* classes, world readout uses world-* */
  variant?: "trace" | "world";
  /** When trace is enabled, entering inspect on target selection */
  onEnter?: (field: string) => void;
}

function readoutTargets(contract: ExperienceContract): ExperienceTarget[] {
  const inspectable = inspectableTargets(contract);
  return inspectable.filter((t) => t.kind === "state" || t.traceable);
}

/** inspect + hold — semantic target readout over the world */
export function bindInspectInteraction(options: InspectInteractionOptions): InteractionPrimitive {
  const { runtime, contract, readout, variant = "world" } = options;
  const stateClass = variant === "trace" ? "micro-state" : "world-state";
  let activeField: string | null = null;
  let activeFrame = -1;

  const syncReadout = () => {
    const frame = runtime.currentFrame();
    if (!frame) {
      readout.replaceChildren();
      return;
    }
    const held = !runtime.isPlaying();
    const targets = readoutTargets(contract);
    readout.innerHTML = targets
      .map((target) => {
        const key = target.id;
        const value = frame.state[key];
        const derived = frame.derived?.[key];
        const display =
          typeof value === "number" ? fmt(value) : typeof derived === "number" ? fmt(derived) : "—";
        const active = activeField === key && activeFrame === runtime.currentIndex();
        return `<button type="button" class="${stateClass}${active ? " is-active" : ""}${held ? " is-held" : ""}" data-field="${key}">
          <span>${target.label ?? key}</span>
          <strong>${display}</strong>
        </button>`;
      })
      .join("");

    readout.querySelectorAll<HTMLButtonElement>(`.${stateClass}`).forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        runtime.pause();
        const field = btn.dataset.field!;
        activeField = field;
        activeFrame = runtime.currentIndex();
        options.onEnter?.(field);
        syncReadout();
      });
    });
  };

  const unsubscribe = runtime.subscribe((event) => {
    if (
      event.type === "frame" ||
      event.type === "run-seek" ||
      event.type === "rebuild" ||
      event.type === "reshape" ||
      event.type === "inspect"
    ) {
      if (event.type === "inspect" && event.state) {
        activeField = event.state.field;
        activeFrame = event.state.frameIndex;
      }
      syncReadout();
    }
  });

  syncReadout();

  return {
    sync: syncReadout,
    dispose: () => unsubscribe(),
  };
}
