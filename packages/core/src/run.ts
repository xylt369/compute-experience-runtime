import type { ModelDefinition, StateFrame } from "./protocol/types";
import { defaultParameters } from "./manifest";
import { Timeline } from "./timeline";
import { Player, type PlayerClock } from "./player";
import { continueSimulate, simulate } from "./simulate";

export interface RunMeta {
  id: string;
  modelId: string;
  modelVersion?: string;
  parentRunId?: string;
  forkIndex?: number;
  forkTime?: number;
  createdAt: string;
  label?: string;
}

export interface RunSnapshotData {
  id: string;
  params: Record<string, number>;
  cursor: number;
  parentRunId?: string;
  forkIndex?: number;
  forkTime?: number;
  /** State used at the fork point when continuing the branch. */
  forkState?: Record<string, number>;
  /** Full-run initial override (root runs only). */
  initialState?: Record<string, number>;
  frames?: StateFrame[];
  label?: string;
}

export type RunListener = (run: ComputationalRun, reason: "frame" | "rebuild" | "seek") => void;

let runSeq = 0;
function nextRunId(): string {
  runSeq += 1;
  return `run_${runSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface CreateRunOptions {
  model: ModelDefinition;
  parameters?: Record<string, number>;
  initialState?: Record<string, number>;
  label?: string;
  clock?: PlayerClock;
  onChange?: RunListener;
  id?: string;
}

/**
 * A Run is one concrete execution history of a Model under particular parameters/state.
 * Model ≠ Run ≠ Experience
 */
export class ComputationalRun {
  readonly id: string;
  readonly model: ModelDefinition;
  readonly timeline: Timeline;
  readonly player: Player;
  readonly meta: RunMeta;

  private _parameters: Record<string, number>;
  /** Shared immutable prefix frames [0..forkIndex] from parent. */
  private sharedPrefix: readonly StateFrame[] | null = null;
  private forkIndex = -1;
  /** State at fork used when evolving the branch forward. */
  private forkState: Record<string, number> | null = null;
  private initialOverride: Record<string, number> | null = null;
  private readonly listeners = new Set<RunListener>();

  constructor(options: CreateRunOptions) {
    this.id = options.id ?? nextRunId();
    this.model = options.model;
    this._parameters = options.parameters
      ? { ...options.parameters }
      : defaultParameters(options.model);
    this.initialOverride = options.initialState ? { ...options.initialState } : null;
    this.timeline = new Timeline();
    this.meta = {
      id: this.id,
      modelId: options.model.manifest.id,
      modelVersion: options.model.manifest.version,
      createdAt: new Date().toISOString(),
      label: options.label,
    };
    this.player = new Player(
      this.timeline,
      () => this.emit("frame"),
      options.clock,
    );
    if (options.onChange) this.listeners.add(options.onChange);
  }

  get parameters(): Readonly<Record<string, number>> {
    return this._parameters;
  }

  get parentRunId(): string | undefined {
    return this.meta.parentRunId;
  }

  get forkPoint(): { index: number; time: number } | null {
    if (this.forkIndex < 0) return null;
    return { index: this.forkIndex, time: this.meta.forkTime ?? 0 };
  }

  get isBranch(): boolean {
    return this.forkIndex >= 0;
  }

  subscribe(listener: RunListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(reason: "frame" | "rebuild" | "seek"): void {
    for (const listener of this.listeners) listener(this, reason);
  }

  play(): void {
    this.player.play();
  }

  pause(): void {
    this.player.pause();
  }

  toggle(): void {
    this.player.toggle();
  }

  seek(time: number): void {
    this.player.seek(time);
    this.emit("seek");
  }

  seekIndex(index: number): void {
    this.player.seekIndex(index);
    this.emit("seek");
  }

  step(delta: number): void {
    this.player.step(delta);
    this.emit("seek");
  }

  setPlaybackRate(rate: number): void {
    this.player.setPlaybackRate(rate);
  }

  get isPlaying(): boolean {
    return this.player.isPlaying;
  }

  currentFrame(): StateFrame | undefined {
    return this.timeline.current;
  }

  currentIndex(): number {
    return this.timeline.cursor;
  }

  currentTime(): number {
    return this.timeline.currentTime;
  }

  /**
   * Change parameters. Root runs rebuild fully; branches rebuild from the fork point.
   */
  setParameters(patch: Record<string, number>): void {
    Object.assign(this._parameters, patch);
    if (this.isBranch) {
      this.rebuildFromFork();
    } else {
      this.initialOverride = null;
      this.rebuild();
    }
  }

  /** Override the full-run initial state (root runs). */
  setInitialState(state: Record<string, number>): void {
    if (this.isBranch) {
      this.setForkState(state);
      return;
    }
    this.initialOverride = { ...state };
    this.rebuild({ cursor: 0 });
  }

  /** Intervene at the fork point: replace branch state and re-evolve forward. */
  setForkState(state: Record<string, number>): void {
    if (!this.isBranch || !this.sharedPrefix) {
      throw new Error("setForkState is only valid on a forked run");
    }
    this.forkState = { ...state };
    this.rebuildFromFork();
  }

  /**
   * In-place intervention: keep history through `index`, patch state, recompute the future.
   * Root runs only — used for inspect → intervene → replay without a visible branch.
   */
  reshapeAt(index: number, state: Record<string, number>): void {
    if (this.isBranch) {
      throw new Error("reshapeAt is only valid on the primary run");
    }
    if (!this.timeline.length) this.rebuild();
    const frames = this.timeline.frames;
    const clamped = Math.max(0, Math.min(index | 0, frames.length - 1));
    const frame = frames[clamped];
    if (!frame) throw new Error("Invalid reshape index");

    const totalSteps = this.model.time?.steps ?? 900;
    const dt = this.model.time?.dt ?? 0.01;
    const remaining = Math.max(0, totalSteps - clamped - 1);
    const head = [
      ...frames.slice(0, clamped),
      {
        t: frame.t,
        state: { ...state },
        derived: this.model.derive
          ? { ...this.model.derive(state, this._parameters) }
          : frame.derived,
      },
    ];
    const tail = continueSimulate(this.model, this._parameters, {
      fromState: state,
      fromTime: frame.t,
      steps: remaining,
      dt,
    });
    const nextFrames = [...head, ...tail];
    const keepCursor = Math.min(this.timeline.cursor, nextFrames.length - 1);
    this.player.setPlaybackRate(this.model.time?.playbackRate ?? 1);
    this.player.load(nextFrames);
    this.emit("rebuild");
    this.player.seekIndex(Math.max(clamped, keepCursor));
  }

  rebuild(options?: { cursor?: number; frames?: StateFrame[] }): void {
    if (options?.frames?.length) {
      this.player.setPlaybackRate(this.model.time?.playbackRate ?? 1);
      this.player.load(options.frames);
      this.emit("rebuild");
      if (options.cursor !== undefined) this.player.seekIndex(options.cursor);
      return;
    }

    if (this.isBranch) {
      this.rebuildFromFork(options?.cursor);
      return;
    }

    const frames = simulate(this.model, this._parameters, {
      initial: this.initialOverride ?? undefined,
    });
    this.player.setPlaybackRate(this.model.time?.playbackRate ?? 1);
    this.player.load(frames);
    this.emit("rebuild");
    const last = Math.max(0, frames.length - 1);
    const fallback = this.initialOverride ? 0 : last;
    const cursor =
      options?.cursor === undefined ? fallback : Math.min(Math.max(0, options.cursor), last);
    this.player.seekIndex(cursor);
  }

  private rebuildFromFork(cursor?: number): void {
    if (!this.sharedPrefix || this.forkIndex < 0) {
      throw new Error("Cannot rebuildFromFork without a fork point");
    }
    const prefix = this.sharedPrefix;
    const forkFrame = prefix[this.forkIndex];
    if (!forkFrame) throw new Error("Invalid fork index");

    const totalSteps = this.model.time?.steps ?? 900;
    const dt = this.model.time?.dt ?? 0.01;
    const remaining = Math.max(0, totalSteps - this.forkIndex - 1);
    const intervened = this.forkState != null;
    const fromState = this.forkState ?? forkFrame.state;
    const forkDerived = this.model.derive
      ? this.model.derive(fromState, this._parameters)
      : forkFrame.derived;

    const head: readonly StateFrame[] = intervened
      ? [
          ...prefix.slice(0, this.forkIndex),
          {
            t: forkFrame.t,
            state: { ...fromState },
            derived: forkDerived ? { ...forkDerived } : undefined,
          },
        ]
      : prefix;

    const tail = continueSimulate(this.model, this._parameters, {
      fromState,
      fromTime: forkFrame.t,
      steps: remaining,
      dt,
    });

    const frames = [...head, ...tail];
    const keepCursor = cursor ?? Math.min(this.timeline.cursor, frames.length - 1);
    this.player.setPlaybackRate(this.model.time?.playbackRate ?? 1);
    this.player.load(frames);
    this.emit("rebuild");
    this.player.seekIndex(Math.max(this.forkIndex, keepCursor));
  }

  /**
   * Create an independent child run sharing history up to `index`.
   * Parent remains unchanged.
   */
  forkAt(index: number, options?: { label?: string; clock?: PlayerClock }): ComputationalRun {
    if (!this.timeline.length) this.rebuild();
    const clamped = Math.max(0, Math.min(index | 0, this.timeline.length - 1));
    const prefix = this.timeline.frames.slice(0, clamped + 1);
    const child = new ComputationalRun({
      model: this.model,
      parameters: { ...this._parameters },
      label: options?.label ?? `fork@${clamped}`,
      clock: options?.clock,
    });
    child.sharedPrefix = prefix;
    child.forkIndex = clamped;
    child.forkState = null;
    child.meta.parentRunId = this.id;
    child.meta.forkIndex = clamped;
    child.meta.forkTime = prefix[clamped]!.t;
    child.meta.label = options?.label ?? child.meta.label;
    child.rebuildFromFork(clamped);
    return child;
  }

  forkAtTime(time: number, options?: { label?: string; clock?: PlayerClock }): ComputationalRun {
    if (!this.timeline.length) this.rebuild();
    const frames = this.timeline.frames;
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (frames[mid]!.t < time) lo = mid + 1;
      else hi = mid;
    }
    return this.forkAt(lo, options);
  }

  toSnapshot(includeFrames = false): RunSnapshotData {
    const data: RunSnapshotData = {
      id: this.id,
      params: { ...this._parameters },
      cursor: this.timeline.cursor,
      label: this.meta.label,
    };
    if (this.meta.parentRunId) data.parentRunId = this.meta.parentRunId;
    if (this.forkIndex >= 0) {
      data.forkIndex = this.forkIndex;
      data.forkTime = this.meta.forkTime;
      if (this.forkState) data.forkState = { ...this.forkState };
    }
    if (this.initialOverride) data.initialState = { ...this.initialOverride };
    if (includeFrames) data.frames = this.timeline.frames.map((frame) => ({
      t: frame.t,
      state: { ...frame.state },
      derived: frame.derived ? { ...frame.derived } : undefined,
    }));
    return data;
  }

  static fromSnapshot(
    model: ModelDefinition,
    data: RunSnapshotData,
    options?: { clock?: PlayerClock; onChange?: RunListener },
  ): ComputationalRun {
    const run = new ComputationalRun({
      model,
      parameters: data.params,
      initialState: data.initialState,
      label: data.label,
      clock: options?.clock,
      onChange: options?.onChange,
      id: data.id,
    });
    run.meta.label = data.label;
    if (data.parentRunId !== undefined) {
      run.meta.parentRunId = data.parentRunId;
      run.meta.forkIndex = data.forkIndex;
      run.meta.forkTime = data.forkTime;
      run.forkIndex = data.forkIndex ?? -1;
      run.forkState = data.forkState ? { ...data.forkState } : null;
      if (data.frames?.length && data.forkIndex !== undefined) {
        run.sharedPrefix = data.frames.slice(0, data.forkIndex + 1);
        run.rebuild({ cursor: data.cursor, frames: data.frames });
      } else if (data.frames?.length) {
        run.rebuild({ cursor: data.cursor, frames: data.frames });
      } else {
        run.forkIndex = -1;
        run.sharedPrefix = null;
        run.rebuild({ cursor: data.cursor });
      }
    } else if (data.frames?.length) {
      run.rebuild({ cursor: data.cursor, frames: data.frames });
    } else {
      run.rebuild({ cursor: data.cursor });
    }
    return run;
  }
}

/** @deprecated Prefer ComputationalRun */
export type Run = ComputationalRun;
