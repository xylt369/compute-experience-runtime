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
const PRIMARY_RGB = "232, 237, 241";
const BRANCH_RGB = "210, 156, 92";
const SHARED_RGB = "180, 188, 196";

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
  private reshapeReveal = 1;
  private lastReshapeGen = -1;
  private reshapeRaf = 0;

  private readonly onPointerDown = (e: PointerEvent) => {
    if (!this.canvas) return;
    this.drag = { x: e.clientX, y: e.clientY, rx: this.camera.rx, ry: this.camera.ry };
    this.canvas.setPointerCapture(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.drag) return;
    this.camera.ry = this.drag.ry + (e.clientX - this.drag.x) * 0.008;
    this.camera.rx = this.drag.rx + (e.clientY - this.drag.y) * 0.008;
    this.draw();
  };

  private readonly onPointerUp = () => {
    this.drag = null;
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
    this.canvas = document.createElement("canvas");
    this.canvas.className = "stage-canvas";
    target.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
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
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerUp);
      this.canvas.removeEventListener("wheel", this.onWheel);
      this.canvas.remove();
    }
    this.canvas = null;
    this.ctx = null;
    this.target = null;
    this.trailBtn = null;
    this.view = null;
    this.drag = null;
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
      this.reshapeReveal = 0;
      this.startReshapeAnimation();
    }
    this.syncCompareHint();
    this.draw();
  }

  private startReshapeAnimation(): void {
    if (this.reshapeRaf) cancelAnimationFrame(this.reshapeRaf);
    const tick = () => {
      this.reshapeReveal = Math.min(1, this.reshapeReveal + 0.035);
      this.reshapePulse = Math.max(0, this.reshapePulse - 0.025);
      this.draw();
      if (this.reshapeReveal < 1 || this.reshapePulse > 0) {
        this.reshapeRaf = requestAnimationFrame(tick);
      } else {
        this.reshapeRaf = 0;
      }
    };
    this.reshapeRaf = requestAnimationFrame(tick);
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
      ctx.strokeStyle = `rgba(${rgb}, ${(0.12 + 0.78 * age) * depth * alphaScale})`;
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
      ctx.strokeStyle = "rgba(180, 188, 196, 0.8)";
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
        ctx.strokeStyle = "rgba(210, 156, 92, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.arc(divPoint.x, divPoint.y, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (primaryHead && branchHead && cursor > forkIndex) {
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(210, 156, 92, 0.45)";
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
  ) {
    const frame = frames[frameIndex];
    if (!frame) return;
    const state = frame.state as { x: number; y: number; z: number };
    const point = this.project(state, width, height);
    ctx.beginPath();
    ctx.strokeStyle = "rgba(210, 156, 92, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = "rgba(210, 156, 92, 0.22)";
    ctx.arc(point.x, point.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(210, 156, 92, 0.95)";
    ctx.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${field} @ ${frame.t.toFixed(2)}`, point.x + 12, point.y - 10);
    this.drawDot(ctx, point, "210, 156, 92", 4.2);
  }

  private drawReshapedTrajectory(
    ctx: CanvasRenderingContext2D,
    primary: RunRenderView,
    reshape: NonNullable<RendererView["reshape"]>,
    width: number,
    height: number,
  ) {
    const ghostFrames = reshape.priorFrames.map((frame) => ({
      t: frame.t,
      state: frame.state as { x: number; y: number; z: number },
    }));
    const sharedEnd = Math.max(0, reshape.frameIndex);
    this.drawSegment(ctx, primary.frames, 0, sharedEnd, width, height, SHARED_RGB, 0.95);
    this.drawSegment(
      ctx,
      ghostFrames as typeof primary.frames,
      1,
      ghostFrames.length - 1,
      width,
      height,
      SHARED_RGB,
      0.14 + 0.1 * this.reshapePulse,
    );

    const futureEnd = primary.cursor;
    const futureSpan = Math.max(1, futureEnd - reshape.frameIndex);
    const revealedEnd = reshape.frameIndex + Math.floor(futureSpan * this.reshapeReveal);
    const branchAlpha = 0.55 + 0.45 * this.reshapePulse;
    this.drawSegment(
      ctx,
      primary.frames,
      reshape.frameIndex,
      revealedEnd,
      width,
      height,
      PRIMARY_RGB,
      branchAlpha,
    );

    const forkFrame = primary.frames[reshape.frameIndex];
    if (forkFrame) {
      const forkPoint = this.project(
        forkFrame.state as { x: number; y: number; z: number },
        width,
        height,
      );
      ctx.beginPath();
      ctx.strokeStyle = `rgba(210, 156, 92, ${0.55 + 0.45 * this.reshapePulse})`;
      ctx.lineWidth = 1.6;
      ctx.arc(forkPoint.x, forkPoint.y, 6 + 3 * this.reshapePulse, 0, Math.PI * 2);
      ctx.stroke();
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
    ctx.clearRect(0, 0, width, height);

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
    if (reshape && reshape.priorFrames.length > 1) {
      this.drawReshapedTrajectory(ctx, primary, reshape, width, height);
    } else {
      this.drawSingleTrajectory(ctx, primary, width, height, PRIMARY_RGB);
    }

    const inspection = view.inspection;
    if (inspection) {
      this.drawInspectionMarker(
        ctx,
        primary.frames,
        inspection.highlightFrameIndex,
        inspection.field,
        width,
        height,
      );
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
