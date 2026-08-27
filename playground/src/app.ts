import {
  createRuntime,
  defaultParameters,
  type ComputeRuntime,
  type ExperienceSnapshot,
  downloadSnapshot,
  readSnapshotFile,
  readStoredSnapshot,
  writeStoredSnapshot,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { mountExperienceUI, type ExperienceHandle } from "@compute-experience/ui";
import { models } from "../../examples";
import "./styles.css";

const registry = createRendererRegistry();

const els = {
  modelSelect: document.querySelector<HTMLSelectElement>("#modelSelect")!,
  fork: document.querySelector<HTMLButtonElement>("#fork")!,
  clearBranch: document.querySelector<HTMLButtonElement>("#clearBranch")!,
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
let experience: ExperienceHandle | null = null;

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

function syncBranchActions() {
  const hasBranch = (runtime?.comparisonRuns.length ?? 0) > 0;
  els.clearBranch.disabled = !hasBranch;
  els.fork.textContent = hasBranch ? "Re-fork" : "Fork";
}

function attachRuntime(modelId: string, options?: { params?: Record<string, number>; snapshot?: ExperienceSnapshot }) {
  const model = models[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  experience?.dispose();
  currentId = modelId;

  runtime = createRuntime({
    model,
    rendererRegistry: registry,
    parameters: options?.params ?? defaultParameters(model),
    syncPlayback: true,
  });

  experience = mountExperienceUI({
    runtime,
    elements: {
      modelName: els.modelName,
      modelDesc: els.modelDesc,
      modelId: els.modelId,
      params: els.params,
      metrics: els.metrics,
      stateCount: els.stateCount,
      rendererPill: els.rendererPill,
      viewport: els.viewport,
      overlay: els.overlay,
      play: els.play,
      scrub: els.scrub,
      time: els.time,
    },
  });

  runtime.subscribe((event) => {
    if (event.type === "run-forked" || event.type === "run-updated" || event.type === "rebuild") {
      syncBranchActions();
    }
  });

  els.modelSelect.value = modelId;
  syncBranchActions();

  if (options?.snapshot) {
    runtime.restore(options.snapshot);
    experience.sync();
    syncBranchActions();
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
els.fork.addEventListener("click", () => {
  if (!runtime) return;
  runtime.pause();
  runtime.clearBranches();
  const index = runtime.currentIndex();
  // Small state nudge so Lorenz (and other state models) visibly diverge after the fork.
  const frame = runtime.currentFrame();
  const nudge: Record<string, number> = {};
  if (frame?.state.x !== undefined) nudge.x = 0.35;
  else {
    const firstKey = Object.keys(frame?.state ?? {})[0];
    if (firstKey) nudge[firstKey] = 0.05 * Math.max(1, Math.abs(frame!.state[firstKey]!));
  }
  runtime.forkAt(index, { label: "branch", nudge });
  runtime.setSyncPlayback(true);
  syncBranchActions();
  flash(els.fork, "Forked");
});
els.clearBranch.addEventListener("click", () => {
  runtime?.clearBranches();
  syncBranchActions();
  flash(els.clearBranch, "Cleared");
});
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
  if (event.code === "KeyF") {
    event.preventDefault();
    els.fork.click();
    return;
  }
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
