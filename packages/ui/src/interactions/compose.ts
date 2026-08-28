import type { ComputeRuntime, ExperienceContract, ExperienceComposition } from "@compute-experience/core";
import { composeExperience, inspectableTargets, targetIds } from "@compute-experience/core";
import type { CounterfactualElements, CounterfactualHandle, InterventionConfig } from "../counterfactual";
import { bindCounterfactualUI } from "../counterfactual";
import { bindHoldInteraction } from "./hold";
import { bindWorldHint } from "./hint";
import { bindInspectInteraction } from "./inspect";
import { bindParameterStrip } from "./parameters";
import { bindReplayInteraction } from "./replay";
import { bindTraceInteraction, type TraceInteractionHandle } from "./trace";
import type { BranchInteractionElements, InteractionPrimitive, WorldInteractionElements } from "./types";

export interface ComposeInteractionsOptions {
  contract: ExperienceContract;
  composition?: ExperienceComposition;
  world?: WorldInteractionElements;
  branch?: BranchInteractionElements;
  intervention?: InterventionConfig;
  showOutcomes?: boolean;
  onInspectionAnchor?: (point: { x: number; y: number } | null) => void;
}

export interface InteractionMountHooks {
  onInspectionAnchor: (point: { x: number; y: number } | null) => void;
  onTrajectoryPick?: (pick: { frameIndex: number; screen: { x: number; y: number } }) => void;
}

export interface ComposedInteractionsHandle {
  sync(): void;
  dispose(): void;
  trace?: TraceInteractionHandle;
  branch?: CounterfactualHandle;
  mountHooks: InteractionMountHooks;
}

function interventionFromContract(contract: ExperienceContract): InterventionConfig | undefined {
  const raw = contract.options?.intervention;
  if (!raw) return undefined;
  if (raw.mode === "parameter" && raw.parameterId != null && raw.forkValue != null) {
    return {
      mode: "parameter",
      parameterId: raw.parameterId,
      forkValue: raw.forkValue,
      label: raw.label,
    };
  }
  if (raw.mode === "state" && raw.perturbField) {
    return {
      mode: "state",
      perturbField: raw.perturbField,
      defaultEpsilon: raw.defaultEpsilon,
    };
  }
  return undefined;
}

/**
 * Compose shared interaction primitives from semantic contract + capabilities.
 * World renderer stays model-specific; interactions are capability-driven.
 */
export function composeInteractions(
  runtime: ComputeRuntime,
  options: ComposeInteractionsOptions,
): ComposedInteractionsHandle {
  const { contract, world, branch } = options;
  const composition = options.composition ?? composeExperience(contract);
  const c = contract.capabilities;
  const disposers: InteractionPrimitive[] = [];
  let trace: TraceInteractionHandle | undefined;
  let branchHandle: CounterfactualHandle | undefined;
  let hintDismiss: (() => void) | undefined;

  if (world?.stage) {
    disposers.push(bindHoldInteraction({ runtime, stage: world.stage }));
  }

  if (composition.interactions.trace && world?.hint) {
    const hint = bindWorldHint({
      runtime,
      hint: world.hint,
      message: "Click the path to ask why",
      enabled: true,
    });
    hintDismiss = hint.dismiss;
    disposers.push(hint);
  }

  if (composition.showParameters && world?.parameters) {
    disposers.push(bindParameterStrip({ runtime, contract, element: world.parameters }));
  }

  if (c.trace && composition.showRecipe && world?.recipe && world.stage) {
    trace = bindTraceInteraction({
      runtime,
      contract,
      recipe: world.recipe,
      stage: world.stage,
      restore: composition.showRestore ? world.restore : undefined,
      onAnchor: options.onInspectionAnchor,
    });
    disposers.push(trace);
  } else if (c.replay && composition.showRestore && world?.restore) {
    disposers.push(
      bindReplayInteraction({
        runtime,
        restore: world.restore,
        onRestore: () => options.onInspectionAnchor?.(null),
      }),
    );
  }

  if (c.inspect && world?.stateReadout) {
    disposers.push(
      bindInspectInteraction({
        runtime,
        contract,
        readout: world.stateReadout,
        variant: c.trace ? "trace" : "world",
        onEnter: c.trace ? (field) => trace?.enterInspect(field) : undefined,
      }),
    );
  }

  if (composition.branchPanel && branch) {
    branchHandle = bindCounterfactualUI({
      runtime,
      elements: branch as CounterfactualElements,
      intervention: options.intervention ?? interventionFromContract(contract),
      showOutcomes:
        options.showOutcomes ??
        contract.options?.showOutcomes ??
        contract.options?.intervention?.mode === "parameter",
    });
    disposers.push(branchHandle);
  }

  const selectableIds = new Set(targetIds(inspectableTargets(contract)));

  return {
    trace,
    branch: branchHandle,
    sync() {
      for (const primitive of disposers) primitive.sync();
    },
    dispose() {
      for (const primitive of disposers) primitive.dispose();
    },
    mountHooks: {
      onInspectionAnchor: (point) => {
        options.onInspectionAnchor?.(point);
        trace?.setAnchor(point);
      },
      onTrajectoryPick:
        c.trace && selectableIds.size > 0
          ? (pick) => {
              hintDismiss?.();
              trace?.handleTrajectoryPick(pick);
            }
          : undefined,
    },
  };
}
