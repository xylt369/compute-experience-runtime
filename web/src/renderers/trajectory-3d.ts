import type { ModelFrame, ModelManifest } from "../../../runtime/model.schema";
import type {
  RendererMountOptions,
  RendererView,
  RuntimeRenderer,
} from "../../../runtime/renderer.registry";

type Camera = { rx: number; ry: number; zoom: number };

const DEFAULT_CAMERA: Camera = { rx: -0.72, ry: 0.72, zoom: 1 };

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
  private bounds = { cx: 0, cy: 0, cz: 0, extent: 1 };
  private ro: ResizeObserver | null = null;

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
    const trailChanged = this.view?.trail !== view.trail;
    const framesChanged = this.view?.frames !== view.frames;
    this.view = view;
    if (framesChanged) this.recomputeBounds();
    if (trailChanged) this.syncTrailLabel();
    this.draw();
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
      <div class="hint">drag to rotate · wheel to zoom · space to play</div>
      <div class="legend">
        <span><i class="swatch x"></i>x</span>
        <span><i class="swatch y"></i>y</span>
        <span><i class="swatch z"></i>z</span>
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
      if (!this.view) return;
      const next = this.view.trail >= 0.99 ? 0.25 : this.view.trail >= 0.5 ? 1 : 0.5;
      this.view = { ...this.view, trail: next };
      this.syncTrailLabel();
      this.draw();
    });
  }

  private syncTrailLabel() {
    if (this.trailBtn && this.view) {
      this.trailBtn.textContent = `Trail ${Math.round(this.view.trail * 100)}%`;
    }
  }

  private recomputeBounds() {
    const frames = this.view?.frames ?? [];
    if (!frames.length) {
      this.bounds = { cx: 0, cy: 0, cz: 0, extent: 1 };
      return;
    }
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const frame of frames) {
      const { x, y, z } = frame.state;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
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

  private draw() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const view = this.view;
    if (!ctx || !canvas || !view) return;
    const width = this.target?.clientWidth ?? 0;
    const height = this.target?.clientHeight ?? 0;
    ctx.clearRect(0, 0, width, height);

    const keep = Math.max(2, Math.floor((view.cursor + 1) * view.trail));
    const start = Math.max(0, view.cursor + 1 - keep);
    const slice = view.frames.slice(start, view.cursor + 1);
    if (slice.length < 2) {
      if (slice[0]) this.drawDot(ctx, this.project(slice[0].state as { x: number; y: number; z: number }, width, height));
      return;
    }

    const projected = slice.map((frame) =>
      this.project(frame.state as { x: number; y: number; z: number }, width, height),
    );

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < projected.length; i += 1) {
      const a = projected[i - 1];
      const b = projected[i];
      const age = i / (projected.length - 1);
      const depth = 0.35 + 0.65 * (0.5 + 0.5 * Math.tanh(b.z * 1.6));
      ctx.strokeStyle = `rgba(232, 237, 241, ${(0.12 + 0.78 * age) * depth})`;
      ctx.lineWidth = 1.15 + 0.7 * age;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    this.drawDot(ctx, projected[projected.length - 1]);
  }

  private drawDot(ctx: CanvasRenderingContext2D, p: { x: number; y: number }) {
    ctx.beginPath();
    ctx.fillStyle = "rgba(247, 249, 250, 0.18)";
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#f7f9fa";
    ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
}
