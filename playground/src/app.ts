import {
  createRuntime,
  defaultParameters,
  formatMetricValue,
  metricKeys,
  type ComputeRuntime,
  type ExperienceSnapshot,
  downloadSnapshot,
  readSnapshotFile,
  readStoredSnapshot,
  writeStoredSnapshot,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { models } from "../../examples";
import "./styles.css";

const registry = createRendererRegistry();

const els = {
  modelSelect: document.querySelector<HTMLSelectElement>("#modelSelect")!,
  reset: document.querySelector<HTMLButtonElement>("#reset")!,
  save: document.querySelector<HTMLButtonElement>("#save")!,
  restore: document.querySelector<HTMLButtonElement>("#restore")!,
  exportBtn: document.querySelector<HTMLButtonElement>("#export")!,
  importBtn: document.querySelector<HTMLButtonElement>("#import")!,
  importFile: document.querySelector<HTMLInputElement>("#importFile")!,
  drawerToggle: document.querySelector<HTMLButtonElement>("#drawerToggle")!,
  drawerBackdrop: document.querySelector<HTMLElement>("#drawerBackdrop")!,
  sidebar: document.querySelector<HTMLElement>("#sidebar")!,
  modelName: document.querySelector<HTMLElement>("#modelName")!,
  modelDesc: document.querySelector<HTMLElement>("#modelDesc")!,
  modelId: document.querySelector<HTMLElement>("#modelId")!,
  params: document.querySelector<HTMLElement>("#params")!,
  metrics: document.querySelector<HTMLElement>("#metrics")!,
  stateCount: document.querySelector<HTMLElement>("#stateCount")!,
  rendererPill: document.querySelector<HTMLElement>("#rendererPill")!,
  viewport: document.querySelector<HTMLElement>("#viewport")!,
  overlay: document.querySelector<HTMLElement>("#rendererOverlay")!,
  scrub: document.querySelector<HTMLInputElement>("#scrub")!,
  play: document.querySelector<HTMLButtonElement>("#play")!,
  time: document.querySelector<HTMLElement>("#time")!,
};

let currentId = Object.keys(models)[0]!;
let runtime: ComputeRuntime | null = null;

function setDrawer(open: boolean) {
  els.sidebar.classList.toggle("open", open);
  els.drawerBackdrop.classList.toggle("open", open);
}

function flash(button: HTMLButtonElement, label: string) {
  const original = button.textContent ?? "";
  button.textContent = label;
  window.setTimeout(() => {
    button.textContent = original;
  }, 900);
}

function renderParams() {
  if (!runtime) return;
  const { manifest } = runtime;
  els.params.replaceChildren();
  for (const parameter of manifest.parameters) {
    const box = document.createElement("div");
    box.className = "param";
    const valueId = `pv-${parameter.id}`;
    box.innerHTML = `
      <div class="param-head">
        <span>${parameter.label}</span>
        <span class="param-value" id="${valueId}"></span>
      </div>
      <input class="range" id="pi-${parameter.id}" type="range" min="${parameter.min}" max="${parameter.max}" step="${parameter.step}" value="${runtime.parameters[parameter.id]}">
    `;
    els.params.appendChild(box);
    const input = box.querySelector("input")!;
    const value = box.querySelector<HTMLElement>(`#${valueId}`)!;
    const fmt = () => {
      const n = Number(runtime!.parameters[parameter.id]);
      const digits = (parameter.step ?? 1) < 0.1 ? 2 : (parameter.step ?? 1) < 1 ? 1 : 0;
      value.textContent = `${n.toFixed(digits)}${parameter.unit ? ` ${parameter.unit}` : ""}`;
    };
    input.addEventListener("input", () => {
      runtime!.setParameters({ [parameter.id]: Number(input.value) });
      fmt();
    });
    fmt();
  }
}

function renderMetrics(frame: { state: Record<string, number>; derived?: Record<string, number> }) {
  if (!runtime) return;
  const keys = metricKeys(runtime.manifest);
  els.metrics.replaceChildren();
  for (const key of keys) {
    const raw = frame.state[key] ?? frame.derived?.[key];
    const metric = document.createElement("div");
    metric.className = "metric";
    metric.innerHTML = `<small>${key}</small><strong>${typeof raw === "number" ? formatMetricValue(key, raw) : "—"}</strong>`;
    els.metrics.appendChild(metric);
  }
}

function syncChrome() {
  if (!runtime) return;
  const { manifest } = runtime;
  els.modelName.textContent = manifest.name;
  els.modelDesc.textContent = manifest.description;
  els.modelId.textContent = manifest.id;
  els.rendererPill.textContent = `renderer: ${manifest.renderer}`;
  els.scrub.max = String(Math.max(0, runtime.timeline.length - 1));
  els.stateCount.textContent = `${runtime.timeline.length} states`;
}

function onRuntimeEvent() {
  if (!runtime) return;
  const frame = runtime.currentFrame();
  if (!frame) return;
  els.scrub.value = String(runtime.currentIndex());
  els.time.textContent = `${frame.t.toFixed(2)} ${runtime.model.time?.unit ?? "s"}`;
  els.play.textContent = runtime.isPlaying() ? "❚❚" : "▶";
  renderMetrics(frame);
}

function attachRuntime(modelId: string, options?: { params?: Record<string, number>; snapshot?: ExperienceSnapshot }) {
  const model = models[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  runtime?.unmount();
  currentId = modelId;

  runtime = createRuntime({
    model,
    rendererRegistry: registry,
    parameters: options?.params ?? defaultParameters(model),
  });

  runtime.subscribe((event) => {
    if (event.type === "rebuild") {
      syncChrome();
      renderParams();
    }
    if (event.type === "parameters") {
      renderParams();
    }
    if (event.type === "frame" || event.type === "rebuild") {
      onRuntimeEvent();
    }
  });

  els.modelSelect.value = modelId;
  syncChrome();
  renderParams();

  runtime.mount({ viewport: els.viewport, overlay: els.overlay });

  if (options?.snapshot) {
    runtime.restore(options.snapshot);
  }
}

for (const model of Object.values(models)) {
  const option = document.createElement("option");
  option.value = model.manifest.id;
  option.textContent = model.manifest.name;
  els.modelSelect.appendChild(option);
}

els.modelSelect.addEventListener("change", () => {
  setDrawer(false);
  attachRuntime(els.modelSelect.value);
});
els.reset.addEventListener("click", () => attachRuntime(currentId));
els.scrub.addEventListener("input", () => runtime?.seekIndex(Number(els.scrub.value)));
els.play.addEventListener("click", () => runtime?.toggle());
els.save.addEventListener("click", () => {
  if (!runtime) return;
  writeStoredSnapshot(runtime.snapshot(false));
  flash(els.save, "Saved");
});
els.restore.addEventListener("click", () => {
  const stored = readStoredSnapshot();
  if (!stored) {
    flash(els.restore, "Empty");
    return;
  }
  if (!models[stored.model]) {
    flash(els.restore, "Invalid");
    return;
  }
  attachRuntime(stored.model, { snapshot: stored });
  flash(els.restore, "Restored");
});
els.exportBtn.addEventListener("click", () => {
  if (!runtime) return;
  downloadSnapshot(runtime.snapshot(true));
});
els.importBtn.addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files?.[0];
  els.importFile.value = "";
  if (!file) return;
  try {
    const snapshot = await readSnapshotFile(file);
    if (!models[snapshot.model]) throw new Error("unknown model");
    attachRuntime(snapshot.model, { snapshot });
    flash(els.importBtn, "Loaded");
  } catch {
    flash(els.importBtn, "Invalid");
  }
});
els.drawerToggle.addEventListener("click", () => setDrawer(!els.sidebar.classList.contains("open")));
els.drawerBackdrop.addEventListener("click", () => setDrawer(false));

window.addEventListener("keydown", (event) => {
  if (!runtime) return;
  const target = event.target;
  const editing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
  if (event.code === "Space") {
    if (target instanceof HTMLButtonElement || editing) return;
    event.preventDefault();
    runtime.toggle();
    return;
  }
  if (editing) return;
  if (event.code === "ArrowLeft") {
    event.preventDefault();
    runtime.pause();
    runtime.step(-1);
  } else if (event.code === "ArrowRight") {
    event.preventDefault();
    runtime.pause();
    runtime.step(1);
  }
});

window.addEventListener("resize", () => runtime?.resize());

attachRuntime(currentId);
