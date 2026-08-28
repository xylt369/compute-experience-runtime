import type { ComputeRuntime, InspectionState, TraceOperandRow } from "@compute-experience/core";
import {
  findTraceTerm,
  inspectionEditTarget,
  referenceTarget,
  traceOperandRows,
} from "@compute-experience/core";

export interface InspectorElements {
  panel: HTMLElement;
  stateFields?: HTMLElement;
  lens?: HTMLElement;
}

export interface InspectorOptions {
  runtime: ComputeRuntime;
  elements: InspectorElements;
  onFocus?: () => void;
}

export interface InspectorHandle {
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

function equationTitle(trace: InspectionState["trace"], field: string, unit: string): string {
  if (trace.initial) return `${field}(t₀)`;
  return `${field}(t+Δt)`;
}

function equationExpression(trace: InspectionState["trace"], field: string): string {
  if (trace.initial) return `${field}₀ = initial`;
  if (field === "x") return `${field}(t+Δt) = ${field}(t) + σ(y(t) − x(t)) · Δt`;
  if (field === "y") return `${field}(t+Δt) = ${field}(t) + (x(t)(ρ − z(t)) − y(t)) · Δt`;
  if (field === "z") return `${field}(t+Δt) = ${field}(t) + (x(t)·y(t) − β·z(t)) · Δt`;
  return trace.formula;
}

function operandTimeLabel(trace: InspectionState["trace"], row: TraceOperandRow): string {
  if (row.ref?.kind === "dt") return "Δt";
  if (row.ref?.kind === "parameter") return row.label;
  if (trace.initial) return "t₀";
  return `${row.label}(t)`;
}

export function bindInspectorUI(options: InspectorOptions): InspectorHandle {
  const { runtime, elements } = options;
  let inspection: InspectionState | null = null;
  let draftValue: number | null = null;
  let editing = false;

  const openFocus = () => options.onFocus?.();

  const syncStateFields = () => {
    if (!elements.stateFields) return;
    const frame = runtime.currentFrame();
    if (!frame) {
      elements.stateFields.replaceChildren();
      return;
    }
    elements.stateFields.innerHTML = runtime.manifest.state
      .map((key) => {
        const value = frame.state[key];
        const active =
          inspection?.field === key && inspection.frameIndex === runtime.currentIndex();
        return `<button type="button" class="state-field${active ? " is-active" : ""}" data-field="${key}">
          <span class="state-field-key">${key}</span>
          <span class="state-field-val">${typeof value === "number" ? fmt(value) : "—"}</span>
        </button>`;
      })
      .join("");
    elements.stateFields.querySelectorAll<HTMLButtonElement>(".state-field").forEach((btn) => {
      btn.addEventListener("click", () => {
        runtime.pause();
        const field = btn.dataset.field!;
        draftValue = runtime.currentFrame()?.state[field] ?? null;
        editing = false;
        inspection = runtime.inspect(runtime.currentIndex(), field, null, { replace: true });
        openFocus();
        render();
      });
    });
  };

  const renderLens = () => {
    if (!elements.lens) return;
    if (!inspection) {
      elements.lens.hidden = true;
      elements.lens.replaceChildren();
      return;
    }
    const unit = runtime.model.time?.unit ?? "s";
    elements.lens.hidden = false;
    elements.lens.innerHTML = `
      <span class="lens-kicker">inside</span>
      <span class="lens-field">${inspection.field}</span>
      <span class="lens-time">t = ${inspection.trace.time.toFixed(2)}${unit}</span>
    `;
  };

  const renderPanel = () => {
    elements.panel.replaceChildren();
    renderLens();

    if (!inspection) {
      elements.panel.innerHTML = `
        <div class="inspector-empty">
          <div class="inspector-kicker">Computation</div>
          <p class="branch-hint">Click <strong>x</strong>, <strong>y</strong>, or <strong>z</strong> above the trajectory to enter the computation.</p>
        </div>`;
      return;
    }

    const { trace, navigation, frameIndex, field, termId, value } = inspection;
    const unit = runtime.model.time?.unit ?? "s";
    const editTarget = inspectionEditTarget(trace, field, termId);
    const editValue =
      draftValue ??
      runtime.primaryRun.timeline.frames[editTarget.frameIndex]?.state[editTarget.field] ??
      value;
    const focusTerm = termId ? findTraceTerm(trace.result, termId) : trace.result;
    const title = focusTerm?.label ?? field;
    const rows = traceOperandRows(trace, termId);

    const crumbs =
      navigation.length > 1
        ? `<nav class="trace-crumbs" aria-label="Inspection history">${navigation
            .map(
              (item, index) =>
                `<button type="button" class="trace-crumb" data-crumb="${index}">${item.label}</button>`,
            )
            .join('<span class="trace-crumb-sep">→</span>')}</nav>`
        : "";

    const operandRows = rows
      .map((row) => {
        const navigable = row.ref && referenceTarget(row.ref);
        const navAttrs = navigable
          ? `data-nav="1" data-frame="${navigable.frameIndex}" data-field="${navigable.field}"`
          : "";
        const termAttrs = row.termId ? `data-term="${row.termId}"` : "";
        const clickable = navigable || row.termId ? " is-clickable" : "";
        return `<button type="button" class="eq-operand${clickable}" ${navAttrs} ${termAttrs}>
          <span class="eq-operand-label">${operandTimeLabel(trace, row)}</span>
          <span class="eq-operand-value">${fmt(row.value)}</span>
        </button>`;
      })
      .join("");

    const editBlock = editing
      ? `<div class="eq-edit open">
          <div class="eq-edit-head">
            <span>${editTarget.field}(t = ${editTarget.time.toFixed(2)}${unit})</span>
          </div>
          <input class="trace-edit" type="number" step="any" value="${editValue}">
          <div class="eq-edit-actions">
            <button type="button" class="control control-accent trace-replay">Replay</button>
            <button type="button" class="control control-ghost trace-cancel">Cancel</button>
          </div>
        </div>`
      : `<button type="button" class="eq-edit-toggle">Edit ${editTarget.field}(t = ${editTarget.time.toFixed(2)}${unit}) = ${fmt(editValue)}</button>`;

    elements.panel.innerHTML = `
      <div class="trace-panel">
        ${crumbs}
        <div class="eq-block">
          <div class="eq-head">
            <span class="eq-result-label">${title}</span>
            <span class="eq-result-value">${fmt(focusTerm?.value ?? value)}</span>
          </div>
          <div class="eq-expression">${equationExpression(trace, field)}</div>
          <div class="eq-substituted">
            <div class="eq-line">
              <span class="eq-line-label">${equationTitle(trace, field, unit)}</span>
              <span class="eq-line-value">= ${fmt(focusTerm?.value ?? value)}</span>
            </div>
            ${operandRows}
          </div>
        </div>
        <div class="eq-meta">frame ${frameIndex} · t = ${trace.time.toFixed(2)}${unit} · Δt = ${trace.dt}${unit}</div>
        ${editBlock}
        ${navigation.length > 1 ? `<button type="button" class="control control-ghost trace-back">← Back</button>` : ""}
      </div>`;

    elements.panel.querySelectorAll<HTMLButtonElement>(".eq-operand.is-clickable").forEach((btn) => {
      btn.addEventListener("click", () => {
        editing = false;
        if (btn.dataset.term) {
          inspection = runtime.inspect(frameIndex, field, btn.dataset.term, { push: true });
          render();
          return;
        }
        if (btn.dataset.nav) {
          const refFrame = Number(btn.dataset.frame);
          const refField = btn.dataset.field!;
          draftValue = runtime.primaryRun.timeline.frames[refFrame]?.state[refField] ?? null;
          inspection = runtime.inspect(refFrame, refField, null, { push: true, seek: true });
          render();
          syncStateFields();
        }
      });
    });

    elements.panel.querySelectorAll<HTMLButtonElement>(".trace-crumb").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetIndex = Number(btn.dataset.crumb);
        editing = false;
        let current = inspection;
        while (current && current.navigation.length > targetIndex + 1) {
          current = runtime.inspectionBack();
        }
        if (current) {
          draftValue = current.value;
          inspection = current;
        }
        render();
        syncStateFields();
      });
    });

    elements.panel.querySelector(".eq-edit-toggle")?.addEventListener("click", () => {
      editing = true;
      render();
    });

    elements.panel.querySelector(".trace-cancel")?.addEventListener("click", () => {
      editing = false;
      draftValue = null;
      render();
    });

    const editInput = elements.panel.querySelector<HTMLInputElement>(".trace-edit");
    editInput?.addEventListener("input", () => {
      draftValue = Number(editInput.value);
    });

    elements.panel.querySelector(".trace-replay")?.addEventListener("click", () => {
      const value = Number(editInput?.value ?? editValue);
      if (!Number.isFinite(value)) return;
      runtime.intervene({ frameIndex: editTarget.frameIndex, field: editTarget.field, value });
      draftValue = value;
      editing = false;
      inspection = runtime.inspect(editTarget.frameIndex, editTarget.field, null, {
        replace: true,
        seek: true,
      });
      render();
      syncStateFields();
      runtime.play();
    });

    elements.panel.querySelector(".trace-back")?.addEventListener("click", () => {
      editing = false;
      inspection = runtime.inspectionBack();
      draftValue = inspection?.value ?? null;
      render();
      syncStateFields();
    });
  };

  const render = () => {
    renderPanel();
    syncStateFields();
  };

  const sync = () => {
    if (inspection) {
      inspection =
        runtime.inspect(inspection.frameIndex, inspection.field, inspection.termId, { replace: true }) ??
        inspection;
      render();
    } else {
      syncStateFields();
    }
  };

  const unsubscribe = runtime.subscribe((event) => {
    if (event.type === "inspect") {
      inspection = event.state;
      render();
    }
    if (event.type === "frame" || event.type === "run-seek") {
      syncStateFields();
      renderLens();
    }
    if (event.type === "rebuild" || event.type === "reshape") {
      syncStateFields();
    }
  });

  syncStateFields();
  renderPanel();

  return {
    sync,
    dispose: () => unsubscribe(),
  };
}
