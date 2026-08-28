import { defaultParameters } from "./manifest";
import { ComputationalRun, type RunSnapshotData } from "./run";
import { compareRuns, type RunComparison } from "./compare";
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
  RunRenderView,
  RuntimeRenderer,
} from "./renderers/types";
import type { PlayerClock } from "./player";
import { explainField } from "./inspect";
import type { InspectionState, InspectionTarget, ReshapeInfo, StateIntervention } from "./trace";

export type RuntimeEvent =
  | { type: "frame"; frame: StateFrame; index: number; playing: boolean; runId: string }
  | { type: "rebuild"; frameCount: number; runId: string }
  | { type: "parameters"; parameters: Record<string, number>; runId: string }
  | { type: "run-created"; runId: string }
  | { type: "run-forked"; parentRunId: string; runId: string; forkIndex: number }
  | { type: "run-updated"; runId: string }
  | { type: "run-seek"; runId: string; index: number; time: number }
  | { type: "run-state-changed"; runId: string }
  | { type: "inspect"; state: import("./trace").InspectionState | null }
  | { type: "reshape"; frameIndex: number; field: string; runId: string };

export type RuntimeListener = (event: RuntimeEvent) => void;

export interface RuntimeMountTarget {
  viewport: HTMLElement;
  overlay?: HTMLElement;
}

export interface CreateRuntimeOptions {
  model: ModelDefinition;
  parameters?: Record<string, number>;
  rendererRegistry: RendererRegistry;
  clock?: PlayerClock;
  syncPlayback?: boolean;
}

export interface ComputeRuntime {
  readonly model: ModelDefinition;
  readonly manifest: ModelManifest;
  readonly parameters: Record<string, number>;
  /** @deprecated Prefer primaryRun.timeline */
  readonly timeline: ComputationalRun["timeline"];

  readonly primaryRun: ComputationalRun;
  readonly runs: readonly ComputationalRun[];
  readonly comparisonRuns: readonly ComputationalRun[];
  syncPlayback: boolean;

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

  forkAt(index: number, options?: { label?: string; nudge?: Record<string, number> }): ComputationalRun;
  forkAtTime(time: number, options?: { label?: string; nudge?: Record<string, number> }): ComputationalRun;
  clearBranches(): void;
  compare(runA?: ComputationalRun, runB?: ComputationalRun): RunComparison | null;
  setSyncPlayback(enabled: boolean): void;

  snapshot(includeFrames?: boolean): ExperienceSnapshot;
  restore(snapshot: ExperienceSnapshot): void;

  /** Author-provided trace for a state field at a frame. */
  trace(frameIndex: number, field: string): import("./trace").ComputationTrace | null;
  /** Current inspection focus (trace navigation stack). */
  inspect(
    frameIndex?: number,
    field?: string,
    termId?: string | null,
    options?: { push?: boolean; replace?: boolean },
  ): InspectionState | null;
  clearInspection(): void;
  inspectionBack(): InspectionState | null;
  /** Patch state at a frame and recompute the future in-place. */
  intervene(intervention: StateIntervention): void;
  readonly reshape: ReshapeInfo | null;

  subscribe(listener: RuntimeListener): () => void;

  mount(target: RuntimeMountTarget): void;
  unmount(): void;
  resize(): void;
}

function toRunView(run: ComputationalRun, isPrimary: boolean): RunRenderView {
  const frame = run.currentFrame();
  const role = isPrimary ? "original" : "counterfactual";
  return {
    id: run.id,
    label: run.meta.label ?? role.toUpperCase(),
    role,
    frame: frame ?? { t: 0, state: {} },
    frames: run.timeline.frames,
    cursor: run.currentIndex(),
    params: { ...run.parameters },
    isPrimary,
    forkIndex: run.forkPoint?.index,
    forkTime: run.forkPoint?.time,
  };
}

export function createRuntime(options: CreateRuntimeOptions): ComputeRuntime {
  const { model, rendererRegistry } = options;
  const listeners = new Set<RuntimeListener>();
  let syncPlayback = options.syncPlayback ?? true;
  let syncPlaying = false;
  let syncRaf = 0;
  let syncTime = 0;
  let activeRenderer: RuntimeRenderer | null = null;
  let mountedModelId = "";
  let mountTarget: RuntimeMountTarget | null = null;
  let inspectionNav: InspectionTarget[] = [];
  let reshapeInfo: ReshapeInfo | null = null;
  let reshapeGeneration = 0;

  const notify = (event: RuntimeEvent) => {
    for (const listener of listeners) listener(event);
  };

  const clock: PlayerClock | undefined = options.clock;

  let primaryRun = new ComputationalRun({
    model,
    parameters: options.parameters,
    label: "ORIGINAL",
    clock,
  });
  const branches: ComputationalRun[] = [];

  const allRuns = (): ComputationalRun[] => [primaryRun, ...branches];

  const pushView = () => {
    if (!activeRenderer) return;
    const frame = primaryRun.currentFrame();
    if (!frame) return;
    const comparison = branches[0] ? compareRuns(primaryRun, branches[0]) : null;
    activeRenderer.update({
      frame,
      frames: primaryRun.timeline.frames,
      cursor: primaryRun.currentIndex(),
      trail: 1,
      manifest: model.manifest,
      params: { ...primaryRun.parameters },
      primaryRun: toRunView(primaryRun, true),
      comparisonRuns: branches.map((run) => toRunView(run, false)),
      comparison,
      syncTime: syncPlayback ? syncTime : undefined,
      reshape: reshapeInfo
        ? {
            frameIndex: reshapeInfo.frameIndex,
            field: reshapeInfo.field,
            priorFrames: reshapeInfo.priorFrames,
            generation: reshapeGeneration,
          }
        : undefined,
    });
  };

  const bindRun = (run: ComputationalRun) => {
    run.subscribe((r, reason) => {
      if (reason === "frame") {
        notify({
          type: "frame",
          frame: r.currentFrame()!,
          index: r.currentIndex(),
          playing: r.isPlaying || syncPlaying,
          runId: r.id,
        });
        notify({ type: "run-state-changed", runId: r.id });
      } else if (reason === "rebuild") {
        notify({ type: "rebuild", frameCount: r.timeline.length, runId: r.id });
        notify({ type: "run-updated", runId: r.id });
      } else if (reason === "seek") {
        notify({
          type: "run-seek",
          runId: r.id,
          index: r.currentIndex(),
          time: r.currentTime(),
        });
        notify({ type: "run-state-changed", runId: r.id });
      }
      pushView();
    });
  };

  bindRun(primaryRun);
  notify({ type: "run-created", runId: primaryRun.id });

  const stopSyncClock = () => {
    syncPlaying = false;
    if (clock) clock.cancelAnimationFrame(syncRaf);
    else if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(syncRaf);
    syncRaf = 0;
  };

  const seekAllToTime = (time: number) => {
    syncTime = time;
    for (const run of allRuns()) {
      run.pause();
      run.seek(time);
    }
    pushView();
  };

  const playSynced = () => {
    if (syncPlaying) return;
    const runs = allRuns();
    if (runs.every((run) => run.timeline.length < 2)) return;
    const end = Math.max(...runs.map((run) => run.timeline.end));
    if (syncTime >= end - 1e-9) syncTime = Math.min(...runs.map((run) => run.timeline.start));
    syncPlaying = true;
    const nowFn = clock?.now ?? (() => performance.now());
    const raf = clock?.requestAnimationFrame ?? ((cb) => requestAnimationFrame(cb));
    let previous = nowFn();
    const rate = model.time?.playbackRate ?? 1;
    const tick = (now: number) => {
      if (!syncPlaying) return;
      const elapsed = ((now - previous) / 1000) * rate;
      previous = now;
      syncTime = Math.min(end, syncTime + elapsed);
      for (const run of runs) {
        run.seek(Math.min(syncTime, run.timeline.end));
      }
      pushView();
      notify({
        type: "frame",
        frame: primaryRun.currentFrame()!,
        index: primaryRun.currentIndex(),
        playing: true,
        runId: primaryRun.id,
      });
      if (syncTime >= end - 1e-9) {
        stopSyncClock();
        return;
      }
      syncRaf = raf(tick);
    };
    syncRaf = raf(tick);
  };

  const bindRenderer = () => {
    if (!mountTarget) return;
    const next = rendererRegistry.get(model.manifest.renderer);
    if (activeRenderer === next && mountedModelId === model.manifest.id) {
      pushView();
      return;
    }
    activeRenderer?.unmount();
    activeRenderer = next;
    mountedModelId = model.manifest.id;
    mountTarget.viewport.replaceChildren();
    mountTarget.overlay?.replaceChildren();
    const mountOptions: RendererMountOptions = {
      overlay: mountTarget.overlay,
      onParams: (patch) => {
        primaryRun.setParameters(patch);
        notify({ type: "parameters", parameters: { ...primaryRun.parameters }, runId: primaryRun.id });
      },
      onInitialState: (state) => {
        primaryRun.setInitialState(state);
      },
    };
    activeRenderer.mount(mountTarget.viewport, mountOptions);
  };

  const attachBranch = (branch: ComputationalRun, parentId: string, forkIndex: number) => {
    bindRun(branch);
    branches.push(branch);
    notify({ type: "run-created", runId: branch.id });
    notify({ type: "run-forked", parentRunId: parentId, runId: branch.id, forkIndex });
    if (syncPlayback) {
      syncTime = primaryRun.currentTime();
      branch.seek(syncTime);
    }
    pushView();
    return branch;
  };

  const runtime: ComputeRuntime = {
    model,
    manifest: model.manifest,
    get parameters() {
      return primaryRun.parameters as Record<string, number>;
    },
    get timeline() {
      return primaryRun.timeline;
    },
    get primaryRun() {
      return primaryRun;
    },
    get runs() {
      return allRuns();
    },
    get comparisonRuns() {
      return branches;
    },
    get syncPlayback() {
      return syncPlayback;
    },
    set syncPlayback(value: boolean) {
      syncPlayback = value;
    },

    play() {
      if (syncPlayback && branches.length) {
        playSynced();
        return;
      }
      primaryRun.play();
    },
    pause() {
      stopSyncClock();
      for (const run of allRuns()) run.pause();
    },
    toggle() {
      if (runtime.isPlaying()) runtime.pause();
      else runtime.play();
    },
    seek(time) {
      stopSyncClock();
      if (syncPlayback && branches.length) seekAllToTime(time);
      else primaryRun.seek(time);
    },
    seekIndex(index) {
      stopSyncClock();
      primaryRun.seekIndex(index);
      if (syncPlayback && branches.length) {
        seekAllToTime(primaryRun.currentTime());
      }
    },
    step(delta) {
      stopSyncClock();
      primaryRun.step(delta);
      if (syncPlayback && branches.length) {
        seekAllToTime(primaryRun.currentTime());
      }
    },
    isPlaying() {
      return syncPlaying || primaryRun.isPlaying;
    },
    currentFrame: () => primaryRun.currentFrame(),
    currentIndex: () => primaryRun.currentIndex(),

    setParameters(patch) {
      primaryRun.setParameters(patch);
      notify({ type: "parameters", parameters: { ...primaryRun.parameters }, runId: primaryRun.id });
    },
    setInitialState(state) {
      primaryRun.setInitialState(state);
    },
    rebuild(opts) {
      primaryRun.rebuild(opts);
    },

    forkAt(index, forkOptions) {
      runtime.pause();
      if (branches.length) runtime.clearBranches();
      const branch = primaryRun.forkAt(index, { label: forkOptions?.label ?? "COUNTERFACTUAL", clock });
      if (forkOptions?.nudge) {
        const base = branch.forkPoint
          ? { ...(branch.timeline.frames[branch.forkPoint.index]?.state ?? {}) }
          : { ...(branch.currentFrame()?.state ?? {}) };
        for (const [key, value] of Object.entries(forkOptions.nudge)) {
          base[key] = (base[key] ?? 0) + value;
        }
        branch.setForkState(base);
      }
      return attachBranch(branch, primaryRun.id, index);
    },

    forkAtTime(time, forkOptions) {
      if (!primaryRun.timeline.length) primaryRun.rebuild();
      const frames = primaryRun.timeline.frames;
      let lo = 0;
      let hi = frames.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (frames[mid]!.t < time) lo = mid + 1;
        else hi = mid;
      }
      return runtime.forkAt(lo, forkOptions);
    },

    clearBranches() {
      runtime.pause();
      branches.length = 0;
      pushView();
      notify({ type: "run-updated", runId: primaryRun.id });
    },

    compare(runA = primaryRun, runB = branches[0]) {
      if (!runB) return null;
      return compareRuns(runA, runB);
    },

    setSyncPlayback(enabled) {
      syncPlayback = enabled;
      if (enabled && branches.length) seekAllToTime(primaryRun.currentTime());
    },

    trace(frameIndex, field) {
      return explainField(model, primaryRun.timeline.frames, frameIndex, field, primaryRun.parameters);
    },

    inspect(frameIndex, field, termId = null, options) {
      const idx = frameIndex ?? primaryRun.currentIndex();
      const manifestFields = model.manifest.state;
      const targetField = field ?? manifestFields[0] ?? "x";
      const trace = explainField(model, primaryRun.timeline.frames, idx, targetField, primaryRun.parameters);
      if (!trace) return null;

      const entry: InspectionTarget = {
        frameIndex: idx,
        field: targetField,
        termId,
        label: termId ?? targetField,
      };

      if (options?.replace) {
        inspectionNav = [entry];
      } else if (options?.push) {
        const last = inspectionNav[inspectionNav.length - 1];
        const duplicate =
          last &&
          last.frameIndex === entry.frameIndex &&
          last.field === entry.field &&
          last.termId === entry.termId;
        inspectionNav = duplicate ? inspectionNav : [...inspectionNav, entry];
        if (!inspectionNav.length) inspectionNav = [entry];
      } else {
        inspectionNav = [entry];
      }

      const frame = primaryRun.timeline.frames[idx];
      const state: InspectionState = {
        frameIndex: idx,
        field: targetField,
        termId,
        trace,
        value: frame?.state[targetField] ?? trace.result.value,
        navigation: [...inspectionNav],
      };
      notify({ type: "inspect", state });
      return state;
    },

    clearInspection() {
      inspectionNav = [];
      notify({ type: "inspect", state: null });
    },

    inspectionBack() {
      if (inspectionNav.length <= 1) {
        inspectionNav = [];
        notify({ type: "inspect", state: null });
        return null;
      }
      inspectionNav = inspectionNav.slice(0, -1);
      const prev = inspectionNav[inspectionNav.length - 1]!;
      const trace = explainField(
        model,
        primaryRun.timeline.frames,
        prev.frameIndex,
        prev.field,
        primaryRun.parameters,
      );
      if (!trace) return null;
      const frame = primaryRun.timeline.frames[prev.frameIndex];
      const state: InspectionState = {
        frameIndex: prev.frameIndex,
        field: prev.field,
        termId: prev.termId,
        trace,
        value: frame?.state[prev.field] ?? trace.result.value,
        navigation: [...inspectionNav],
      };
      notify({ type: "inspect", state });
      return state;
    },

    intervene(intervention) {
      runtime.pause();
      if (branches.length) runtime.clearBranches();
      const frame = primaryRun.timeline.frames[intervention.frameIndex];
      if (!frame) throw new Error("Invalid intervention frame");
      const priorFrames = primaryRun.timeline.frames.slice(intervention.frameIndex).map((f) => ({
        t: f.t,
        state: { ...f.state },
      }));
      reshapeGeneration += 1;
      reshapeInfo = {
        frameIndex: intervention.frameIndex,
        field: intervention.field,
        priorFrames,
        generation: reshapeGeneration,
      };
      primaryRun.reshapeAt(intervention.frameIndex, {
        ...frame.state,
        [intervention.field]: intervention.value,
      });
      notify({
        type: "reshape",
        frameIndex: intervention.frameIndex,
        field: intervention.field,
        runId: primaryRun.id,
      });
      notify({ type: "run-updated", runId: primaryRun.id });
      pushView();
    },

    get reshape() {
      return reshapeInfo;
    },

    snapshot(includeFrames = false) {
      const primarySnap = primaryRun.toSnapshot(includeFrames);
      const snap = makeSnapshot(model.manifest.id, { ...primaryRun.parameters }, primaryRun.currentIndex(), {
        version: model.manifest.version,
        frames: includeFrames ? [...primaryRun.timeline.frames] : undefined,
      });
      snap.primaryRunId = primaryRun.id;
      snap.syncPlayback = syncPlayback;
      snap.runs = [
        primarySnap,
        ...branches.map((run) => run.toSnapshot(includeFrames)),
      ];
      return snap;
    },

    restore(snapshot) {
      if (snapshot.model !== model.manifest.id) {
        throw new Error(`Snapshot model mismatch: ${snapshot.model}`);
      }
      runtime.pause();
      branches.length = 0;

      if (snapshot.runs?.length) {
        const [primaryData, ...branchData] = snapshot.runs as RunSnapshotData[];
        primaryRun = ComputationalRun.fromSnapshot(model, primaryData!, { clock });
        bindRun(primaryRun);
        notify({ type: "run-created", runId: primaryRun.id });
        for (const data of branchData) {
          const branch = ComputationalRun.fromSnapshot(model, data, { clock });
          // Ensure shared prefix exists for branches restored with frames.
          if (data.forkIndex !== undefined && data.frames?.length) {
            // already handled in fromSnapshot
          } else if (data.forkIndex !== undefined && primaryRun.timeline.frames.length) {
            // rebuild branch from primary prefix if branch frames missing
            const prefix = primaryRun.timeline.frames.slice(0, data.forkIndex + 1);
            const rebuilt = primaryRun.forkAt(data.forkIndex, { label: data.label, clock });
            rebuilt.setParameters(data.params);
            if (data.forkState) rebuilt.setForkState(data.forkState);
            rebuilt.seekIndex(data.cursor);
            branches.push(rebuilt);
            bindRun(rebuilt);
            notify({ type: "run-created", runId: rebuilt.id });
            notify({
              type: "run-forked",
              parentRunId: primaryRun.id,
              runId: rebuilt.id,
              forkIndex: data.forkIndex,
            });
            continue;
          }
          branches.push(branch);
          bindRun(branch);
          notify({ type: "run-created", runId: branch.id });
        }
        syncPlayback = snapshot.syncPlayback ?? true;
      } else {
        primaryRun = new ComputationalRun({
          model,
          parameters: { ...defaultParameters(model), ...snapshot.params },
          label: "primary",
          clock,
        });
        bindRun(primaryRun);
        notify({ type: "run-created", runId: primaryRun.id });
        primaryRun.rebuild({
          cursor: snapshot.cursor,
          frames: snapshot.frames,
        });
      }
      notify({ type: "parameters", parameters: { ...primaryRun.parameters }, runId: primaryRun.id });
      pushView();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    mount(target) {
      mountTarget = target;
      bindRenderer();
      if (!primaryRun.timeline.length) primaryRun.rebuild();
      else pushView();
    },

    unmount() {
      runtime.pause();
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
