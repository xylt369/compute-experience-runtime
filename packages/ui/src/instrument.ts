import type { ComputeRuntime, ExperienceContract } from "@compute-experience/core";

export interface InstrumentElements {
  stage: HTMLElement;
  stateReadout: HTMLElement;
  parameters?: HTMLElement;
}

export interface InstrumentHandle {
  sync(): void;
  dispose(): void;
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return value.toExponential(4);
  }
  return value.toFixed(4);
}

export function bindInstrumentUI(options: {
  runtime: ComputeRuntime;
  contract: ExperienceContract;
  elements: InstrumentElements;
}): InstrumentHandle {
  const { runtime, contract, elements } = options;

  const syncParameters = () => {
    if (!elements.parameters) return;
    const params = runtime.parameters;
    const keys = contract.targets.length
      ? Object.keys(params).filter((key) => !contract.targets.includes(key))
      : Object.keys(params);
    elements.parameters.innerHTML = keys
      .slice(0, 6)
      .map((key) => {
        const value = params[key];
        return `<span class="world-const" data-kind="parameter">${key} <strong>${typeof value === "number" ? fmt(value) : "—"}</strong></span>`;
      })
      .join("");
  };

  const syncReadout = () => {
    const frame = runtime.currentFrame();
    if (!frame) {
      elements.stateReadout.replaceChildren();
      return;
    }
    const held = !runtime.isPlaying();
    const fields = contract.targets.length ? contract.targets : runtime.manifest.state;
    elements.stateReadout.innerHTML = fields
      .map((key) => {
        const value = frame.state[key];
        const derived = frame.derived?.[key];
        const display = typeof value === "number" ? fmt(value) : typeof derived === "number" ? fmt(derived) : "—";
        return `<button type="button" class="world-state${held ? " is-held" : ""}" data-field="${key}">
          <span>${key}</span>
          <strong>${display}</strong>
        </button>`;
      })
      .join("");

    elements.stateReadout.querySelectorAll<HTMLButtonElement>(".world-state").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        runtime.pause();
        runtime.seekIndex(runtime.currentIndex());
        syncReadout();
      });
    });
  };

  const onStageClick = () => {
    if (runtime.isPlaying()) runtime.pause();
  };

  elements.stage.addEventListener("click", onStageClick);

  const unsubscribe = runtime.subscribe((event) => {
    if (
      event.type === "frame" ||
      event.type === "run-seek" ||
      event.type === "rebuild" ||
      event.type === "parameters"
    ) {
      syncReadout();
      syncParameters();
    }
  });

  syncParameters();
  syncReadout();

  return {
    sync() {
      syncReadout();
      syncParameters();
    },
    dispose() {
      unsubscribe();
      elements.stage.removeEventListener("click", onStageClick);
    },
  };
}
