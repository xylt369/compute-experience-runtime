import type {
  ExperienceCapabilities,
  ExperienceProfile,
  ModelDefinition,
  ModelExperience,
} from "./protocol/types";

export type { ExperienceCapabilities, ExperienceProfile, ModelExperience };

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

/**
 * Semantic contract between Run and Experience UI.
 * Describes what can be experienced — not DOM layout.
 */
export interface ExperienceContract {
  id: string;
  label: string;
  profile: ExperienceProfile;
  /** Primary visual world (renderer id). */
  world: string;
  capabilities: ExperienceCapabilities;
  /** Primary inspectable / selectable state fields. */
  targets: string[];
  /** Optional semantic roles (e.g. parameter vs state). */
  roles?: Record<string, string>;
  options?: ModelExperience["options"];
}

export const EMPTY_EXPERIENCE_CAPABILITIES: ExperienceCapabilities = {
  inspect: false,
  trace: false,
  intervene: false,
  replay: false,
  fork: false,
  compare: false,
};

const PROFILE_DEFAULTS: Record<ExperienceProfile, Partial<ExperienceCapabilities>> = {
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

function inferProfile(model: ModelDefinition, explained: boolean): ExperienceProfile {
  if (explained && model.manifest.renderer === "trajectory-3d") return "microscope";
  if (model.manifest.id === "sir-epidemic") return "counterfactual";
  if (model.manifest.renderer === "pendulum-2d") return "instrument";
  if (model.manifest.renderer === "trajectory-3d") return "instrument";
  return "manifest";
}

/** Resolve the experience contract for a model (manifest + defaults). */
export function resolveExperience(model: ModelDefinition): ExperienceContract {
  const { manifest } = model;
  const declared = manifest.experience;
  const explained = hasExplain(model);
  const profile = declared?.profile ?? inferProfile(model, explained);
  const profileDefaults = PROFILE_DEFAULTS[profile];

  const capabilities: ExperienceCapabilities = {
    ...EMPTY_EXPERIENCE_CAPABILITIES,
    ...profileDefaults,
    ...declared?.capabilities,
  };

  if (explained) {
    capabilities.inspect = true;
    capabilities.trace = declared?.capabilities?.trace ?? true;
  }

  return {
    id: manifest.id,
    label: declared?.label ?? manifest.name,
    profile,
    world: manifest.renderer,
    capabilities,
    targets: declared?.targets ?? [...manifest.state],
    roles: declared?.roles,
    options: declared?.options,
  };
}

/** Capability matrix for built-in models (documentation / tests). */
export function experienceMatrix(
  models: Record<string, ModelDefinition>,
): Record<string, Pick<ExperienceContract, "profile" | "world" | "capabilities">> {
  const matrix: Record<string, Pick<ExperienceContract, "profile" | "world" | "capabilities">> = {};
  for (const [id, model] of Object.entries(models)) {
    const contract = resolveExperience(model);
    matrix[id] = {
      profile: contract.profile,
      world: contract.world,
      capabilities: contract.capabilities,
    };
  }
  return matrix;
}
