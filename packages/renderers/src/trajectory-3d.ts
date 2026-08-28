import type {
  ModelFrame,
  ModelManifest,
  RendererMountOptions,
  RendererView,
  RunRenderView,
  RuntimeRenderer,
} from "@compute-experience/core";

type Camera = { rx: number; ry: number; zoom: number };
type Point2D = { x: number; y: number };

const DEFAULT_CAMERA: Camera = { rx: -0.72, ry: 0.72, zoom: 1 };
const CANVAS_BG = "#f5f5f7";
const PRIMARY_RGB = "0, 122, 255";
const BRANCH_RGB = "255, 149, 0";
const SHARED_RGB = "142, 142, 147";
const ACCENT_RGB = "255, 149, 0";

export class Trajectory3DRenderer implements RuntimeRenderer {
  readonly id = "trajectory-3d";

  private target: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private view: RendererView | null = null;
  private camera: Camera = { ...DEFAULT_CAMERA };
  private drag: { x: number; y: number; rx: number; ry: number } | null = null;
  private trailBtn: HTMLButtonElement | null = null;
  private trail = 1;
  private bounds = { cx: 0, cy: 0, cz: 0, extent: 1 };
  private ro: ResizeObserver | null = null;
  private reshapePulse = 0;
  private lastReshapeGen = -1;
  private reshapeRaf = 0;
  private idleRaf = 0;
  private onInspectionAnchor: ((point: { x: number; y: number } | null) => void) | null = null;
  private onTrajectoryPick:
    | ((pick: { frameIndex: number; screen: { x: number; y: number } }) => void)
    | null = null;
  private pointerOrigin: { x: number; y: number } | null = null;
  private pointerMoved = false;
  private readonly PICK_THRESHOLD_PX = 6;
  private readonly HIT_RADIUS_PX = 16;

  private readonly onPointerDown = (e: PointerEvent) => {
    if (!this.canvas) return;
    this.pointerOrigin = { x: e.clientX, y: e.clientY };
    this.pointerMoved = false;
    this.drag = { x: e.clientX, y: e.clientY, rx: this.camera.rx, ry: this.camera.ry };
    this.canvas.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.drag || !this.pointerOrigin) return;
    const moved = Math.hypot(e.clientX - this.pointerOrigin.x, e.clientY - this.pointerOrigin.y);
    if (moved > this.PICK_THRESHOLD_PX) this.pointerMoved = true;
    this.camera.ry = this.drag.ry + (e.clientX - this.drag.x) * 0.008;
    this.camera.rx = this.drag.rx + (e.clientY - this.drag.y) * 0.008;
    this.draw();
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    if (!this.pointerMoved && this.onTrajectoryPick) {
      const pick = this.pickTrajectoryFrame(e.clientX, e.clientY);
      if (pick != null) {
        this.onTrajectoryPick(pick);
      }
    }
    this.drag = null;
    this.pointerOrigin = null;
    this.pointerMoved = false;
  };

  private readonly onPointerCancel = () => {
    this.drag = null;
    this.pointerOrigin = null;
    this.pointerMoved = false;
  };

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.camera.zoom = Math.max(0.25, Math.min(4, this.camera.zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
    this.draw();
  };

  mount(target: HTMLElement, options?: RendererMountOptions): void {
    this.unmount();
    this.target = target;
    this.overlay = options?.overlay ?? null;
    this.onInspectionAnchor = options?.onInspectionAnchor ?? null;
    this.onTrajectoryPick = options?.onTrajectoryPick ?? null;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "stage-canvas";
    target.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerCancel);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(target);
    this.mountHud();
    this.resize();
  }

  unmount(): void {
    this.ro?.disconnect();
    this.ro = null;
    if (this.reshapeRaf) cancelAnimationFrame(this.reshapeRaf);
    this.reshapeRaf = 0;
    if (this.idleRaf) cancelAnimationFrame(this.idleRaf);
    this.idleRaf = 0;
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
      this.canvas.removeEventListener("wheel", this.onWheel);
      this.canvas.remove();
    }
    this.canvas = null;
    this.ctx = null;
    this.target = null;
    this.trailBtn = null;
    this.view = null;
    this.drag = null;
    this.onInspectionAnchor = null;
    this.onTrajectoryPick = null;
    if (this.overlay) this.overlay.replaceChildren();
    this.overlay = null;
  }

  update(view: RendererView<ModelFrame, ModelManifest>): void {
    const prev = this.view;
    this.view = view;
    const framesChanged =
      prev?.frames !== view.frames ||
      prev?.comparisonRuns?.length !== view.comparisonRuns?.length ||
      prev?.comparisonRuns?.[0]?.frames !== view.comparisonRuns?.[0]?.frames;
    if (framesChanged) this.recomputeBounds();
    const reshapeGen = view.reshape?.generation ?? -1;
    if (reshapeGen >= 0 && reshapeGen !== this.lastReshapeGen) {
      this.lastReshapeGen = reshapeGen;
      this.reshapePulse = 1;
      this.startReshapeAnimation();
    }
    this.syncCompareHint();
    this.syncIdlePulse(view);
    this.draw();
  }

  private syncIdlePulse(view: RendererView): void {
    const wantsPulse = !view.playing && !view.inspection && !view.comparisonRuns?.length;
    if (!wantsPulse) {
      if (this.idleRaf) cancelAnimationFrame(this.idleRaf);
      this.idleRaf = 0;
      return;
    }
    if (this.idleRaf) return;
    const tick = () => {
      if (!this.view || this.view.playing || this.view.inspection || this.view.comparisonRuns?.length) {
        this.idleRaf = 0;
        return;
      }
      this.draw();
      this.idleRaf = requestAnimationFrame(tick);
    };
    this.idleRaf = requestAnimationFrame(tick);
  }

  private startReshapeAnimation(): void {
    if (this.reshapeRaf) cancelAnimationFrame(this.reshapeRaf);
    const tick = () => {
      this.reshapePulse = Math.max(0, this.reshapePulse - 0.045);
      this.draw();
      if (this.reshapePulse > 0.01) {
        this.reshapeRaf = requestAnimationFrame(tick);
      } else {
        this.reshapePulse = 0;
        this.reshapeRaf = 0;
      }
    };
    this.reshapeRaf = requestAnimationFrame(tick);
  }

  private primaryRunView(view: RendererView): RunRenderView {
    return (
      view.primaryRun ?? {
        id: "primary",
        frame: view.frame,
        frames: view.frames,
        cursor: view.cursor,
        params: view.params,
        isPrimary: true,
      }
    );
  }

  private pickTrajectoryFrame(
    clientX: number,
    clientY: number,
  ): { frameIndex: number; screen: { x: number; y: number } } | null {
    const view = this.view;
    if (!view || !this.canvas || !this.target) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const width = this.target.clientWidth;
    const height = this.target.clientHeight;
    const primary = this.primaryRunView(view);
    const reshape = view.reshape;
    const seam = reshape?.frameIndex ?? -1;
    const cursor = primary.cursor;
    const keep = Math.max(2, Math.floor((cursor + 1) * this.trail));
    const visibleStart = reshape ? 0 : Math.max(0, cursor + 1 - keep);

    let bestIndex = -1;
    let bestDist = Infinity;
    let bestPoint: Point2D | null = null;

    for (let i = visibleStart; i <= cursor; i += 1) {
      const frame = primary.frames[i];
      if (!frame) continue;
      const point = this.project(frame.state as { x: number; y: number; z: number }, width, height);
      const dist = Math.hypot(point.x - x, point.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
        bestPoint = point;
      }
    }

    if (bestIndex < 0 || bestDist > this.HIT_RADIUS_PX || !bestPoint) return null;
    return { frameIndex: bestIndex, screen: { x: bestPoint.x, y: bestPoint.y } };
  }

  resize(): void {
    if (!this.canvas || !this.target || !this.ctx) return;
    const width = Math.max(1, this.target.clientWidth);
    const height = Math.max(1, this.target.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  private mountHud() {
    if (!this.overlay) return;
    this.overlay.innerHTML = `
      <div class="hint">Drag to orbit · scroll to zoom</div>
      <div class="legend" data-role="legend">
        <span><i class="swatch-inline primary"></i>ORIGINAL</span>
      </div>
      <div class="toolbar">
        <button class="tool" type="button" data-act="center">Center</button>
        <button class="tool" type="button" data-act="trail">Trail 100%</button>
      </div>
    `;
    this.trailBtn = this.overlay.querySelector('[data-act="trail"]');
    this.overlay.querySelector('[data-act="center"]')?.addEventListener("click", () => {
      this.camera = { ...DEFAULT_CAMERA };
      this.draw();
    });
    this.trailBtn?.addEventListener("click", () => {
      this.trail = this.trail >= 0.99 ? 0.25 : this.trail >= 0.5 ? 1 : 0.5;
      this.syncTrailLabel();
      this.draw();
    });
    this.syncTrailLabel();
  }

  private syncTrailLabel() {
    if (this.trailBtn) this.trailBtn.textContent = `Trail ${Math.round(this.trail * 100)}%`;
  }

  private syncCompareHint() {
    const legend = this.overlay?.querySelector<HTMLElement>('[data-role="legend"]');
    if (!legend) return;
    const branch = this.view?.comparisonRuns?.[0];
    if (!branch) {
      legend.innerHTML = `<span><i class="swatch-inline primary"></i>ORIGINAL</span>`;
      return;
    }
    legend.innerHTML = `
      <span><i class="swatch-inline primary"></i>ORIGINAL</span>
      <span><i class="swatch-inline branch"></i>COUNTERFACTUAL</span>
    `;
  }

  private recomputeBounds() {
    const view = this.view;
    const collections: readonly ModelFrame[][] = [
      [...(view?.frames ?? [])],
      ...(view?.comparisonRuns?.map((run) => [...run.frames]) ?? []),
    ];
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let any = false;
    for (const frames of collections) {
      for (const frame of frames) {
        const { x, y, z } = frame.state;
        if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") continue;
        any = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
    if (!any) {
      this.bounds = { cx: 0, cy: 0, cz: 0, extent: 1 };
      return;
    }
    this.bounds = {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      cz: (minZ + maxZ) / 2,
      extent: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6),
    };
  }

  private project(point: { x: number; y: number; z: number }, width: number, height: number) {
    const { rx, ry, zoom } = this.camera;
    const { cx, cy, cz, extent } = this.bounds;
    let x = ((point.x - cx) / extent) * zoom;
    let y = ((point.y - cy) / extent) * zoom;
    let z = ((point.z - cz) / extent) * zoom;
    const cyR = Math.cos(ry);
    const syR = Math.sin(ry);
    const X = x * cyR + z * syR;
    let Z = -x * syR + z * cyR;
    const cxR = Math.cos(rx);
    const sxR = Math.sin(rx);
    const Y = y * cxR - Z * sxR;
    Z = y * sxR + Z * cxR;
    const scale = Math.min(width, height) * 0.42;
    return { x: width * 0.5 + X * scale, y: height * 0.48 - Y * scale, z: Z };
  }

  private drawSegment(
    ctx: CanvasRenderingContext2D,
    frames: readonly ModelFrame[],
    start: number,
    end: number,
    width: number,
    height: number,
    rgb: string,
    alphaScale = 1,
  ): Point2D | null {
    const slice = frames.slice(Math.max(0, start), Math.min(end + 1, frames.length));
    if (slice.length < 1) return null;
    if (slice.length === 1) {
      const p = this.project(slice[0]!.state as { x: number; y: number; z: number }, width, height);
      this.drawDot(ctx, p, rgb, 2.8);
      return p;
    }
    const projected = slice.map((frame) =>
      this.project(frame.state as { x: number; y: number; z: number }, width, height),
    );
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < projected.length; i += 1) {
      const a = projected[i - 1]!;
      const b = projected[i]!;
      const age = i / (projected.length - 1);
      const depth = 0.35 + 0.65 * (0.5 + 0.5 * Math.tanh(b.z * 1.6));
      ctx.strokeStyle = `rgba(${rgb}, ${(0.22 + 0.72 * age) * depth * alphaScale})`;
      ctx.lineWidth = 1.15 + 0.7 * age;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const head = projected[projected.length - 1]!;
    this.drawDot(ctx, head, rgb);
    return head;
  }

  private drawCompareTrajectories(
    ctx: CanvasRenderingContext2D,
    primary: RunRenderView,
    branch: RunRenderView,
    width: number,
    height: number,
  ) {
    const forkIndex = branch.forkIndex ?? primary.forkIndex ?? 0;
    const cursor = Math.min(primary.cursor, branch.cursor);
    const keep = Math.max(2, Math.floor((cursor + 1) * this.trail));
    const visibleStart = Math.max(0, cursor + 1 - keep);
    const sharedEnd = Math.min(forkIndex, cursor);
    const sharedStart = Math.max(0, visibleStart);

    if (sharedEnd >= sharedStart) {
      this.drawSegment(ctx, primary.frames, sharedStart, sharedEnd, width, height, SHARED_RGB, 0.95);
    }

    const forkPoint = this.drawSegment(
      ctx,
      primary.frames,
      Math.max(sharedStart, forkIndex),
      Math.max(sharedStart, forkIndex),
      width,
      height,
      SHARED_RGB,
      1,
    );

    const primaryHead = this.drawSegment(
      ctx,
      primary.frames,
      Math.max(forkIndex + 1, visibleStart),
      cursor,
      width,
      height,
      PRIMARY_RGB,
    );

    const branchHead = this.drawSegment(
      ctx,
      branch.frames,
      Math.max(forkIndex + 1, visibleStart),
      cursor,
      width,
      height,
      BRANCH_RGB,
    );

    if (forkPoint) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(142, 142, 147, 0.85)";
      ctx.lineWidth = 1.2;
      ctx.arc(forkPoint.x, forkPoint.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    const divergenceIndex = this.view?.comparison?.divergenceIndex;
    if (divergenceIndex != null && divergenceIndex <= cursor) {
      const divFrame = primary.frames[divergenceIndex];
      if (divFrame) {
        const divPoint = this.project(divFrame.state as { x: number; y: number; z: number }, width, height);
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 149, 0, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.arc(divPoint.x, divPoint.y, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (primaryHead && branchHead && cursor > forkIndex) {
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255, 149, 0, 0.45)";
      ctx.lineWidth = 1;
      ctx.moveTo(primaryHead.x, primaryHead.y);
      ctx.lineTo(branchHead.x, branchHead.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawInspectionMarker(
    ctx: CanvasRenderingContext2D,
    frames: readonly ModelFrame[],
    frameIndex: number,
    field: string,
    width: number,
    height: number,
  ): Point2D | null {
    const frame = frames[frameIndex];
    if (!frame) {
      this.onInspectionAnchor?.(null);
      return null;
    }
    const state = frame.state as { x: number; y: number; z: number };
    const point = this.project(state, width, height);

    ctx.beginPath();
    ctx.strokeStyle = `rgba(${ACCENT_RGB}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.moveTo(point.x - 14, point.y);
    ctx.lineTo(point.x + 14, point.y);
    ctx.moveTo(point.x, point.y - 14);
    ctx.lineTo(point.x, point.y + 14);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = `rgba(${ACCENT_RGB}, 0.92)`;
    ctx.lineWidth = 1.4;
    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = `rgba(${ACCENT_RGB}, 0.14)`;
    ctx.arc(point.x, point.y, 12, 0, Math.PI * 2);
    ctx.fill();
    this.drawDot(ctx, point, ACCENT_RGB, 3.8);
    this.onInspectionAnchor?.(point);
    return point;
  }

  private drawInspectionThread(
    ctx: CanvasRenderingContext2D,
    frames: readonly ModelFrame[],
    pathFrames: number[],
    width: number,
    height: number,
  ) {
    if (!pathFrames.length) return;

    for (let i = 0; i < pathFrames.length - 1; i += 1) {
      const a = pathFrames[i]!;
      const b = pathFrames[i + 1]!;
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      const depth = i / Math.max(1, pathFrames.length - 2);
      this.drawThreadAlong(ctx, frames, start, end, width, height, depth);
    }

    pathFrames.forEach((frameIndex, index) => {
      const frame = frames[frameIndex];
      if (!frame) return;
      const point = this.project(frame.state as { x: number; y: number; z: number }, width, height);
      const isCurrent = index === pathFrames.length - 1;
      const isPrevious = index === pathFrames.length - 2;
      const alpha = isCurrent ? 0.95 : isPrevious ? 0.45 : 0.18;
      const radius = isCurrent ? 4.2 : isPrevious ? 3 : 2.2;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${ACCENT_RGB}, ${alpha})`;
      ctx.lineWidth = isCurrent ? 1.4 : 1;
      ctx.arc(point.x, point.y, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
      if (isCurrent) this.drawDot(ctx, point, ACCENT_RGB, 3.4);
    });
  }

  private drawThreadAlong(
    ctx: CanvasRenderingContext2D,
    frames: readonly ModelFrame[],
    start: number,
    end: number,
    width: number,
    height: number,
    depth: number,
  ) {
    if (end <= start) return;
    const projected = frames.slice(start, end + 1).map((frame) =>
      this.project(frame.state as { x: number; y: number; z: number }, width, height),
    );
    if (projected.length < 2) return;
    ctx.beginPath();
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = `rgba(${ACCENT_RGB}, ${0.12 + 0.22 * (1 - depth)})`;
    ctx.moveTo(projected[0]!.x, projected[0]!.y);
    for (let i = 1; i < projected.length; i += 1) {
      ctx.lineTo(projected[i]!.x, projected[i]!.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawHoldCursor(
    ctx: CanvasRenderingContext2D,
    frames: readonly ModelFrame[],
    frameIndex: number,
    width: number,
    height: number,
  ) {
    const frame = frames[frameIndex];
    if (!frame) return;
    const point = this.project(frame.state as { x: number; y: number; z: number }, width, height);
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 420);

    ctx.beginPath();
    ctx.strokeStyle = `rgba(0, 122, 255, ${0.12 + 0.1 * pulse})`;
    ctx.lineWidth = 1.5;
    ctx.arc(point.x, point.y, 14 + 4 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = "rgba(0, 122, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.moveTo(point.x - 10, point.y);
    ctx.lineTo(point.x + 10, point.y);
    ctx.moveTo(point.x, point.y - 10);
    ctx.lineTo(point.x, point.y + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = "rgba(0, 122, 255, 0.55)";
    ctx.lineWidth = 1.1;
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.stroke();
    this.drawDot(ctx, point, PRIMARY_RGB, 3.8);
  }

  private drawGrowingFuture(
    ctx: CanvasRenderingContext2D,
    frames: readonly ModelFrame[],
    seamIndex: number,
    cursor: number,
    width: number,
    height: number,
  ) {
    if (cursor <= seamIndex) return;
    const slice = frames.slice(seamIndex, cursor + 1);
    if (slice.length < 2) {
      const frame = slice[0];
      if (!frame) return;
      const point = this.project(frame.state as { x: number; y: number; z: number }, width, height);
      this.drawDot(ctx, point, BRANCH_RGB, 3.2);
      return;
    }

    const projected = slice.map((frame) =>
      this.project(frame.state as { x: number; y: number; z: number }, width, height),
    );
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < projected.length; i += 1) {
      const a = projected[i - 1]!;
      const b = projected[i]!;
      const progress = i / (projected.length - 1);
      const depth = 0.4 + 0.6 * (0.5 + 0.5 * Math.tanh(b.z * 1.6));
      const alpha = (0.2 + 0.75 * progress) * depth;
      ctx.strokeStyle = `rgba(${BRANCH_RGB}, ${alpha})`;
      ctx.lineWidth = 1 + 0.9 * progress;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    const head = projected[projected.length - 1]!;
    const tipPulse = 0.65 + 0.35 * this.reshapePulse;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${BRANCH_RGB}, ${0.12 * tipPulse})`;
    ctx.arc(head.x, head.y, 9, 0, Math.PI * 2);
    ctx.fill();
    this.drawDot(ctx, head, BRANCH_RGB, 3.6 + 0.8 * tipPulse);
  }

  private drawReshapedTrajectory(
    ctx: CanvasRenderingContext2D,
    primary: RunRenderView,
    reshape: NonNullable<RendererView["reshape"]>,
    width: number,
    height: number,
  ) {
    const seam = reshape.frameIndex;
    const cursor = primary.cursor;

    // Settled history — prefix through the seam stays still.
    this.drawSegment(ctx, primary.frames, 0, seam, width, height, PRIMARY_RGB, 0.62);

    // Brief ghost of the old future, fading at intervention only.
    if (this.reshapePulse > 0.01 && reshape.priorFrames.length > 1) {
      const ghostFrames = reshape.priorFrames.map((frame) => ({
        t: frame.t,
        state: frame.state as { x: number; y: number; z: number },
      }));
      this.drawSegment(
        ctx,
        ghostFrames as typeof primary.frames,
        1,
        ghostFrames.length - 1,
        width,
        height,
        SHARED_RGB,
        0.1 * this.reshapePulse,
      );
    }

    // New future grows from the seam with playback — no second curve.
    this.drawGrowingFuture(ctx, primary.frames, seam, cursor, width, height);

    const seamFrame = primary.frames[seam];
    if (seamFrame) {
      const seamPoint = this.project(
        seamFrame.state as { x: number; y: number; z: number },
        width,
        height,
      );
      const pulse = 0.45 + 0.55 * this.reshapePulse;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${ACCENT_RGB}, ${0.5 + 0.45 * pulse})`;
      ctx.lineWidth = 1.4;
      ctx.arc(seamPoint.x, seamPoint.y, 5 + 2 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = `rgba(${ACCENT_RGB}, ${0.08 + 0.12 * pulse})`;
      ctx.arc(seamPoint.x, seamPoint.y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  private drawSingleTrajectory(
    ctx: CanvasRenderingContext2D,
    run: RunRenderView,
    width: number,
    height: number,
    rgb: string,
  ) {
    const keep = Math.max(2, Math.floor((run.cursor + 1) * this.trail));
    const start = Math.max(0, run.cursor + 1 - keep);
    this.drawSegment(ctx, run.frames, start, run.cursor, width, height, rgb);
  }

  private draw() {
    const ctx = this.ctx;
    const view = this.view;
    if (!ctx || !view) return;
    const width = this.target?.clientWidth ?? 0;
    const height = this.target?.clientHeight ?? 0;
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, width, height);

    const primary = view.primaryRun ?? {
      id: "primary",
      frame: view.frame,
      frames: view.frames,
      cursor: view.cursor,
      params: view.params,
      isPrimary: true,
    };

    const branch = view.comparisonRuns?.[0];
    if (branch) {
      this.drawCompareTrajectories(ctx, primary, branch, width, height);
      return;
    }

    const reshape = view.reshape;
    if (reshape) {
      this.drawReshapedTrajectory(ctx, primary, reshape, width, height);
    } else {
      this.drawSingleTrajectory(ctx, primary, width, height, PRIMARY_RGB);
    }

    const inspection = view.inspection;
    if (inspection?.pathFrames?.length) {
      this.drawInspectionThread(ctx, primary.frames, inspection.pathFrames, width, height);
    }
    if (inspection) {
      this.drawInspectionMarker(
        ctx,
        primary.frames,
        inspection.highlightFrameIndex,
        inspection.field,
        width,
        height,
      );
    } else if (!view.playing) {
      this.drawHoldCursor(ctx, primary.frames, primary.cursor, width, height);
      this.onInspectionAnchor?.(null);
    } else {
      this.onInspectionAnchor?.(null);
    }
  }

  private drawDot(ctx: CanvasRenderingContext2D, p: Point2D, rgb = PRIMARY_RGB, radius = 3.6) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(${rgb}, 0.18)`;
    ctx.arc(p.x, p.y, radius + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
