import type { ExperienceComposition, ExperienceContract } from "@compute-experience/core";
import { composeExperience } from "@compute-experience/core";

export interface ExperienceShellElements {
  brandSub?: HTMLElement;
  worldParameters?: HTMLElement;
  worldStateReadout?: HTMLElement;
  worldPanel?: HTMLElement;
  fork?: HTMLElement;
  clearBranch?: HTMLElement;
}

/** Apply document-level shell from semantic composition (not profile names). */
export function applyExperienceShell(
  contract: ExperienceContract,
  elements: ExperienceShellElements = {},
): void {
  const composition = composeExperience(contract);
  const body = document.body;

  body.classList.toggle("mode-world", composition.worldShell);
  body.classList.toggle("mode-trace-lens", composition.traceLens);
  body.dataset.experienceWorld = contract.world;
  if (contract.profile) body.dataset.experiencePreset = contract.profile;
  else delete body.dataset.experiencePreset;

  if (elements.brandSub) {
    elements.brandSub.textContent =
      contract.options?.intervention && composition.branchPanel
        ? "Pause · Fork · change one value · Continue"
        : composition.traceLens
          ? "Click the path · ask why"
          : contract.label;
  }

  document.title = composition.traceLens
    ? contract.label
    : `Compute Experience — ${contract.label}`;

  if (elements.worldParameters) {
    elements.worldParameters.hidden = !composition.showParameters;
  }
  if (elements.worldStateReadout) {
    elements.worldStateReadout.hidden = !composition.worldShell;
  }
  if (elements.worldPanel) {
    elements.worldPanel.hidden = !composition.branchPanel;
  }

  const showFork = contract.capabilities.fork;
  if (elements.fork) elements.fork.hidden = !showFork;
  if (elements.clearBranch) elements.clearBranch.hidden = !showFork;
}

export function clearExperienceShell(): void {
  const body = document.body;
  body.classList.remove("mode-world", "mode-trace-lens", "mode-microscope");
  delete body.dataset.experiencePreset;
  delete body.dataset.experienceWorld;
  delete body.dataset.experienceProfile;
}

/** @deprecated Use applyExperienceShell with composeExperience semantics. */
export function compositionFromContract(contract: ExperienceContract): ExperienceComposition {
  return composeExperience(contract);
}
