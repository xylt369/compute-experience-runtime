import type { ExperienceContract } from "@compute-experience/core";

export interface ExperienceShellElements {
  brandSub?: HTMLElement;
  worldParameters?: HTMLElement;
  worldStateReadout?: HTMLElement;
  worldPanel?: HTMLElement;
  fork?: HTMLElement;
  clearBranch?: HTMLElement;
}

/** Apply document-level shell from experience contract (not DOM structure). */
export function applyExperienceShell(
  contract: ExperienceContract,
  elements: ExperienceShellElements = {},
): void {
  const body = document.body;
  const isWorld = contract.profile !== "manifest";

  body.classList.toggle("mode-world", isWorld);
  body.classList.toggle("mode-microscope", contract.profile === "microscope");
  body.dataset.experienceProfile = contract.profile;
  body.dataset.experienceWorld = contract.world;

  if (elements.brandSub) {
    elements.brandSub.textContent = contract.label;
  }

  document.title =
    contract.profile === "microscope"
      ? `${contract.label}`
      : `Compute Experience — ${contract.label}`;

  const showMicroscopeChrome = contract.profile === "microscope";
  if (elements.worldParameters) {
    elements.worldParameters.hidden = !(showMicroscopeChrome || contract.profile === "instrument");
  }
  if (elements.worldStateReadout) {
    elements.worldStateReadout.hidden = !isWorld;
  }
  if (elements.worldPanel) {
    elements.worldPanel.hidden = contract.profile !== "counterfactual";
  }

  const showFork = contract.capabilities.fork;
  if (elements.fork) elements.fork.hidden = !showFork;
  if (elements.clearBranch) elements.clearBranch.hidden = !showFork;
}

export function clearExperienceShell(): void {
  const body = document.body;
  body.classList.remove("mode-world", "mode-microscope");
  delete body.dataset.experienceProfile;
  delete body.dataset.experienceWorld;
}
