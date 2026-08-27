import type { ModelFrame, ModelManifest } from "../../../runtime/model.schema";
import type {
  RendererMountOptions,
  RendererView,
  RuntimeRenderer,
} from "../../../runtime/renderer.registry";

function wrapPi(angle: number) {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Pendulum2DRenderer implements RuntimeRenderer {
  readonly id = "pendulum-2d";

  private target: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private view: RendererView | null = null;
  private options: RendererMountOptions = {};
  private dragging = false;
  private lastSample: { t: number; angle: number } | null = null;
  private live: { angle: number; angularVelocity: number } | null = null;
  private angleEl: HTMLElement | null = null;
  private omegaEl: HTMLElement | null = null;
  private trailBtn: HTMLButtonElement | null = null;
  private trail = 1;
  private ro: ResizeObserver | null = null;

  private readonly onPointerDown = (e: PointerEvent) => {
    if (!this.canvas) return;
    const layout = this.layout();
    if (!layout) return;
    this.dragging = true;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.eventPoint(e);
    this.lastSample = { t: e.timeStamp, angle: this.angleFromPoint(p, layout) };
    this.live = { angle: this.lastSample.angle, angularVelocity: 0 };
    this.draw();
    this.syncHud();
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const layout = this.layout();
    if (!layout) return;
    const p = this.eventPoint(e);
    const angle = this.angleFromPoint(p, layout);
    let omega = 0;
    if (this.lastSample) {
      const dt = Math.max(0.001, (e.timeStamp - this.lastSample.t) / 1000);
      omega = wrapPi(angle - this.lastSample.angle) / dt;
    }
    this.lastSample = { t: e.timeStamp, angle };
    this.live = { angle, angularVelocity: Math.max(-18, Math.min(18, omega)) };
    this.draw();
    this.syncHud();
  };

  private readonly onPointerUp = () => {
    if (!this.dragging || !this.live) {
      this.dragging = false;
      return;
    }
    this.dragging = false;
    const deg = (this.live.angle * 180) / Math.PI;
    this.options.onParams?.({ angle: Math.round(deg * 10) / 10 });
    this.options.onInitialState?.({
      angle: this.live.angle,
      angularVelocity: this.live.angularVelocity,
    });
    this.live = null;
    this.lastSample = null;
  };

  mount(target: HTMLElement, options?: RendererMountOptions): void {
    this.unmount();
    this.target = target;
    this.options = options ?? {};
    this.overlay = options?.overlay ?? null;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "stage-canvas";
    target.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
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
      this.canvas.remove();
    }
    this.canvas = null;
    this.ctx = null;
    this.target = null;
    this.view = null;
    this.live = null;
    this.dragging = false;
    this.angleEl = null;
    this.omegaEl = null;
    this.trailBtn = null;
    if (this.overlay) this.overlay.replaceChildren();
    this.overlay = null;
  }

  update(view: RendererView<ModelFrame, ModelManifest>): void {
    this.view = view;
    if (!this.dragging) this.live = null;
    this.draw();
    this.syncHud();
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
      <div class="hint">drag the bob to set angle · flick to go over the top</div>
      <div class="hud-local">
        <div class="pill" data-role="angle">θ 0.00 rad</div>
        <div class="pill" data-role="omega">ω 0.00 rad/s</div>
      </div>
      <div class="toolbar">
        <button class="tool" type="button" data-act="trail">Trail 100%</button>
      </div>
    `;
    this.angleEl = this.overlay.querySelector('[data-role="angle"]');
    this.omegaEl = this.overlay.querySelector('[data-role="omega"]');
    this.trailBtn = this.overlay.querySelector('[data-act="trail"]');
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

  private syncHud() {
    const angle = this.currentAngle();
    const omega = this.currentOmega();
    if (this.angleEl) this.angleEl.textContent = `θ ${angle.toFixed(2)} rad`;
    if (this.omegaEl) this.omegaEl.textContent = `ω ${omega.toFixed(2)} rad/s`;
  }

  private currentAngle() {
    if (this.live) return this.live.angle;
    return this.view?.frame.state.angle ?? 0;
  }

  private currentOmega() {
    if (this.live) return this.live.angularVelocity;
    return this.view?.frame.state.angularVelocity ?? 0;
  }

  private layout() {
    if (!this.target || !this.view) return null;
    const width = this.target.clientWidth;
    const height = this.target.clientHeight;
    const liveLength = this.view.params.length ?? 1.6;
    const pivot = { x: width * 0.5, y: height * 0.2 };
    const px = Math.min(width, height) * 0.34 * (liveLength / 3);
    return { width, height, pivot, px, length: liveLength };
  }

  private eventPoint(e: PointerEvent) {
    const rect = this.canvas!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private angleFromPoint(p: { x: number; y: number }, layout: NonNullable<ReturnType<Pendulum2DRenderer["layout"]>>) {
    return Math.atan2(p.x - layout.pivot.x, p.y - layout.pivot.y);
  }

  private bobPoint(angle: number, layout: NonNullable<ReturnType<Pendulum2DRenderer["layout"]>>) {
    return {
      x: layout.pivot.x + layout.px * Math.sin(angle),
      y: layout.pivot.y + layout.px * Math.cos(angle),
    };
  }

  private draw() {
    const ctx = this.ctx;
    const view = this.view;
    const layout = this.layout();
    if (!ctx || !view || !layout) return;
    ctx.clearRect(0, 0, layout.width, layout.height);

    ctx.strokeStyle = "rgba(88, 99, 110, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.pivot.x - 28, layout.pivot.y);
    ctx.lineTo(layout.pivot.x + 28, layout.pivot.y);
    ctx.stroke();

    const keep = Math.max(2, Math.floor((view.cursor + 1) * this.trail));
    const start = Math.max(0, view.cursor + 1 - keep);
    const slice = view.frames.slice(start, view.cursor + 1);
    if (slice.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < slice.length; i += 1) {
        const bob = this.bobPoint(slice[i].state.angle, layout);
        if (i === 0) ctx.moveTo(bob.x, bob.y);
        else ctx.lineTo(bob.x, bob.y);
      }
      ctx.strokeStyle = "rgba(232, 237, 241, 0.22)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      const first = slice[0].state.angle;
      const last = this.currentAngle();
      ctx.arc(layout.pivot.x, layout.pivot.y, layout.px, Math.PI / 2 - first, Math.PI / 2 - last, last > first);
      ctx.strokeStyle = "rgba(174, 183, 191, 0.28)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    const angle = this.currentAngle();
    const bob = this.bobPoint(angle, layout);
    ctx.beginPath();
    ctx.moveTo(layout.pivot.x, layout.pivot.y);
    ctx.lineTo(bob.x, bob.y);
    ctx.strokeStyle = "#d8dee4";
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = "#9aa3ab";
    ctx.arc(layout.pivot.x, layout.pivot.y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "rgba(247, 249, 250, 0.16)";
    ctx.arc(bob.x, bob.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#f2f5f7";
    ctx.arc(bob.x, bob.y, 9, 0, Math.PI * 2);
    ctx.fill();
  }
}
