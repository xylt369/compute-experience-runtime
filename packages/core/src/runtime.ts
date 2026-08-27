import { defaultParameters } from "./manifest";
import { Timeline } from "./timeline";
import { Player } from "./player";
import { simulate } from "./simulate";
import { makeSnapshot } from "./snapshot";
import type {
  ExperienceSnapshot,
  ModelDefinition,
  ModelManifest,
  StateFrame,
} from "./protocol/types";
import type {
  RendererMountOptions,
  RendererRegistry,
  RuntimeRenderer,
} from "./renderers/types";

export type RuntimeEvent =
  | { type: "frame"; frame: StateFrame; index: number; playing: boolean }
  | { type: "rebuild"; frameCount: number }
  | { type: "parameters"; parameters: Record<string, number> };

export type RuntimeListener = (event: RuntimeEvent) => void;

export interface RuntimeMountTarget {
  viewport: HTMLElement;
  overlay?: HTMLElement;
}

export interface CreateRuntimeOptions {
  model: ModelDefinition;
  parameters?: Record<string, number>;
  rendererRegistry: RendererRegistry;
}

export interface ComputeRuntime {
  readonly model: ModelDefinition;
  readonly manifest: ModelManifest;
  readonly parameters: Record<string, number>;
  readonly timeline: Timeline;

  play(): void;
  pause(): void;
  toggle(): void;
  seek(time: number): void;
  seekIndex(index: number): void;
  step(delta: number): void;
  isPlaying(): boolean;
  currentFrame(): StateFrame | undefined;
  currentIndex(): number;

  setParameters(patch: Record<string, number>): void;
  setInitialState(state: Record<string, number>): void;
  rebuild(options?: { cursor?: number; frames?: StateFrame[] }): void;

  snapshot(includeFrames?: boolean): ExperienceSnapshot;
  restore(snapshot: ExperienceSnapshot): void;

  subscribe(listener: RuntimeListener): () => void;

  mount(target: RuntimeMountTarget): void;
  unmount(): void;
  resize(): void;
}

export function createRuntime(options: CreateRuntimeOptions): ComputeRuntime {
  const { model, rendererRegistry } = options;
  const timeline = new Timeline();
  let parameters = options.parameters ? { ...options.parameters } : defaultParameters(model);
  let initialOverride: Record<string, number> | null = null;
  let activeRenderer: RuntimeRenderer | null = null;
  let mountedModelId = "";
  let mountTarget: RuntimeMountTarget | null = null;
  const listeners = new Set<RuntimeListener>();

  const notify = (event: RuntimeEvent) => {
    for (const listener of listeners) listener(event);
  };

  const pushView = (frame: StateFrame, index: number) => {
    activeRenderer?.update({
      frame,
      frames: timeline.frames,
      cursor: index,
      trail: 1,
      manifest: model.manifest,
      params: parameters,
    });
  };

  const player = new Player(timeline, (frame, index) => {
    pushView(frame, index);
    notify({ type: "frame", frame, index, playing: player.isPlaying });
  });

  const bindRenderer = () => {
    if (!mountTarget) return;
    const next = rendererRegistry.get(model.manifest.renderer);
    if (activeRenderer === next && mountedModelId === model.manifest.id) return;
    activeRenderer?.unmount();
    activeRenderer = next;
    mountedModelId = model.manifest.id;
    mountTarget.viewport.replaceChildren();
    mountTarget.overlay?.replaceChildren();
    const mountOptions: RendererMountOptions = {
      overlay: mountTarget.overlay,
      onParams: (patch) => {
        Object.assign(parameters, patch);
        notify({ type: "parameters", parameters: { ...parameters } });
      },
      onInitialState: (state) => {
        initialOverride = state;
        rebuild({ cursor: 0 });
      },
    };
    activeRenderer.mount(mountTarget.viewport, mountOptions);
  };

  const rebuild = (opts?: { cursor?: number; frames?: StateFrame[] }) => {
    if (opts?.frames?.length) {
      player.setPlaybackRate(model.time?.playbackRate ?? 1);
      player.load(opts.frames);
      notify({ type: "rebuild", frameCount: opts.frames.length });
      if (opts.cursor !== undefined) player.seekIndex(opts.cursor);
      return;
    }

    const frames = simulate(model, parameters, {
      initial: initialOverride ?? undefined,
    });
    player.setPlaybackRate(model.time?.playbackRate ?? 1);
    player.load(frames);
    notify({ type: "rebuild", frameCount: frames.length });
    const last = Math.max(0, frames.length - 1);
    const fallback = initialOverride ? 0 : last;
    const cursor =
      opts?.cursor === undefined ? fallback : Math.min(Math.max(0, opts.cursor), last);
    player.seekIndex(cursor);
  };

  const runtime: ComputeRuntime = {
    model,
    manifest: model.manifest,
    get parameters() {
      return parameters;
    },
    timeline,

    play: () => player.play(),
    pause: () => player.pause(),
    toggle: () => player.toggle(),
    seek: (time) => player.seek(time),
    seekIndex: (index) => player.seekIndex(index),
    step: (delta) => player.step(delta),
    isPlaying: () => player.isPlaying,
    currentFrame: () => timeline.current,
    currentIndex: () => timeline.cursor,

    setParameters(patch) {
      Object.assign(parameters, patch);
      initialOverride = null;
      notify({ type: "parameters", parameters: { ...parameters } });
      rebuild();
    },

    setInitialState(state) {
      initialOverride = { ...state };
      rebuild({ cursor: 0 });
    },

    rebuild,

    snapshot(includeFrames = false) {
      return makeSnapshot(model.manifest.id, parameters, timeline.cursor, {
        version: model.manifest.version,
        frames: includeFrames ? [...timeline.frames] : undefined,
      });
    },

    restore(snapshot) {
      if (snapshot.model !== model.manifest.id) {
        throw new Error(`Snapshot model mismatch: ${snapshot.model}`);
      }
      parameters = { ...defaultParameters(model), ...snapshot.params };
      initialOverride = null;
      notify({ type: "parameters", parameters: { ...parameters } });
      rebuild({
        cursor: snapshot.cursor,
        frames: snapshot.frames,
      });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    mount(target) {
      mountTarget = target;
      bindRenderer();
      rebuild();
    },

    unmount() {
      activeRenderer?.unmount();
      activeRenderer = null;
      mountedModelId = "";
      mountTarget = null;
    },

    resize() {
      activeRenderer?.resize?.();
    },
  };

  return runtime;
}
