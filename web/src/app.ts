import "./styles.css";
import type { ModelDefinition, ModelFrame, ModelManifest } from "../../runtime/model.schema";
import { ModelPlayer } from "../../runtime/player";
import { rendererFor, type RuntimeRenderer } from "../../runtime/renderer.registry";
import { simulate } from "../../runtime/simulate";
import { models } from "./models";
import { createRendererRegistry } from "./renderers/register";
import {
  downloadSnapshot,
  makeSnapshot,
  readSnapshotFile,
  readStoredSnapshot,
  writeStoredSnapshot,
} from "./snapshot";

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

const registry = createRendererRegistry();
const catalog = models;

let currentId = Object.keys(catalog)[0]!;
let params: Record<string, number> = {};
let initialOverride: Record<string, number> | null = null;
let activeRenderer: RuntimeRenderer<ModelFrame, ModelManifest> | null = null;
let mountedModelId = "";

const player = new ModelPlayer((frame, index) => {
  applyFrame(frame, index);
});

function currentModel(): ModelDefinition {
  const model = catalog[currentId];
  if (!model) throw new Error(`Unknown model: ${currentId}`);
  return model;
}

function defaultParams(model: ModelDefinition): Record<string, number> {
  return Object.fromEntries(
    model.manifest.parameters.map((parameter) => [parameter.id, Number(parameter.default)]),
  );
}

function formatMetric(key: string, value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (key.toLowerCase().includes("fraction") && value >= 0 && value <= 1) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

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
  const model = currentModel();
  els.params.replaceChildren();
  for (const parameter of model.manifest.parameters) {
    const box = document.createElement("div");
    box.className = "param";
    const valueId = `pv-${parameter.id}`;
    box.innerHTML = `
      <div class="param-head">
        <span>${parameter.label}</span>
        <span class="param-value" id="${valueId}"></span>
      </div>
      <input class="range" id="pi-${parameter.id}" type="range" min="${parameter.min}" max="${parameter.max}" step="${parameter.step}" value="${params[parameter.id]}">
    `;
    els.params.appendChild(box);
    const input = box.querySelector("input")!;
    const value = box.querySelector<HTMLElement>(`#${valueId}`)!;
    const fmt = () => {
      const n = Number(params[parameter.id]);
      const digits = (parameter.step ?? 1) < 0.1 ? 2 : (parameter.step ?? 1) < 1 ? 1 : 0;
      value.textContent = `${n.toFixed(digits)}${parameter.unit ? ` ${parameter.unit}` : ""}`;
    };
    input.addEventListener("input", () => {
      params[parameter.id] = Number(input.value);
      initialOverride = null;
      fmt();
      rebuild();
    });
    fmt();
  }
}

function renderMetrics(frame: ModelFrame) {
  const model = currentModel();
  const keys = [...model.manifest.state, ...(model.manifest.derived ?? [])];
  els.metrics.replaceChildren();
  for (const key of keys) {
    const raw = frame.state[key] ?? frame.derived?.[key];
    const metric = document.createElement("div");
    metric.className = "metric";
    metric.innerHTML = `<small>${key}</small><strong>${typeof raw === "number" ? formatMetric(key, raw) : "—"}</strong>`;
    els.metrics.appendChild(metric);
  }
}

function bindRenderer(model: ModelDefinition) {
  const next = rendererFor(model.manifest, registry);
  if (activeRenderer === next && mountedModelId === model.manifest.id) return;
  activeRenderer?.unmount();
  activeRenderer = next;
  mountedModelId = model.manifest.id;
  els.viewport.replaceChildren();
  els.overlay.replaceChildren();
  activeRenderer.mount(els.viewport, {
    overlay: els.overlay,
    onParams: (patch) => {
      Object.assign(params, patch);
      renderParams();
    },
    onInitialState: (state) => {
      initialOverride = state;
      rebuild();
    },
  });
}

function pushView(frame: ModelFrame, index: number) {
  const model = currentModel();
  activeRenderer?.update({
    frame,
    frames: player.allFrames,
    cursor: index,
    trail: 1,
    manifest: model.manifest,
    params,
  });
}

function applyFrame(frame: ModelFrame, index: number) {
  els.scrub.value = String(index);
  els.time.textContent = `${frame.t.toFixed(2)} ${currentModel().time?.unit ?? "s"}`;
  els.play.textContent = player.isPlaying ? "❚❚" : "▶";
  renderMetrics(frame);
  pushView(frame, index);
}

function rebuild(cursor?: number) {
  const model = currentModel();
  const frames = simulate(model, params, { initial: initialOverride ?? undefined });
  player.setPlaybackRate(model.time?.playbackRate ?? 1);
  player.load(frames);
  const last = Math.max(0, frames.length - 1);
  els.scrub.max = String(last);
  els.stateCount.textContent = `${frames.length} states`;
  const fallback = initialOverride ? 0 : last;
  player.seekIndex(cursor === undefined ? fallback : Math.min(Math.max(0, cursor), last));
}

function setModel(id: string, options?: { params?: Record<string, number>; cursor?: number; frames?: ModelFrame[] }) {
  if (!catalog[id]) throw new Error(`Unknown model: ${id}`);
  currentId = id;
  const model = currentModel();
  params = options?.params ? { ...defaultParams(model), ...options.params } : defaultParams(model);
  initialOverride = null;
  els.modelSelect.value = id;
  els.modelName.textContent = model.manifest.name;
  els.modelDesc.textContent = model.manifest.description;
  els.modelId.textContent = model.manifest.id;
  els.rendererPill.textContent = `renderer: ${model.manifest.renderer}`;
  renderParams();
  bindRenderer(model);
  if (options?.frames?.length) {
    player.setPlaybackRate(model.time?.playbackRate ?? 1);
    player.load(options.frames);
    els.scrub.max = String(Math.max(0, options.frames.length - 1));
    els.stateCount.textContent = `${options.frames.length} states`;
    player.seekIndex(options.cursor ?? 0);
  } else {
    rebuild(options?.cursor);
  }
}

function snapshotNow(includeFrames: boolean) {
  return makeSnapshot(currentId, params, player.index, includeFrames ? player.allFrames : undefined);
}

function applySnapshot(snapshot: ReturnType<typeof snapshotNow>) {
  if (!catalog[snapshot.model]) throw new Error(`Unknown model: ${snapshot.model}`);
  setModel(snapshot.model, {
    params: snapshot.params,
    cursor: snapshot.cursor,
    frames: snapshot.frames,
  });
}

for (const model of Object.values(catalog)) {
  const option = document.createElement("option");
  option.value = model.manifest.id;
  option.textContent = model.manifest.name;
  els.modelSelect.appendChild(option);
}

els.modelSelect.addEventListener("change", () => {
  setDrawer(false);
  setModel(els.modelSelect.value);
});
els.reset.addEventListener("click", () => setModel(currentId));
els.scrub.addEventListener("input", () => player.seekIndex(Number(els.scrub.value)));
els.play.addEventListener("click", () => player.toggle());
els.save.addEventListener("click", () => {
  writeStoredSnapshot(snapshotNow(false));
  flash(els.save, "Saved");
});
els.restore.addEventListener("click", () => {
  const stored = readStoredSnapshot();
  if (!stored) {
    flash(els.restore, "Empty");
    return;
  }
  try {
    applySnapshot(stored);
    flash(els.restore, "Restored");
  } catch {
    flash(els.restore, "Invalid");
  }
});
els.exportBtn.addEventListener("click", () => downloadSnapshot(snapshotNow(true)));
els.importBtn.addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files?.[0];
  els.importFile.value = "";
  if (!file) return;
  try {
    applySnapshot(await readSnapshotFile(file));
    flash(els.importBtn, "Loaded");
  } catch {
    flash(els.importBtn, "Invalid");
  }
});
els.drawerToggle.addEventListener("click", () => setDrawer(!els.sidebar.classList.contains("open")));
els.drawerBackdrop.addEventListener("click", () => setDrawer(false));

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const editing =
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
  if (event.code === "Space") {
    if (target instanceof HTMLButtonElement || editing) return;
    event.preventDefault();
    player.toggle();
    return;
  }
  if (editing) return;
  if (event.code === "ArrowLeft") {
    event.preventDefault();
    player.pause();
    player.step(-1);
  } else if (event.code === "ArrowRight") {
    event.preventDefault();
    player.pause();
    player.step(1);
  }
});

window.addEventListener("resize", () => activeRenderer?.resize?.());

setModel(currentId);
