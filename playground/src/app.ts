import {
  composeExperience,
  createRuntime,
  defaultParameters,
  resolveExperience,
  type ComputeRuntime,
  type ExperienceContract,
  type ExperienceSnapshot,
  type ModelDefinition,
  downloadSnapshot,
  readSnapshotFile,
  readStoredSnapshot,
  writeStoredSnapshot,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import {
  applyExperienceShell,
  mountExperienceUI,
  type ExperienceHandle,
} from "@compute-experience/ui";
import { models } from "../../examples";
import {
  applyCompileUiState,
  compileConceptForPlayground,
  compileUiStateFromResult,
  compilingUiState,
  createPlaygroundCompilerLLM,
  readPlaygroundCompileEnv,
} from "./compile-entry";
import "./styles.css";

const registry = createRendererRegistry();
const compiledModels: Record<string, ModelDefinition> = {};
const playgroundLlm = createPlaygroundCompilerLLM(readPlaygroundCompileEnv(import.meta.env));

const els = {
  brandSub: document.querySelector<HTMLElement>("#brandSub")!,
  modelSelect: document.querySelector<HTMLSelectElement>("#modelSelect")!,
  sidebarEyebrow: document.querySelector<HTMLElement>("#sidebarEyebrow")!,
  fork: document.querySelector<HTMLButtonElement>("#fork")!,
  clearBranch: document.querySelector<HTMLButtonElement>("#clearBranch")!,
  forkTimeline: document.querySelector<HTMLButtonElement>("#forkTimeline")!,
  clearBranchTimeline: document.querySelector<HTMLButtonElement>("#clearBranchTimeline")!,
  timelineActions: document.querySelector<HTMLElement>("#timelineActions")!,
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
  counterfactualPanel: document.querySelector<HTMLElement>("#counterfactualPanel")!,
  worldPanel: document.querySelector<HTMLElement>("#worldPanel")!,
  metrics: document.querySelector<HTMLElement>("#metrics")!,
  stateCount: document.querySelector<HTMLElement>("#stateCount")!,
  rendererPill: document.querySelector<HTMLElement>("#rendererPill")!,
  divergence: document.querySelector<HTMLButtonElement>("#divergence")!,
  viewport: document.querySelector<HTMLElement>("#viewport")!,
  overlay: document.querySelector<HTMLElement>("#rendererOverlay")!,
  timelineShell: document.querySelector<HTMLElement>("#timelineShell")!,
  scrub: document.querySelector<HTMLInputElement>("#scrub")!,
  play: document.querySelector<HTMLButtonElement>("#play")!,
  time: document.querySelector<HTMLElement>("#time")!,
  worldStage: document.querySelector<HTMLElement>("#worldStage")!,
  worldRecipe: document.querySelector<HTMLElement>("#worldRecipe")!,
  worldParameters: document.querySelector<HTMLElement>("#worldParameters")!,
  worldStateReadout: document.querySelector<HTMLElement>("#worldStateReadout")!,
  worldHint: document.querySelector<HTMLElement>("#worldHint")!,
  worldRestore: document.querySelector<HTMLButtonElement>("#worldRestore")!,
  conceptInput: document.querySelector<HTMLInputElement>("#conceptInput")!,
  compileBtn: document.querySelector<HTMLButtonElement>("#compileBtn")!,
  compileStrip: document.querySelector<HTMLElement>("#compileStrip")!,
  compileStatus: document.querySelector<HTMLElement>("#compileStatus")!,
  compileBadge: document.querySelector<HTMLElement>("#compileBadge")!,
  compileDetail: document.querySelector<HTMLElement>("#compileDetail")!,
};

function resetWorldShell() {
  els.worldRecipe.replaceChildren();
  els.worldRecipe.hidden = true;
  els.worldPanel.replaceChildren();
  els.worldPanel.hidden = true;
  els.worldStateReadout.replaceChildren();
  els.worldStateReadout.hidden = true;
  els.worldHint.replaceChildren();
  els.worldHint.hidden = true;
  els.worldParameters.replaceChildren();
  els.worldParameters.hidden = true;
  els.worldRestore.hidden = true;
  els.divergence.hidden = true;
  els.divergence.replaceChildren();
  els.counterfactualPanel.replaceChildren();
  els.counterfactualPanel.hidden = true;
}

function resolveModel(modelId: string): ModelDefinition | undefined {
  return models[modelId] ?? compiledModels[modelId];
}

function registerCompiledModel(model: ModelDefinition) {
  compiledModels[model.manifest.id] = model;
  const existing = els.modelSelect.querySelector(`option[value="${CSS.escape(model.manifest.id)}"]`);
  const option =
    existing instanceof HTMLOptionElement
      ? existing
      : (() => {
          const created = document.createElement("option");
          created.value = model.manifest.id;
          els.modelSelect.appendChild(created);
          return created;
        })();
  option.textContent = `${model.manifest.name} (compiled)`;
}

let currentId = Object.keys(models)[0]!;
let runtime: ComputeRuntime | null = null;
let experience: ExperienceHandle | null = null;
let contract: ExperienceContract | null = null;

function handleFork() {
  if (!runtime || !contract?.capabilities.fork || !experience?.counterfactual) return;
  if (!experience.counterfactual.beginForkAtCursor()) return;
  syncBranchActions();
  flash(els.forkTimeline, "Forked");
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

function syncBranchActions() {
  const hasBranch = (runtime?.comparisonRuns.length ?? 0) > 0;
  const composition = contract ? composeExperience(contract) : null;
  const canFork = (contract?.capabilities.fork ?? false) && !composition?.traceLens;
  const forkLabel = hasBranch ? "Re-fork" : "Fork";

  els.clearBranch.disabled = !hasBranch;
  els.clearBranchTimeline.disabled = !hasBranch;

  for (const button of [els.fork, els.forkTimeline]) {
    button.hidden = !canFork;
    button.textContent = forkLabel;
  }
  for (const button of [els.clearBranch, els.clearBranchTimeline]) {
    button.hidden = !canFork;
  }

  els.timelineActions.hidden = !canFork;
}

function syncManifestChrome(exp: ExperienceContract) {
  const composition = composeExperience(exp);
  els.sidebarEyebrow.textContent = composition.manifestPanel ? "Model manifest" : exp.label;
  els.params.hidden = !composition.manifestPanel;
  els.metrics.hidden = !composition.manifestPanel;
  els.counterfactualPanel.hidden = true;
  els.drawerToggle.hidden = !composition.manifestPanel;
  els.compileStrip.hidden = composition.traceLens;
  els.worldStateReadout.hidden = !composition.worldReadout;
}

function attachModel(model: ModelDefinition, options?: { params?: Record<string, number>; snapshot?: ExperienceSnapshot }) {
  experience?.dispose();
  resetWorldShell();
  currentId = model.manifest.id;
  contract = resolveExperience(model);

  applyExperienceShell(contract, {
    brandSub: els.brandSub,
    worldParameters: els.worldParameters,
    worldStateReadout: els.worldStateReadout,
    worldPanel: els.worldPanel,
    fork: els.fork,
    clearBranch: els.clearBranch,
  });
  syncManifestChrome(contract);

  runtime = createRuntime({
    model,
    rendererRegistry: registry,
    parameters: options?.params ?? defaultParameters(model),
    syncPlayback: true,
  });

  const composition = composeExperience(contract);
  const branchPanelHost = composition.branchPanel ? els.worldPanel : els.counterfactualPanel;

  experience = mountExperienceUI({
    runtime,
    contract,
    elements: {
      modelName: els.modelName,
      modelDesc: els.modelDesc,
      modelId: els.modelId,
      params: els.params,
      metrics: els.metrics,
      world: composition.worldShell
        ? {
            stage: els.worldStage,
            stateReadout: composition.worldReadout ? els.worldStateReadout : undefined,
            parameters: els.worldParameters,
            recipe: els.worldRecipe,
            restore: composition.showRestore ? els.worldRestore : undefined,
            panel: els.worldPanel,
            hint: els.worldHint,
          }
        : undefined,
      counterfactual: composition.branchPanel
        ? {
            panel: branchPanelHost,
            timeline: els.timelineShell.querySelector(".scrub-wrap")!,
            scrub: els.scrub,
            divergence: els.divergence,
            hint: composition.worldShell ? els.worldHint : undefined,
          }
        : undefined,
      stateCount: composition.worldShell ? undefined : els.stateCount,
      rendererPill: composition.worldShell ? undefined : els.rendererPill,
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

  els.modelSelect.value = currentId;
  syncBranchActions();

  if (options?.snapshot) {
    runtime.restore(options.snapshot);
    experience.sync();
    syncBranchActions();
  } else if (contract.options?.autoPlay && !composition.traceLens) {
    runtime.play();
  } else if (composition.traceLens) {
    runtime.pause();
    runtime.seekIndex(Math.floor(runtime.timeline.length * 0.35));
    els.worldHint.hidden = false;
  }
}

function attachRuntime(modelId: string, options?: { params?: Record<string, number>; snapshot?: ExperienceSnapshot }) {
  const model = resolveModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);
  attachModel(model, options);
}

let compileGeneration = 0;

async function compileAndExplore() {
  const concept = els.conceptInput.value;
  const generation = ++compileGeneration;
  applyCompileUiState(compilingUiState(), {
    statusRoot: els.compileStatus,
    badge: els.compileBadge,
    detail: els.compileDetail,
    submit: els.compileBtn,
    input: els.conceptInput,
  });

  const result = await compileConceptForPlayground(concept, playgroundLlm);
  if (generation !== compileGeneration) return;

  applyCompileUiState(compileUiStateFromResult(result), {
    statusRoot: els.compileStatus,
    badge: els.compileBadge,
    detail: els.compileDetail,
    submit: els.compileBtn,
    input: els.conceptInput,
  });

  if (!result.model) return;

  registerCompiledModel(result.model);
  setDrawer(false);
  attachModel(result.model);
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
els.compileBtn.addEventListener("click", () => {
  void compileAndExplore();
});
els.conceptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void compileAndExplore();
  }
});
function handleClearBranch() {
  runtime?.clearBranches();
  syncBranchActions();
  experience?.sync();
  flash(els.clearBranchTimeline, "Cleared");
}

els.reset.addEventListener("click", () => attachRuntime(currentId));
els.fork.addEventListener("click", handleFork);
els.forkTimeline.addEventListener("click", handleFork);
els.clearBranch.addEventListener("click", handleClearBranch);
els.clearBranchTimeline.addEventListener("click", handleClearBranch);
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
  if (!resolveModel(stored.model)) {
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
    if (!resolveModel(snapshot.model)) throw new Error("unknown model");
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
  if (event.code === "KeyF" && contract?.capabilities.fork && !composeExperience(contract).traceLens) {
    event.preventDefault();
    handleFork();
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
