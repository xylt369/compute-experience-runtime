import type { ComputeRuntime } from "@compute-experience/core";

export interface CounterfactualElements {
  /** Sidebar region for branch identity + intervention + inspector */
  panel: HTMLElement;
  /** Container wrapping the scrub input (for fork marker positioning) */
  timeline: HTMLElement;
  scrub: HTMLInputElement;
  /** Optional divergence chip in the stage HUD area */
  divergence?: HTMLElement;
}

export interface CounterfactualOptions {
  runtime: ComputeRuntime;
  elements: CounterfactualElements;
  /** State field to perturb at fork. Default: first manifest state field. */
  perturbField?: string;
  /** Default epsilon applied on fork when caller does not specify nudge. */
  defaultEpsilon?: number;
}

export interface CounterfactualHandle {
  sync(): void;
  applyIntervention(epsilon: number): void;
  seekToDivergence(): void;
  dispose(): void;
}

function fmtState(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return value.toExponential(3);
  }
  return value.toFixed(6);
}

function fmtDelta(value: number): string {
  const sign = value >= 0 ? "+" : "";
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return `${sign}${value.toExponential(2)}`;
  }
  return `${sign}${value.toFixed(3)}`;
}

export function bindCounterfactualUI(options: CounterfactualOptions): CounterfactualHandle {
  const { runtime, elements } = options;
  const perturbField =
    options.perturbField ?? runtime.manifest.state[0] ?? Object.keys(runtime.currentFrame()?.state ?? {})[0] ?? "x";
  const defaultEpsilon = options.defaultEpsilon ?? 1e-8;

  let epsilon = defaultEpsilon;
  let forkMarker: HTMLElement | null = null;

  const ensureForkMarker = () => {
    if (forkMarker?.isConnected) return forkMarker;
    forkMarker = document.createElement("div");
    forkMarker.className = "fork-marker";
    forkMarker.innerHTML = `<span class="fork-marker-line"></span><span class="fork-marker-label">FORK</span>`;
    elements.timeline.appendChild(forkMarker);
    return forkMarker;
  };

  const applyIntervention = (nextEpsilon: number) => {
    const branch = runtime.comparisonRuns[0];
    if (!branch?.forkPoint) return;
    epsilon = nextEpsilon;
    const forkFrame = branch.timeline.frames[branch.forkPoint.index];
    if (!forkFrame) return;
    const base = { ...forkFrame.state };
    if (perturbField in base) {
      const original = runtime.primaryRun.timeline.frames[branch.forkPoint.index]?.state[perturbField];
      base[perturbField] = (original ?? base[perturbField] ?? 0) + epsilon;
    }
    branch.setForkState(base);
    sync();
  };

  const seekToDivergence = () => {
    const comparison = runtime.compare();
    if (comparison?.divergenceIndex == null) return;
    runtime.pause();
    const target = Math.max(0, comparison.divergenceIndex - 1);
    runtime.seekIndex(target);
  };

  const sync = () => {
    const branch = runtime.comparisonRuns[0];
    const comparison = runtime.compare();
    const frame = runtime.currentFrame();
    const branchFrame = branch?.currentFrame();
    const unit = runtime.model.time?.unit ?? "s";

    // Fork marker on timeline
    const marker = ensureForkMarker();
    if (branch?.forkPoint && runtime.timeline.length > 1) {
      const pct = (branch.forkPoint.index / Math.max(1, runtime.timeline.length - 1)) * 100;
      marker.style.left = `${pct}%`;
      marker.hidden = false;
      marker.querySelector(".fork-marker-label")!.textContent = `FORK ${branch.forkPoint.time.toFixed(2)}${unit}`;
    } else {
      marker.hidden = true;
    }

    // Divergence chip
    if (elements.divergence) {
      if (comparison?.divergenceTime != null) {
        elements.divergence.hidden = false;
        const mag = comparison.divergenceMagnitude ?? 0;
        const field = comparison.divergenceField ?? "";
        elements.divergence.innerHTML = `<span class="divergence-kicker">DIVERGENCE</span><strong>${comparison.divergenceTime.toFixed(2)}${unit}</strong><small>${field} Δ ${mag.toExponential(2)}</small>`;
      } else {
        elements.divergence.hidden = true;
      }
    }

    // Panel
    elements.panel.replaceChildren();

    const tree = document.createElement("div");
    tree.className = "branch-tree";
    tree.innerHTML = branch
      ? `<div class="branch-line original">ORIGINAL</div>
         <div class="branch-connector">└── FORK @ ${branch.forkPoint?.time.toFixed(2) ?? "—"}${unit}</div>
         <div class="branch-line counterfactual">COUNTERFACTUAL</div>`
      : `<div class="branch-line original">ORIGINAL</div>
         <div class="branch-hint">Pause · seek · Fork to explore an alternative future</div>`;
    elements.panel.appendChild(tree);

    if (branch && branch.forkPoint) {
      const forkIdx = branch.forkPoint.index;
      const originalState = runtime.primaryRun.timeline.frames[forkIdx]?.state ?? {};
      const counterState = branch.timeline.frames[forkIdx]?.state ?? {};

      const intervention = document.createElement("div");
      intervention.className = "intervention";
      intervention.innerHTML = `
        <div class="intervention-kicker">Intervene</div>
        <div class="intervention-row">
          <span class="intervention-label">ORIGINAL</span>
          <code>${perturbField} = ${fmtState(originalState[perturbField] ?? 0)}</code>
        </div>
        <div class="intervention-row">
          <span class="intervention-label counter">COUNTERFACTUAL</span>
          <code>${perturbField} = ${fmtState(counterState[perturbField] ?? 0)}</code>
        </div>
        <label class="epsilon-label">ε perturbation on ${perturbField}</label>
        <input class="range epsilon" type="range" min="-8" max="-2" step="0.1" value="${Math.log10(Math.max(epsilon, 1e-12))}">
        <div class="epsilon-readout">ε = ${epsilon.toExponential(1)}</div>
      `;
      const slider = intervention.querySelector<HTMLInputElement>(".epsilon")!;
      const readout = intervention.querySelector(".epsilon-readout")!;
      slider.addEventListener("input", () => {
        const next = 10 ** Number(slider.value);
        readout.textContent = `ε = ${next.toExponential(1)}`;
        applyIntervention(next);
      });
      elements.panel.appendChild(intervention);
    }

    if (frame) {
      const inspector = document.createElement("div");
      inspector.className = "inspector";
      const keys = runtime.manifest.state;
      const deltas = comparison?.stateDifferences ?? [];
      const deltaMap = new Map(deltas.map((d) => [d.key, d]));

      let body = `<div class="inspector-time">t = ${frame.t.toFixed(2)} ${unit}</div>`;
      body += `<div class="inspector-grid">`;
      body += `<span></span><span class="col-head">ORIGINAL</span>`;
      if (branch) body += `<span class="col-head counter">COUNTER</span><span class="col-head delta">Δ</span>`;
      body += `</div>`;

      for (const key of keys) {
        const a = frame.state[key];
        const b = branchFrame?.state[key];
        const d = deltaMap.get(key);
        body += `<div class="inspector-grid">`;
        body += `<span class="state-key">${key}</span>`;
        body += `<span>${typeof a === "number" ? fmtState(a) : "—"}</span>`;
        if (branch) {
          body += `<span class="counter">${typeof b === "number" ? fmtState(b) : "—"}</span>`;
          body += `<span class="delta">${d ? fmtDelta(d.delta) : "—"}</span>`;
        }
        body += `</div>`;
      }
      body += `</div>`;
      inspector.innerHTML = `<div class="inspector-kicker">Inspect</div>${body}`;
      elements.panel.appendChild(inspector);
    }
  };

  const unsubscribe = runtime.subscribe((event) => {
    if (
      event.type === "frame" ||
      event.type === "rebuild" ||
      event.type === "run-forked" ||
      event.type === "run-updated" ||
      event.type === "run-seek" ||
      event.type === "run-state-changed"
    ) {
      sync();
    }
  });

  if (elements.divergence) {
    elements.divergence.addEventListener("click", seekToDivergence);
    elements.divergence.classList.add("divergence-event");
  }

  sync();

  return {
    sync,
    applyIntervention,
    seekToDivergence,
    dispose: () => {
      unsubscribe();
      forkMarker?.remove();
      elements.divergence?.replaceChildren();
    },
  };
}
