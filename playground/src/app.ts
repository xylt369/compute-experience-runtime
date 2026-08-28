import {
  composeExperience,
  createRuntime,
  defaultParameters,
  resolveExperience,
  type ComputeRuntime,
  type ExperienceContract,
  type ExperienceSnapshot,
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
import "./styles.css";

const registry = createRendererRegistry();

const els = {
  brandSub: document.querySelector<HTMLElement>("#brandSub")!,
  modelSelect: document.querySelector<HTMLSelectElement>("#modelSelect")!,
  sidebarEyebrow: document.querySelector<HTMLElement>("#sidebarEyebrow")!,
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

let currentId = Object.keys(models)[0]!;
let runtime: ComputeRuntime | null = null;
let experience: ExperienceHandle | null = null;
let contract: ExperienceContract | null = null;

function applyForkIntervention() {
  const intervention = contract?.options?.intervention;
  if (!intervention || !experience?.counterfactual) return;
  if (intervention.mode === "parameter" && intervention.forkValue != null) {
    experience.counterfactual.applyIntervention(intervention.forkValue);
    return;
  }
  if (intervention.mode === "state") {
    experience.counterfactual.applyIntervention(intervention.defaultEpsilon ?? 1e-8);
  }
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
  const canFork = contract?.capabilities.fork ?? false;
  els.clearBranch.disabled = !hasBranch;
  els.fork.hidden = !canFork;
  els.clearBranch.hidden = !canFork;
  els.fork.textContent = hasBranch ? "Re-fork" : "Fork";
}

function syncManifestChrome(exp: ExperienceContract) {
  const composition = composeExperience(exp);
  els.sidebarEyebrow.textContent = composition.manifestPanel ? "Model manifest" : exp.label;
  els.params.hidden = !composition.manifestPanel;
  els.metrics.hidden = !composition.manifestPanel;
  els.counterfactualPanel.hidden = true;
  els.drawerToggle.hidden = !composition.manifestPanel;
}

function attachRuntime(modelId: string, options?: { params?: Record<string, number>; snapshot?: ExperienceSnapshot }) {
  const model = models[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  experience?.dispose();
  resetWorldShell();
  currentId = modelId;
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
            stateReadout: els.worldStateReadout,
            parameters: els.worldParameters,
            recipe: els.worldRecipe,
            restore: els.worldRestore,
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

  els.modelSelect.value = modelId;
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
  if (!runtime || !contract?.capabilities.fork) return;
  runtime.pause();
  const index = runtime.currentIndex();
  runtime.forkAt(index);
  applyForkIntervention();
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
  if (event.code === "KeyF" && contract?.capabilities.fork) {
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
