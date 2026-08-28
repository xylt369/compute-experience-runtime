import type { ComputeRuntime, StateFrame } from "@compute-experience/core";

export interface CounterfactualElements {
  /** Sidebar region for branch identity + intervention + inspector */
  panel: HTMLElement;
  /** Container wrapping the scrub input (for fork marker positioning) */
  timeline: HTMLElement;
  scrub: HTMLInputElement;
  /** Optional floating hint shown before the first fork (keeps chart unobstructed). */
  hint?: HTMLElement;
  /** Optional divergence chip in the stage HUD area */
  divergence?: HTMLElement;
}

export type StateInterventionConfig = {
  mode: "state";
  perturbField: string;
  defaultEpsilon?: number;
};

export type ParameterInterventionConfig = {
  mode: "parameter";
  parameterId: string;
  /** Value applied to the branch immediately after fork. */
  forkValue: number;
  label?: string;
};

export type InterventionConfig = StateInterventionConfig | ParameterInterventionConfig;

export interface CounterfactualOptions {
  runtime: ComputeRuntime;
  elements: CounterfactualElements;
  /** How the counterfactual branch diverges from the original at the fork. */
  intervention?: InterventionConfig;
  /** @deprecated Use intervention.mode === "state" */
  perturbField?: string;
  /** @deprecated Use intervention.defaultEpsilon */
  defaultEpsilon?: number;
  /** Show peak-infected style outcome comparison when a branch exists. */
  showOutcomes?: boolean;
}

export interface CounterfactualHandle {
  sync(): void;
  applyIntervention(value: number): void;
  seekToDivergence(): void;
  /** Fork at the scrub cursor, apply the default intervention, and enter single-target edit. */
  beginForkAtCursor(): boolean;
  /** Leave edit mode and resume synced playback from the fork seam. */
  continueFromFork(): void;
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

function fmtDay(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "—";
}

function resolveIntervention(options: CounterfactualOptions): InterventionConfig {
  if (options.intervention) return options.intervention;
  const perturbField =
    options.perturbField ??
    options.runtime.manifest.state[0] ??
    Object.keys(options.runtime.currentFrame()?.state ?? {})[0] ??
    "x";
  return {
    mode: "state",
    perturbField,
    defaultEpsilon: options.defaultEpsilon ?? 1e-8,
  };
}

function defaultInterventionValue(intervention: InterventionConfig): number {
  if (intervention.mode === "parameter") return intervention.forkValue;
  return intervention.defaultEpsilon ?? 1e-8;
}

function peakInfected(frames: readonly StateFrame[]): { peak: number; day: number } {
  let peak = 0;
  let day = 0;
  for (const frame of frames) {
    const infected = frame.state.infected ?? 0;
    if (infected > peak) {
      peak = infected;
      day = frame.t;
    }
  }
  return { peak, day };
}

export function bindCounterfactualUI(options: CounterfactualOptions): CounterfactualHandle {
  const { runtime, elements } = options;
  const intervention = resolveIntervention(options);
  const showOutcomes = options.showOutcomes ?? intervention.mode === "parameter";

  let stateEpsilon =
    intervention.mode === "state" ? (intervention.defaultEpsilon ?? 1e-8) : 0;
  let forkEditMode = false;
  let compareExpanded = false;
  let forkMarker: HTMLElement | null = null;

  const ensureForkMarker = () => {
    if (forkMarker?.isConnected) return forkMarker;
    forkMarker = document.createElement("div");
    forkMarker.className = "fork-marker";
    forkMarker.innerHTML = `<span class="fork-marker-line"></span><span class="fork-marker-label">FORK</span>`;
    elements.timeline.appendChild(forkMarker);
    return forkMarker;
  };

  const applyIntervention = (value: number) => {
    const branch = runtime.comparisonRuns[0];
    if (!branch?.forkPoint) return;

    if (intervention.mode === "parameter") {
      branch.setParameters({ [intervention.parameterId]: value });
      sync();
      return;
    }

    stateEpsilon = value;
    const forkFrame = branch.timeline.frames[branch.forkPoint.index];
    if (!forkFrame) return;
    const base = { ...forkFrame.state };
    if (intervention.perturbField in base) {
      const original =
        runtime.primaryRun.timeline.frames[branch.forkPoint.index]?.state[intervention.perturbField];
      base[intervention.perturbField] = (original ?? base[intervention.perturbField] ?? 0) + stateEpsilon;
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

  const beginForkAtCursor = (): boolean => {
    runtime.pause();
    const index = runtime.currentIndex();
    runtime.forkAt(index);
    applyIntervention(defaultInterventionValue(intervention));
    runtime.setSyncPlayback(true);
    forkEditMode = true;
    compareExpanded = false;
    sync();
    return runtime.comparisonRuns.length > 0;
  };

  const continueFromFork = () => {
    const branch = runtime.comparisonRuns[0];
    if (!branch?.forkPoint) return;
    forkEditMode = false;
    compareExpanded = false;
    runtime.seekIndex(branch.forkPoint.index);
    runtime.play();
    sync();
  };

  const renderCompareDetails = (
    host: HTMLElement,
    branch: NonNullable<(typeof runtime.comparisonRuns)[0]>,
    comparison: ReturnType<ComputeRuntime["compare"]>,
    frame: StateFrame | undefined,
    branchFrame: StateFrame | undefined,
    unit: string,
  ) => {
    const tree = document.createElement("div");
    tree.className = "branch-tree fork-compare-tree";
    tree.innerHTML = `
      <div class="branch-diagram">
        <div class="branch-node original">
          <span class="branch-dot"></span>
          <span>ORIGINAL</span>
        </div>
        <div class="branch-rail">
          <span class="branch-rail-line"></span>
          <span class="branch-rail-label">Fork @ ${branch.forkPoint?.time.toFixed(2) ?? "—"}${unit}</span>
        </div>
        <div class="branch-node counterfactual">
          <span class="branch-dot"></span>
          <span>COUNTERFACTUAL</span>
        </div>
      </div>`;
    host.appendChild(tree);

    if (frame) {
      const inspector = document.createElement("div");
      inspector.className = "inspector";
      const keys = runtime.manifest.state;
      const deltas = comparison?.stateDifferences ?? [];
      const deltaMap = new Map(deltas.map((d) => [d.key, d]));

      let table = `<table class="inspector-table"><thead><tr><th></th><th>Original</th>`;
      table += `<th class="col-counter">Counter</th><th class="col-delta">Δ</th>`;
      table += `</tr></thead><tbody>`;

      for (const key of keys) {
        const a = frame.state[key];
        const b = branchFrame?.state[key];
        const d = deltaMap.get(key);
        table += `<tr><td>${key}</td>`;
        table += `<td>${typeof a === "number" ? fmtState(a) : "—"}</td>`;
        table += `<td class="col-counter">${typeof b === "number" ? fmtState(b) : "—"}</td>`;
        table += `<td class="col-delta">${d ? fmtDelta(d.delta) : "—"}</td>`;
        table += `</tr>`;
      }
      table += `</tbody></table>`;

      inspector.innerHTML = `<div class="inspector-kicker">At this moment</div><div class="inspector-time">t = ${frame.t.toFixed(2)} ${unit}</div>${table}`;
      host.appendChild(inspector);
    }

    if (showOutcomes) {
      const primaryOutcome = peakInfected(runtime.primaryRun.timeline.frames);
      const branchOutcome = peakInfected(branch.timeline.frames);
      const outcomes = document.createElement("div");
      outcomes.className = "outcomes";
      outcomes.innerHTML = `
        <div class="inspector-kicker">Outcomes</div>
        <table class="inspector-table">
          <thead><tr><th></th><th>Original</th><th class="col-counter">Counter</th><th class="col-delta">Δ</th></tr></thead>
          <tbody>
            <tr>
              <td>peak infected</td>
              <td>${fmtState(primaryOutcome.peak)}</td>
              <td class="col-counter">${fmtState(branchOutcome.peak)}</td>
              <td class="col-delta">${fmtDelta(branchOutcome.peak - primaryOutcome.peak)}</td>
            </tr>
            <tr>
              <td>peak day</td>
              <td>${fmtDay(primaryOutcome.day)}${unit}</td>
              <td class="col-counter">${fmtDay(branchOutcome.day)}${unit}</td>
              <td class="col-delta">${fmtDelta(branchOutcome.day - primaryOutcome.day)}${unit}</td>
            </tr>
          </tbody>
        </table>`;
      host.appendChild(outcomes);
    }

    if (comparison?.divergenceTime != null) {
      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "fork-compare-jump";
      jump.textContent = `Jump to divergence @ ${comparison.divergenceTime.toFixed(2)}${unit}`;
      jump.addEventListener("click", seekToDivergence);
      host.appendChild(jump);
    }
  };

  const renderForkSeamEditor = (
    host: HTMLElement,
    branch: NonNullable<(typeof runtime.comparisonRuns)[0]>,
    unit: string,
  ) => {
    const seam = document.createElement("div");
    seam.className = "fork-seam";

    if (intervention.mode === "parameter") {
      const paramDef = runtime.manifest.parameters.find((p) => p.id === intervention.parameterId);
      const label = intervention.label ?? paramDef?.label ?? intervention.parameterId;
      const unitLabel = paramDef?.unit ? ` ${paramDef.unit}` : "";
      const counterValue = branch.parameters[intervention.parameterId] ?? intervention.forkValue;
      const min = Number(paramDef?.min ?? 0);
      const max = Number(paramDef?.max ?? 120);
      const step = Number(paramDef?.step ?? 1);

      seam.innerHTML = `
        <div class="fork-seam-head">Change the future from here</div>
        <div class="fork-seam-meta">Fork @ ${branch.forkPoint?.time.toFixed(2) ?? "—"}${unit}</div>
        <div class="fork-seam-control">
          <label class="fork-seam-label">${label}</label>
          <input class="range epsilon fork-seam-input" type="range" min="${min}" max="${max}" step="${step}" value="${counterValue}">
          <div class="fork-seam-readout">${fmtDay(counterValue)}${unitLabel}</div>
        </div>
        <div class="fork-seam-actions">
          <button class="control control-accent fork-continue" type="button">Continue</button>
          <button class="control control-ghost fork-compare-toggle" type="button">Compare</button>
        </div>`;

      const slider = seam.querySelector<HTMLInputElement>(".fork-seam-input")!;
      const readout = seam.querySelector(".fork-seam-readout")!;
      slider.addEventListener("input", () => {
        const next = Number(slider.value);
        readout.textContent = `${fmtDay(next)}${unitLabel}`;
        applyIntervention(next);
      });
    } else {
      const field = intervention.perturbField;
      seam.innerHTML = `
        <div class="fork-seam-head">Change the future from here</div>
        <div class="fork-seam-meta">Fork @ ${branch.forkPoint?.time.toFixed(2) ?? "—"}${unit}</div>
        <div class="fork-seam-control">
          <label class="fork-seam-label">Perturbation ε on ${field}</label>
          <input class="range epsilon fork-seam-input" type="range" min="-8" max="-2" step="0.1" value="${Math.log10(Math.max(stateEpsilon, 1e-12))}">
          <div class="fork-seam-readout">ε = ${stateEpsilon.toExponential(1)}</div>
        </div>
        <div class="fork-seam-actions">
          <button class="control control-accent fork-continue" type="button">Continue</button>
          <button class="control control-ghost fork-compare-toggle" type="button">Compare</button>
        </div>`;

      const slider = seam.querySelector<HTMLInputElement>(".fork-seam-input")!;
      const readout = seam.querySelector(".fork-seam-readout")!;
      slider.addEventListener("input", () => {
        const next = 10 ** Number(slider.value);
        readout.textContent = `ε = ${next.toExponential(1)}`;
        applyIntervention(next);
      });
    }

    seam.querySelector(".fork-continue")!.addEventListener("click", continueFromFork);
    seam.querySelector(".fork-compare-toggle")!.addEventListener("click", () => {
      compareExpanded = !compareExpanded;
      sync();
    });

    host.appendChild(seam);

    if (compareExpanded) {
      const compareHost = document.createElement("div");
      compareHost.className = "fork-compare-details";
      renderCompareDetails(
        compareHost,
        branch,
        runtime.compare(),
        runtime.currentFrame(),
        branch.currentFrame(),
        unit,
      );
      host.appendChild(compareHost);
    }
  };

  const sync = () => {
    const branch = runtime.comparisonRuns[0];
    const comparison = runtime.compare();
    const frame = runtime.currentFrame();
    const branchFrame = branch?.currentFrame();
    const unit = runtime.model.time?.unit ?? "s";

    const marker = ensureForkMarker();
    if (branch?.forkPoint && runtime.timeline.length > 1) {
      const pct = (branch.forkPoint.index / Math.max(1, runtime.timeline.length - 1)) * 100;
      marker.style.left = `${pct}%`;
      marker.hidden = false;
      marker.querySelector(".fork-marker-label")!.textContent = `FORK ${branch.forkPoint.time.toFixed(2)}${unit}`;
    } else {
      marker.hidden = true;
      forkEditMode = false;
      compareExpanded = false;
    }

    if (elements.divergence) {
      if (branch && comparison?.divergenceTime != null && !forkEditMode) {
        elements.divergence.hidden = false;
        const mag = comparison.divergenceMagnitude ?? 0;
        const field = comparison.divergenceField ?? "";
        elements.divergence.innerHTML = `<span class="divergence-kicker">COMPARE</span><strong>${comparison.divergenceTime.toFixed(2)}${unit}</strong><small>${field} Δ ${mag.toExponential(2)}</small>`;
      } else {
        elements.divergence.hidden = true;
      }
    }

    elements.panel.replaceChildren();

    if (!branch) {
      elements.panel.hidden = true;
      if (elements.hint) {
        elements.hint.hidden = false;
        elements.hint.textContent = "Pause at a moment, then Fork to change one value and continue.";
      }
      return;
    }

    if (elements.hint) {
      elements.hint.hidden = true;
      elements.hint.textContent = "";
    }

    if (forkEditMode) {
      elements.panel.hidden = false;
      renderForkSeamEditor(elements.panel, branch, unit);
      return;
    }

    if (compareExpanded) {
      elements.panel.hidden = false;
      renderCompareDetails(
        elements.panel,
        branch,
        comparison,
        frame,
        branchFrame,
        unit,
      );
      const close = document.createElement("button");
      close.type = "button";
      close.className = "control control-ghost fork-compare-close";
      close.textContent = "Close compare";
      close.addEventListener("click", () => {
        compareExpanded = false;
        sync();
      });
      elements.panel.appendChild(close);
      return;
    }

    elements.panel.hidden = true;
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
    elements.divergence.addEventListener("click", () => {
      if (!runtime.comparisonRuns[0]) return;
      compareExpanded = !compareExpanded;
      sync();
    });
  }

  sync();

  return {
    sync,
    applyIntervention,
    seekToDivergence,
    beginForkAtCursor,
    continueFromFork,
    dispose: () => {
      unsubscribe();
      forkMarker?.remove();
      elements.divergence?.replaceChildren();
    },
  };
}
