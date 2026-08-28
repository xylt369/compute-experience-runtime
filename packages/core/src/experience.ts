import type {
  ExperienceCapabilities,
  ExperienceProfile,
  ExperienceTarget,
  ExperienceTargetKind,
  ModelDefinition,
  ModelExperience,
} from "./protocol/types";

export type { ExperienceCapabilities, ExperienceProfile, ModelExperience };
export type { ExperienceTarget, ExperienceTargetKind };

/** Shared interaction verbs — semantics are runtime-wide; visual expression varies. */
export type InteractionVerb =
  | "watch"
  | "hold"
  | "ask"
  | "follow"
  | "touch"
  | "release"
  | "replay"
  | "return"
  | "fork"
  | "compare";

/** Capability-aligned primitives enabled for this experience. */
export interface InteractionPrimitives {
  inspect: boolean;
  trace: boolean;
  intervene: boolean;
  replay: boolean;
  fork: boolean;
  compare: boolean;
  hold: boolean;
}

/**
 * Semantic contract between Run and Experience UI.
 * Primary axes: world, targets, capabilities — profile is an optional preset only.
 */
export interface ExperienceContract {
  id: string;
  label: string;
  /** @deprecated Preset label for compatibility — prefer capabilities + targets. */
  profile?: ExperienceProfile;
  world: string;
  capabilities: ExperienceCapabilities;
  targets: ExperienceTarget[];
  options?: ModelExperience["options"];
}

/** Which interaction modules compose this experience (derived from semantics, not profile names). */
export interface ExperienceComposition {
  /** Enabled interaction primitives — primary composition axis. */
  interactions: InteractionPrimitives;
  /** Full trace lens: ask / follow / touch / release (e.g. Lorenz). */
  traceLens: boolean;
  /** Fork / compare branch panel (e.g. SIR). */
  branchPanel: boolean;
  /** World-first shell with state readout / hold (e.g. pendulum, rossler). */
  worldReadout: boolean;
  /** Sidebar manifest playground (params + metrics). */
  manifestPanel: boolean;
  /** Parameter strip overlay in world shell. */
  showParameters: boolean;
  /** In-world computational recipe overlay. */
  showRecipe: boolean;
  /** Restore pre-intervention baseline control. */
  showRestore: boolean;
  /** Any immersive world shell (non-sidebar primary). */
  worldShell: boolean;
}

export const EMPTY_EXPERIENCE_CAPABILITIES: ExperienceCapabilities = {
  inspect: false,
  trace: false,
  intervene: false,
  replay: false,
  fork: false,
  compare: false,
};

/** Profile presets — default capability bundles only, not UI dispatch keys. */
export const PROFILE_PRESETS: Record<ExperienceProfile, Partial<ExperienceCapabilities>> = {
  microscope: {
    inspect: true,
    trace: true,
    intervene: true,
    replay: true,
    fork: true,
    compare: true,
  },
  counterfactual: {
    inspect: true,
    trace: false,
    intervene: true,
    replay: true,
    fork: true,
    compare: true,
  },
  instrument: {
    inspect: false,
    trace: false,
    intervene: true,
    replay: true,
    fork: false,
    compare: false,
  },
  manifest: {
    inspect: false,
    trace: false,
    intervene: false,
    replay: false,
    fork: false,
    compare: false,
  },
};

function hasExplain(model: ModelDefinition): boolean {
  return typeof model.explain === "function";
}

/** Infer a preset when manifest omits explicit experience semantics. */
function inferPreset(model: ModelDefinition, explained: boolean): ExperienceProfile | undefined {
  const declared = model.manifest.experience;
  if (declared?.profile) return declared.profile;
  if (declared?.capabilities) return undefined;
  if (Array.isArray(declared?.targets) && declared.targets.some((t) => typeof t === "object")) {
    return undefined;
  }
  if (explained && model.manifest.renderer === "trajectory-3d") return "microscope";
  if (model.manifest.id === "sir-epidemic") return "counterfactual";
  if (model.manifest.renderer === "pendulum-2d") return "instrument";
  if (model.manifest.renderer === "trajectory-3d") return "instrument";
  return "manifest";
}

function targetKind(
  id: string,
  model: ModelDefinition,
  roles: Record<string, string>,
): ExperienceTargetKind {
  if (roles[id] === "parameter") return "parameter";
  if (roles[id] === "derived") return "derived";
  if (roles[id] === "event") return "event";
  if (model.manifest.derived?.includes(id)) return "derived";
  if (model.manifest.parameters.some((p) => p.id === id)) return "parameter";
  return "state";
}

function normalizeTarget(
  entry: string | ExperienceTarget,
  model: ModelDefinition,
  roles: Record<string, string>,
  capabilities: ExperienceCapabilities,
): ExperienceTarget {
  if (typeof entry === "object") {
    const kind = entry.kind ?? targetKind(entry.id, model, roles);
    return {
      ...entry,
      kind,
      inspectable: entry.inspectable ?? (capabilities.inspect && kind !== "event"),
      traceable: entry.traceable ?? (capabilities.trace && kind === "state"),
      intervenable: entry.intervenable ?? (capabilities.intervene && kind === "state"),
    };
  }
  const kind = targetKind(entry, model, roles);
  return {
    id: entry,
    kind,
    label: entry,
    inspectable: capabilities.inspect && kind !== "parameter" && kind !== "event",
    traceable: capabilities.trace && kind === "state",
    intervenable: capabilities.intervene && kind === "state",
    visualRole: roles[entry],
  };
}

function resolveTargets(
  model: ModelDefinition,
  capabilities: ExperienceCapabilities,
): ExperienceTarget[] {
  const { manifest } = model;
  const declared = manifest.experience?.targets;
  const roles = manifest.experience?.roles ?? {};
  const entries: Array<string | ExperienceTarget> =
    declared && declared.length > 0 ? declared : [...manifest.state];
  return entries.map((entry) => normalizeTarget(entry, model, roles, capabilities));
}

/** Derive interaction modules from capabilities + options (not from profile name). */
export function composeExperience(contract: ExperienceContract): ExperienceComposition {
  const c = contract.capabilities;
  const hasBranchIntervention = Boolean(contract.options?.intervention);

  const traceLens = c.inspect && c.trace;
  const branchPanel =
    !traceLens && c.fork && c.compare && (hasBranchIntervention || c.intervene);
  const worldShell =
    traceLens ||
    branchPanel ||
    c.intervene ||
    c.replay ||
    c.inspect ||
    (c.fork && c.compare);
  const worldReadout = worldShell && !traceLens && !branchPanel;
  const manifestPanel = !worldShell;

  const interactions: InteractionPrimitives = {
    inspect: c.inspect,
    trace: c.trace,
    intervene: c.intervene,
    replay: c.replay,
    fork: c.fork,
    compare: c.compare,
    hold: worldShell,
  };

  return {
    interactions,
    traceLens,
    branchPanel,
    worldReadout,
    manifestPanel,
    showParameters:
      !traceLens &&
      (worldShell && !branchPanel && contract.targets.some((t) => t.kind === "parameter")),
    showRecipe: traceLens,
    showRestore: traceLens && c.replay,
    worldShell,
  };
}

export function targetIds(targets: readonly ExperienceTarget[]): string[] {
  return targets.map((t) => t.id);
}

export function inspectableTargets(contract: ExperienceContract): ExperienceTarget[] {
  return contract.targets.filter((t) => t.inspectable !== false);
}

export function intervenableTargets(contract: ExperienceContract): ExperienceTarget[] {
  return contract.targets.filter((t) => t.intervenable === true);
}

/** Resolve semantic experience contract for a model. */
export function resolveExperience(model: ModelDefinition): ExperienceContract {
  const { manifest } = model;
  const declared = manifest.experience;
  const explained = hasExplain(model);
  const preset = inferPreset(model, explained);

  const capabilities: ExperienceCapabilities = {
    ...EMPTY_EXPERIENCE_CAPABILITIES,
    ...(preset ? PROFILE_PRESETS[preset] : {}),
    ...declared?.capabilities,
  };

  if (explained) {
    capabilities.inspect = declared?.capabilities?.inspect ?? true;
    capabilities.trace = declared?.capabilities?.trace ?? true;
  }

  const targets = resolveTargets(model, capabilities);

  return {
    id: manifest.id,
    label: declared?.label ?? manifest.name,
    profile: declared?.profile ?? preset,
    world: manifest.renderer,
    capabilities,
    targets,
    options: declared?.options,
  };
}

export function experienceMatrix(
  models: Record<string, ModelDefinition>,
): Record<
  string,
  Pick<ExperienceContract, "world" | "capabilities" | "targets" | "profile"> & {
    composition: ExperienceComposition;
  }
> {
  const matrix: Record<
    string,
    Pick<ExperienceContract, "world" | "capabilities" | "targets" | "profile"> & {
      composition: ExperienceComposition;
    }
  > = {};
  for (const [id, model] of Object.entries(models)) {
    const contract = resolveExperience(model);
    matrix[id] = {
      profile: contract.profile,
      world: contract.world,
      capabilities: contract.capabilities,
      targets: contract.targets,
      composition: composeExperience(contract),
    };
  }
  return matrix;
}
