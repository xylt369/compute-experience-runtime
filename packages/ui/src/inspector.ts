import type { ComputeRuntime, InspectionState, TraceReference, TraceTerm } from "@compute-experience/core";
import { findTraceTerm, flattenInspectableTerms } from "@compute-experience/core";

export interface InspectorElements {
  panel: HTMLElement;
  stateFields?: HTMLElement;
}

export interface InspectorOptions {
  runtime: ComputeRuntime;
  elements: InspectorElements;
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

function renderTermRow(term: TraceTerm, activeId: string | null): string {
  const active = term.id === activeId ? " is-active" : "";
  return `<button type="button" class="trace-term${active}" data-term="${term.id}">
    <span class="trace-term-label">${term.label}</span>
    <span class="trace-term-value">${fmt(term.value)}</span>
  </button>`;
}

function renderRefRow(ref: TraceReference): string {
  const navigable = ref.frameIndex != null && ref.field;
  const cls = navigable ? "trace-ref is-nav" : "trace-ref";
  return `<button type="button" class="${cls}" data-ref="${ref.id}" ${navigable ? `data-frame="${ref.frameIndex}" data-field="${ref.field}"` : ""}>
    <span class="trace-ref-label">${ref.label}</span>
    <span class="trace-ref-value">${fmt(ref.value)}</span>
  </button>`;
}

export function bindInspectorUI(options: InspectorOptions): InspectorHandle {
  const { runtime, elements } = options;
  let inspection: InspectionState | null = null;
  let draftValue: number | null = null;

  const editableTarget = (state: InspectionState) => {
    if (state.trace.initial) {
      return { frameIndex: state.frameIndex, field: state.field };
    }
    const ref = state.termId ? findTraceTerm(state.trace.result, state.termId) : null;
    if (ref?.refs?.[0]?.frameIndex != null && ref.refs[0].field) {
      return { frameIndex: ref.refs[0].frameIndex, field: ref.refs[0].field };
    }
    return { frameIndex: Math.max(0, state.frameIndex - 1), field: state.field };
  };

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
        const active = inspection?.field === key && inspection.frameIndex === runtime.currentIndex();
        return `<button type="button" class="state-field${active ? " is-active" : ""}" data-field="${key}">
          <span class="state-field-key">${key}</span>
          <span class="state-field-val">${typeof value === "number" ? fmt(value) : "—"}</span>
        </button>`;
      })
      .join("");
    elements.stateFields.querySelectorAll<HTMLButtonElement>(".state-field").forEach((btn) => {
      btn.addEventListener("click", () => {
        const field = btn.dataset.field!;
        draftValue = runtime.currentFrame()?.state[field] ?? null;
        inspection = runtime.inspect(runtime.currentIndex(), field, null);
        renderPanel();
        syncStateFields();
      });
    });
  };

  const renderPanel = () => {
    elements.panel.replaceChildren();
    if (!inspection) {
      elements.panel.innerHTML = `
        <div class="inspector-empty">
          <div class="inspector-kicker">Computational inspector</div>
          <p class="branch-hint">Select a state value to see how it was computed, trace ancestors, and replay after an intervention.</p>
        </div>`;
      return;
    }

    const { trace, navigation, frameIndex, field, termId } = inspection;
    const unit = runtime.model.time?.unit ?? "s";
    const editTarget = editableTarget(inspection);
    const editValue =
      draftValue ??
      runtime.primaryRun.timeline.frames[editTarget.frameIndex]?.state[editTarget.field] ??
      trace.result.value;

    const crumbs =
      navigation.length > 1
        ? `<div class="trace-crumbs">${navigation
            .map((item) => `<span class="trace-crumb">${item.label}</span>`)
            .join('<span class="trace-crumb-sep">←</span>')}</div>`
        : "";

    const focusTerm = termId ? findTraceTerm(trace.result, termId) : trace.result;
    const terms = focusTerm ? flattenInspectableTerms(trace.result, termId) : [trace.result];
    const termBlock = terms.map((term) => renderTermRow(term, termId)).join("");

    const refs = (focusTerm?.refs ??
      focusTerm?.children?.flatMap((child) => child.refs ?? []) ??
      []) as TraceReference[];
    const refBlock = refs.length
      ? `<div class="trace-refs">${refs.map((ref) => renderRefRow(ref)).join("")}</div>`
      : "";

    elements.panel.innerHTML = `
      <div class="trace-panel">
        ${crumbs}
        <div class="inspector-kicker">Why this value?</div>
        <div class="trace-formula">${trace.formula}</div>
        <div class="inspector-time">frame ${frameIndex} · t = ${trace.time.toFixed(2)}${unit}</div>
        <div class="trace-focus">
          <span class="trace-focus-field">${field}</span>
          <span class="trace-focus-value">${fmt(inspection.value)}</span>
        </div>
        <div class="trace-terms">${termBlock}</div>
        ${refBlock}
        <div class="intervention-block">
          <div class="intervention-kicker">Intervene</div>
          <label class="epsilon-label">${editTarget.field} @ frame ${editTarget.frameIndex}</label>
          <input class="trace-edit" type="number" step="any" value="${editValue}">
          <button type="button" class="control control-accent trace-replay">Apply &amp; replay</button>
        </div>
        ${navigation.length > 1 ? `<button type="button" class="control control-ghost trace-back">← Back</button>` : ""}
      </div>`;

    elements.panel.querySelectorAll<HTMLButtonElement>(".trace-term").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.term!;
        inspection = runtime.inspect(frameIndex, field, id, { push: true });
        renderPanel();
      });
    });

    elements.panel.querySelectorAll<HTMLButtonElement>(".trace-ref.is-nav").forEach((btn) => {
      btn.addEventListener("click", () => {
        const refFrame = Number(btn.dataset.frame);
        const refField = btn.dataset.field!;
        draftValue = runtime.primaryRun.timeline.frames[refFrame]?.state[refField] ?? null;
        inspection = runtime.inspect(refFrame, refField, null, { push: true });
        renderPanel();
        syncStateFields();
      });
    });

    const editInput = elements.panel.querySelector<HTMLInputElement>(".trace-edit")!;
    editInput.addEventListener("input", () => {
      draftValue = Number(editInput.value);
    });

    elements.panel.querySelector(".trace-replay")?.addEventListener("click", () => {
      const value = Number(editInput.value);
      if (!Number.isFinite(value)) return;
      runtime.intervene({ frameIndex: editTarget.frameIndex, field: editTarget.field, value });
      draftValue = value;
      inspection = runtime.inspect(runtime.currentIndex(), editTarget.field, null, { replace: true });
      renderPanel();
      syncStateFields();
      runtime.play();
    });

    elements.panel.querySelector(".trace-back")?.addEventListener("click", () => {
      inspection = runtime.inspectionBack();
      draftValue = inspection?.value ?? null;
      renderPanel();
      syncStateFields();
    });
  };

  const sync = () => {
    syncStateFields();
    if (inspection) {
      inspection =
        runtime.inspect(inspection.frameIndex, inspection.field, inspection.termId, { replace: true }) ??
        inspection;
      renderPanel();
    }
  };

  const unsubscribe = runtime.subscribe((event) => {
    if (event.type === "inspect") {
      inspection = event.state;
      renderPanel();
    }
    if (
      event.type === "frame" ||
      event.type === "rebuild" ||
      event.type === "run-seek" ||
      event.type === "reshape"
    ) {
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
