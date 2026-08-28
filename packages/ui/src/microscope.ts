import type { ComputeRuntime, ExperienceSnapshot, InspectionState, TraceOperandRow } from "@compute-experience/core";
import {
  findTraceTerm,
  inspectionEditTarget,
  referenceTarget,
  traceOperandRows,
} from "@compute-experience/core";

export interface MicroscopeElements {
  recipe: HTMLElement;
  constants: HTMLElement;
  stateReadout: HTMLElement;
  stage: HTMLElement;
  restore?: HTMLButtonElement;
}

export interface MicroscopeOptions {
  runtime: ComputeRuntime;
  elements: MicroscopeElements;
  onAnchor?: (point: { x: number; y: number } | null) => void;
}

export interface MicroscopeHandle {
  sync(): void;
  setAnchor(point: { x: number; y: number } | null): void;
  handleTrajectoryPick(pick: { frameIndex: number; screen: { x: number; y: number } }): void;
  dispose(): void;
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return value.toExponential(4);
  }
  return value.toFixed(4);
}

function displayFormula(trace: InspectionState["trace"]): string {
  if (trace.initial) return `${trace.field}₀ = initial`;
  return trace.formula.replace(/(\w)_next/, "$1(t+Δt)");
}

function operandLabel(trace: InspectionState["trace"], row: TraceOperandRow): string {
  if (row.ref?.kind === "dt") return "Δt";
  if (row.ref?.kind === "parameter") return row.label;
  if (trace.initial) return `${row.label}₀`;
  return `${row.label}(t)`;
}

function isStateRow(row: TraceOperandRow): boolean {
  return row.ref?.kind === "state";
}

function canTouch(inspection: InspectionState): boolean {
  if (inspection.trace.initial) return true;
  if (inspection.navigation.length < 2) return false;
  const origin = inspection.navigation[0]!;
  const focus = inspection.navigation[inspection.navigation.length - 1]!;
  if (focus.termId != null) return false;
  if (!["x", "y", "z"].includes(focus.field)) return false;
  return focus.frameIndex !== origin.frameIndex || focus.field !== origin.field;
}

export function bindMicroscopeUI(options: MicroscopeOptions): MicroscopeHandle {
  const { runtime, elements } = options;
  let inspection: InspectionState | null = null;
  let draftValue: number | null = null;
  let touching = false;
  let baseline: ExperienceSnapshot | null = null;
  let anchor: { x: number; y: number } | null = null;

  const captureBaseline = () => {
    baseline = runtime.snapshot(true);
  };

  const positionRecipe = () => {
    if (!inspection) {
      elements.recipe.hidden = true;
      return;
    }
    elements.recipe.hidden = false;
    const rect = elements.stage.getBoundingClientRect();
    const cardW = elements.recipe.offsetWidth || 280;
    const cardH = elements.recipe.offsetHeight || 180;
    let x = anchor ? anchor.x + 18 : rect.width * 0.58;
    let y = anchor ? anchor.y - cardH * 0.5 : rect.height * 0.22;
    x = Math.max(12, Math.min(rect.width - cardW - 12, x));
    y = Math.max(12, Math.min(rect.height - cardH - 80, y));
    elements.recipe.style.left = `${x}px`;
    elements.recipe.style.top = `${y}px`;
  };

  const syncConstants = () => {
    const p = runtime.parameters;
    elements.constants.innerHTML = `
      <span class="micro-const" data-kind="parameter">σ <strong>${fmt(p.sigma ?? 0)}</strong></span>
      <span class="micro-const" data-kind="parameter">ρ <strong>${fmt(p.rho ?? 0)}</strong></span>
      <span class="micro-const" data-kind="parameter">β <strong>${fmt(p.beta ?? 0)}</strong></span>
    `;
  };

  const syncReadout = () => {
    const frame = runtime.currentFrame();
    if (!frame) {
      elements.stateReadout.replaceChildren();
      return;
    }
    const held = !runtime.isPlaying();
    elements.stateReadout.innerHTML = runtime.manifest.state
      .map((key) => {
        const value = frame.state[key];
        const active =
          inspection?.field === key && inspection.frameIndex === runtime.currentIndex();
        return `<button type="button" class="micro-state${active ? " is-active" : ""}${held ? " is-held" : ""}" data-field="${key}">
          <span>${key}</span>
          <strong>${typeof value === "number" ? fmt(value) : "—"}</strong>
        </button>`;
      })
      .join("");

    elements.stateReadout.querySelectorAll<HTMLButtonElement>(".micro-state").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        runtime.pause();
        const field = btn.dataset.field!;
        draftValue = runtime.currentFrame()?.state[field] ?? null;
        touching = false;
        inspection = runtime.inspect(runtime.currentIndex(), field, null, { replace: true });
        renderRecipe();
        syncReadout();
      });
    });
  };

  const renderRecipe = () => {
    elements.recipe.replaceChildren();
    if (!inspection) {
      elements.recipe.hidden = true;
      return;
    }

    const { trace, navigation, frameIndex, field, termId, value } = inspection;
    const unit = runtime.model.time?.unit ?? "s";
    const focusTerm = termId ? findTraceTerm(trace.result, termId) : trace.result;
    const title = focusTerm?.label ?? field;
    const rows = traceOperandRows(trace, termId);
    const editTarget = inspectionEditTarget(trace, field, termId);
    const editValue =
      draftValue ??
      runtime.primaryRun.timeline.frames[editTarget.frameIndex]?.state[editTarget.field] ??
      value;
    const touchable = canTouch(inspection);

    const path = navigation
      .map((item, index) => {
        const dim =
          index < navigation.length - 2
            ? " is-dim"
            : index === navigation.length - 2
              ? " is-fade"
              : " is-current";
        return `<button type="button" class="micro-path${dim}" data-crumb="${index}">${item.label}</button>`;
      })
      .join('<span class="micro-path-sep">→</span>');

    const operands = rows
      .map((row) => {
        const navigable = row.ref && referenceTarget(row.ref);
        const isConst = row.ref?.kind === "parameter" || row.ref?.kind === "dt";
        const termAttrs = row.termId ? `data-term="${row.termId}"` : "";
        const navAttrs = navigable
          ? `data-nav="1" data-frame="${navigable.frameIndex}" data-field="${navigable.field}"`
          : "";
        const clickable = navigable || row.termId ? " is-clickable" : "";
        const kind = isConst ? " is-const" : isStateRow(row) ? " is-state" : "";
        return `<button type="button" class="micro-operand${clickable}${kind}" ${termAttrs} ${navAttrs}>
          <span>${operandLabel(trace, row)}</span>
          <strong>${fmt(row.value)}</strong>
        </button>`;
      })
      .join("");

    const touchBlock = touchable
      ? touching
        ? `<div class="micro-touch open">
            <label>${editTarget.field}(t=${editTarget.time.toFixed(2)}${unit})</label>
            <input class="micro-touch-input" type="number" step="any" value="${editValue}">
            <div class="micro-touch-actions">
              <button type="button" class="micro-btn micro-release">Release</button>
              <button type="button" class="micro-btn micro-cancel">Cancel</button>
            </div>
          </div>`
        : `<button type="button" class="micro-touch-toggle">touch ↳ ${editTarget.field} = ${fmt(editValue)}</button>`
      : "";

    elements.recipe.innerHTML = `
      <div class="micro-recipe">
        ${navigation.length > 1 ? `<nav class="micro-paths">${path}</nav>` : ""}
        <div class="micro-eq">${displayFormula(trace)}</div>
        <div class="micro-result">
          <span>${trace.initial ? `${field}₀` : `${field}(t+Δt)`}</span>
          <strong>= ${fmt(trace.result.value)}</strong>
        </div>
        <div class="micro-focus">
          <span class="micro-focus-label">${title}</span>
          <span class="micro-focus-value">${fmt(focusTerm?.value ?? value)}</span>
        </div>
        <div class="micro-operands">${operands}</div>
        ${touchBlock}
        <button type="button" class="micro-close" aria-label="Return">return</button>
      </div>`;

    elements.recipe.querySelectorAll<HTMLButtonElement>(".micro-operand.is-clickable").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        touching = false;
        if (btn.dataset.term) {
          inspection = runtime.inspect(frameIndex, field, btn.dataset.term, { push: true });
          renderRecipe();
          positionRecipe();
          return;
        }
        if (btn.dataset.nav) {
          const refFrame = Number(btn.dataset.frame);
          const refField = btn.dataset.field!;
          draftValue = runtime.primaryRun.timeline.frames[refFrame]?.state[refField] ?? null;
          inspection = runtime.inspect(refFrame, refField, null, { push: true, seek: true });
          anchor = null;
          renderRecipe();
          syncReadout();
          positionRecipe();
        }
      });
    });

    elements.recipe.querySelectorAll<HTMLButtonElement>(".micro-path").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const targetIndex = Number(btn.dataset.crumb);
        touching = false;
        let current = inspection;
        while (current && current.navigation.length > targetIndex + 1) {
          current = runtime.inspectionBack();
        }
        inspection = current;
        draftValue = inspection?.value ?? null;
        renderRecipe();
        syncReadout();
        positionRecipe();
      });
    });

    elements.recipe.querySelector(".micro-touch-toggle")?.addEventListener("click", (event) => {
      event.stopPropagation();
      touching = true;
      renderRecipe();
    });

    elements.recipe.querySelector(".micro-cancel")?.addEventListener("click", (event) => {
      event.stopPropagation();
      touching = false;
      draftValue = null;
      renderRecipe();
    });

    const touchInput = elements.recipe.querySelector<HTMLInputElement>(".micro-touch-input");
    touchInput?.addEventListener("input", () => {
      draftValue = Number(touchInput.value);
    });

    elements.recipe.querySelector(".micro-release")?.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = Number(touchInput?.value ?? editValue);
      if (!Number.isFinite(next)) return;
      runtime.intervene({ frameIndex: editTarget.frameIndex, field: editTarget.field, value: next });
      draftValue = next;
      touching = false;
      inspection = runtime.inspect(editTarget.frameIndex, editTarget.field, null, {
        replace: true,
        seek: true,
      });
      renderRecipe();
      syncReadout();
      positionRecipe();
      runtime.play();
    });

    elements.recipe.querySelector(".micro-close")?.addEventListener("click", (event) => {
      event.stopPropagation();
      touching = false;
      inspection = null;
      runtime.clearInspection();
      renderRecipe();
      syncReadout();
      options.onAnchor?.(null);
    });

    positionRecipe();
  };

  const onStageClick = () => {
    if (runtime.isPlaying()) runtime.pause();
  };

  const handleTrajectoryPick = (pick: { frameIndex: number; screen: { x: number; y: number } }) => {
    runtime.pause();
    runtime.seekIndex(pick.frameIndex);
    const field = inspection?.field ?? "z";
    touching = false;
    draftValue = runtime.primaryRun.timeline.frames[pick.frameIndex]?.state[field] ?? null;
    inspection = runtime.inspect(pick.frameIndex, field, null, { replace: true, seek: true });
    anchor = pick.screen;
    renderRecipe();
    syncReadout();
    positionRecipe();
  };

  elements.stage.addEventListener("click", onStageClick);

  elements.restore?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!baseline) return;
    runtime.pause();
    runtime.restore(baseline);
    runtime.clearInspection();
    inspection = null;
    touching = false;
    draftValue = null;
    renderRecipe();
    syncReadout();
    syncConstants();
    elements.restore?.setAttribute("hidden", "");
    options.onAnchor?.(null);
  });

  const unsubscribe = runtime.subscribe((event) => {
    if (event.type === "inspect") {
      inspection = event.state;
      renderRecipe();
    }
    if (event.type === "frame" || event.type === "run-seek" || event.type === "rebuild" || event.type === "reshape") {
      syncReadout();
      syncConstants();
      if (event.type === "reshape") {
        elements.restore?.removeAttribute("hidden");
      }
      if (inspection) positionRecipe();
    }
  });

  captureBaseline();
  syncConstants();
  syncReadout();
  renderRecipe();

  return {
    sync() {
      if (inspection) {
        inspection =
          runtime.inspect(inspection.frameIndex, inspection.field, inspection.termId, { replace: true }) ??
          inspection;
        renderRecipe();
      }
      syncReadout();
      syncConstants();
    },
    setAnchor(point) {
      anchor = point;
      positionRecipe();
    },
    handleTrajectoryPick,
    dispose: () => {
      unsubscribe();
      elements.stage.removeEventListener("click", onStageClick);
    },
  };
}
