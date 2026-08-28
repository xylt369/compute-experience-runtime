import type {
  ComputeRuntime,
  ExperienceContract,
  ExperienceSnapshot,
  InspectionState,
  TraceOperandRow,
} from "@compute-experience/core";
import {
  findTraceTerm,
  inspectionEditTarget,
  intervenableTargets,
  referenceTarget,
  traceOperandRows,
} from "@compute-experience/core";
import { fmt } from "./format";
import type { InteractionPrimitive } from "./types";

export interface TraceInteractionOptions {
  runtime: ComputeRuntime;
  contract: ExperienceContract;
  recipe: HTMLElement;
  stage: HTMLElement;
  restore?: HTMLButtonElement;
  onAnchor?: (point: { x: number; y: number } | null) => void;
}

export interface TraceInteractionHandle extends InteractionPrimitive {
  enterInspect(field: string, frameIndex?: number): void;
  setAnchor(point: { x: number; y: number } | null): void;
  handleTrajectoryPick(pick: { frameIndex: number; screen: { x: number; y: number } }): void;
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

function canTouch(inspection: InspectionState, contract: ExperienceContract): boolean {
  if (!contract.capabilities.intervene) return false;
  if (inspection.trace.initial) return true;
  if (inspection.navigation.length < 2) return false;
  const origin = inspection.navigation[0]!;
  const focus = inspection.navigation[inspection.navigation.length - 1]!;
  if (focus.termId != null) return false;
  const allowed = new Set(intervenableTargets(contract).map((t) => t.id));
  if (!allowed.has(focus.field)) return false;
  return focus.frameIndex !== origin.frameIndex || focus.field !== origin.field;
}

function hasFollowableOperands(rows: TraceOperandRow[]): boolean {
  return rows.some((row) => Boolean(row.termId || (row.ref && referenceTarget(row.ref))));
}

function stepHint(
  inspection: InspectionState,
  contract: ExperienceContract,
  rows: TraceOperandRow[],
): string {
  if (canTouch(inspection, contract)) return "";
  if (hasFollowableOperands(rows)) {
    return "Follow a contributing value below to enter the computation.";
  }
  return "";
}

/**
 * trace + ask + follow + touch + release — in-world computational recipe lens.
 */
export function bindTraceInteraction(options: TraceInteractionOptions): TraceInteractionHandle {
  const { runtime, contract, recipe, stage, restore } = options;
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
      recipe.hidden = true;
      return;
    }
    recipe.hidden = false;
    const rect = stage.getBoundingClientRect();
    const cardW = Math.min(recipe.offsetWidth || 300, rect.width * 0.44);
    const cardH = recipe.offsetHeight || 200;
    const timelineReserve = 96;

    let x: number;
    let y: number;
    if (anchor) {
      x = anchor.x + 22;
      y = anchor.y - cardH * 0.42;
      if (x + cardW > rect.width - 16) x = anchor.x - cardW - 22;
    } else {
      x = rect.width * 0.34 - cardW * 0.5;
      y = rect.height * 0.24;
    }

    x = Math.max(16, Math.min(rect.width - cardW - 16, x));
    y = Math.max(16, Math.min(rect.height - cardH - timelineReserve, y));
    recipe.style.left = `${x}px`;
    recipe.style.top = `${y}px`;
  };

  const renderRecipe = () => {
    recipe.replaceChildren();
    if (!inspection) {
      recipe.hidden = true;
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
    const touchable = canTouch(inspection, contract);
    const guide = stepHint(inspection, contract, rows);

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
        const followHint = navigable || row.termId ? " ↗" : "";
        return `<button type="button" class="micro-operand${clickable}${kind}" ${termAttrs} ${navAttrs}>
          <span>${operandLabel(trace, row)}${followHint}</span>
          <strong>${fmt(row.value)}</strong>
        </button>`;
      })
      .join("");

    const touchBlock = touchable
      ? touching
        ? `<div class="micro-touch open">
            <label>Change ${editTarget.field} at t=${editTarget.time.toFixed(2)}${unit}</label>
            <input class="micro-touch-input" type="number" step="any" value="${editValue}">
            <div class="micro-touch-actions">
              <button type="button" class="micro-btn micro-release">Release — reshape from here</button>
              <button type="button" class="micro-btn micro-cancel">Cancel</button>
            </div>
          </div>`
        : `<button type="button" class="micro-touch-toggle">Change ${editTarget.field} = ${fmt(editValue)}</button>`
      : "";

    recipe.innerHTML = `
      <div class="micro-recipe">
        <div class="micro-recipe-kicker">Why here?</div>
        ${guide ? `<p class="micro-hint">${guide}</p>` : ""}
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
        <button type="button" class="micro-close" aria-label="Close">close</button>
      </div>`;

    recipe.querySelectorAll<HTMLButtonElement>(".micro-operand.is-clickable").forEach((btn) => {
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
          positionRecipe();
        }
      });
    });

    recipe.querySelectorAll<HTMLButtonElement>(".micro-path").forEach((btn) => {
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
        positionRecipe();
      });
    });

    recipe.querySelector(".micro-touch-toggle")?.addEventListener("click", (event) => {
      event.stopPropagation();
      touching = true;
      renderRecipe();
    });

    recipe.querySelector(".micro-cancel")?.addEventListener("click", (event) => {
      event.stopPropagation();
      touching = false;
      draftValue = null;
      renderRecipe();
    });

    const touchInput = recipe.querySelector<HTMLInputElement>(".micro-touch-input");
    touchInput?.addEventListener("input", () => {
      draftValue = Number(touchInput.value);
    });

    recipe.querySelector(".micro-release")?.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = Number(touchInput?.value ?? editValue);
      if (!Number.isFinite(next)) return;
      runtime.intervene({ frameIndex: editTarget.frameIndex, field: editTarget.field, value: next });
      draftValue = next;
      touching = false;
      inspection = null;
      runtime.clearInspection();
      anchor = null;
      renderRecipe();
      options.onAnchor?.(null);
      runtime.seekIndex(editTarget.frameIndex);
      runtime.play();
    });

    recipe.querySelector(".micro-close")?.addEventListener("click", (event) => {
      event.stopPropagation();
      touching = false;
      inspection = null;
      runtime.clearInspection();
      renderRecipe();
      options.onAnchor?.(null);
    });

    positionRecipe();
  };

  const enterInspect = (field: string, frameIndex?: number) => {
    const idx = frameIndex ?? runtime.currentIndex();
    draftValue = runtime.primaryRun.timeline.frames[idx]?.state[field] ?? null;
    touching = false;
    inspection = runtime.inspect(idx, field, null, { replace: true, seek: frameIndex != null });
    renderRecipe();
  };

  const handleTrajectoryPick = (pick: { frameIndex: number; screen: { x: number; y: number } }) => {
    runtime.pause();
    runtime.seekIndex(pick.frameIndex);
    const field = inspection?.field ?? contract.targets.find((t) => t.traceable)?.id ?? "z";
    anchor = pick.screen;
    enterInspect(field, pick.frameIndex);
  };

  restore?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!baseline) return;
    runtime.pause();
    runtime.restore(baseline);
    runtime.clearInspection();
    inspection = null;
    touching = false;
    draftValue = null;
    renderRecipe();
    restore.setAttribute("hidden", "");
    options.onAnchor?.(null);
  });

  const unsubscribe = runtime.subscribe((event) => {
    if (event.type === "inspect") {
      inspection = event.state;
      renderRecipe();
    }
    if (event.type === "frame" || event.type === "run-seek" || event.type === "rebuild" || event.type === "reshape") {
      if (event.type === "reshape") {
        restore?.removeAttribute("hidden");
      }
      if (inspection) positionRecipe();
    }
  });

  captureBaseline();
  renderRecipe();

  return {
    sync() {
      if (inspection) {
        inspection =
          runtime.inspect(inspection.frameIndex, inspection.field, inspection.termId, { replace: true }) ??
          inspection;
        renderRecipe();
      }
    },
    setAnchor(point) {
      anchor = point;
      positionRecipe();
    },
    handleTrajectoryPick,
    enterInspect,
    dispose: () => unsubscribe(),
  };
}
