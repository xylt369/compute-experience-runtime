import type {
  ModelFrame,
  ModelManifest,
  RendererMountOptions,
  RendererView,
  RuntimeRenderer,
} from "@compute-experience/core";

const PALETTE = ["#8aa4b0", "#f2d0c6", "#9aa48c", "#c5ccd3"];

function formatValue(key: string, value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (key.toLowerCase().includes("fraction") && value >= 0 && value <= 1) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (Math.abs(value) >= 100) return value.toFixed(0);
  return value.toFixed(2);
}

function labelFor(key: string): string {
  if (key === "reproductionNumber") return "R₀";
  if (key === "infectedFraction") return "infected";
  if (key === "peakRisk") return "peak risk";
  return key;
}

export class Timeseries2DRenderer implements RuntimeRenderer {
  readonly id = "timeseries-2d";

  private target: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private view: RendererView | null = null;
  private trail = 1;
  private hudHost: HTMLElement | null = null;
  private trailBtn: HTMLButtonElement | null = null;
  private ro: ResizeObserver | null = null;

  mount(target: HTMLElement, options?: RendererMountOptions): void {
    this.unmount();
    this.target = target;
    this.overlay = options?.overlay ?? null;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "stage-canvas";
    target.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(target);
    this.mountHud();
    this.resize();
  }

  unmount(): void {
    this.ro?.disconnect();
    this.ro = null;
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.target = null;
    this.view = null;
    this.hudHost = null;
    this.trailBtn = null;
    if (this.overlay) this.overlay.replaceChildren();
    this.overlay = null;
  }

  update(view: RendererView<ModelFrame, ModelManifest>): void {
    this.view = view;
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
      <div class="hint">scrub to inspect · raise contact rate to move the peak</div>
      <div class="hud-local" data-role="metrics"></div>
      <div class="legend" data-role="legend"></div>
      <div class="toolbar">
        <button class="tool" type="button" data-act="trail">Trail 100%</button>
      </div>
    `;
    this.hudHost = this.overlay.querySelector('[data-role="metrics"]');
    this.trailBtn = this.overlay.querySelector('[data-act="trail"]');
    this.trailBtn?.addEventListener("click", () => {
      this.trail = this.trail >= 0.99 ? 0.25 : this.trail >= 0.5 ? 1 : 0.5;
      if (this.trailBtn) this.trailBtn.textContent = `Trail ${Math.round(this.trail * 100)}%`;
      this.draw();
    });
  }

  private syncHud() {
    const view = this.view;
    if (!view || !this.overlay) return;
    const derivedKeys = view.manifest.derived ?? [];
    if (this.hudHost) {
      this.hudHost.innerHTML = derivedKeys
        .map((key: string) => {
          const value = view.frame.derived?.[key] ?? Number.NaN;
          return `<div class="pill">${labelFor(key)} ${formatValue(key, value)}</div>`;
        })
        .join("");
    }
    const legend = this.overlay.querySelector('[data-role="legend"]');
    if (legend) {
      legend.innerHTML = view.manifest.state
        .map((key: string, i: number) => {
          const color = PALETTE[i % PALETTE.length];
          return `<span><i class="swatch" style="background:${color}"></i>${key}</span>`;
        })
        .join("");
    }
  }

  private draw() {
    const ctx = this.ctx;
    const view = this.view;
    const target = this.target;
    if (!ctx || !view || !target) return;
    const width = target.clientWidth;
    const height = target.clientHeight;
    ctx.clearRect(0, 0, width, height);

    const pad = { l: 52, r: 24, t: 36, b: 86 };
    const innerW = Math.max(1, width - pad.l - pad.r);
    const innerH = Math.max(1, height - pad.t - pad.b);
    const keys = view.manifest.state;
    const last = Math.max(1, view.frames.length - 1);
    const visibleEnd = this.trail >= 0.99 ? last : Math.max(view.cursor, Math.floor(last * this.trail));
    const t0 = view.frames[0]?.t ?? 0;
    const t1 = view.frames[visibleEnd]?.t ?? view.frames[last]?.t ?? 1;
    const span = Math.max(1e-9, t1 - t0);

    let maxY = 1;
    for (const frame of view.frames.slice(0, visibleEnd + 1)) {
      for (const key of keys) {
        maxY = Math.max(maxY, frame.state[key] ?? 0);
      }
    }

    ctx.strokeStyle = "rgba(32, 38, 45, 0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + innerH);
    ctx.lineTo(pad.l + innerW, pad.t + innerH);
    ctx.stroke();

    ctx.fillStyle = "#5f6972";
    ctx.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i += 1) {
      const y = pad.t + innerH - (innerH * i) / 4;
      const value = (maxY * i) / 4;
      ctx.fillStyle = "rgba(95, 105, 114, 0.35)";
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + innerW, y);
      ctx.strokeStyle = "rgba(32, 38, 45, 0.55)";
      ctx.stroke();
      ctx.fillStyle = "#5f6972";
      ctx.fillText(value >= 100 ? value.toFixed(0) : value.toFixed(1), pad.l - 8, y);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${t0.toFixed(0)}`, pad.l, pad.t + innerH + 10);
    ctx.fillText(`${t1.toFixed(0)}`, pad.l + innerW, pad.t + innerH + 10);
    ctx.fillStyle = "#667079";
    ctx.fillText("t", pad.l + innerW / 2, pad.t + innerH + 24);

    const xOf = (t: number) => pad.l + ((t - t0) / span) * innerW;
    const yOf = (v: number) => pad.t + innerH - (v / maxY) * innerH;

    keys.forEach((key: string, series: number) => {
      ctx.beginPath();
      let started = false;
      const until = Math.min(view.cursor, visibleEnd);
      for (let i = 0; i <= until; i += 1) {
        const frame = view.frames[i];
        const x = xOf(frame.t);
        const y = yOf(frame.state[key] ?? 0);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = PALETTE[series % PALETTE.length];
      ctx.lineWidth = series === 1 ? 2.1 : 1.5;
      ctx.globalAlpha = 0.95;
      ctx.stroke();

      if (this.trail >= 0.99 && view.cursor < last) {
        ctx.beginPath();
        ctx.globalAlpha = 0.22;
        for (let i = view.cursor; i <= last; i += 1) {
          const frame = view.frames[i];
          const x = xOf(frame.t);
          const y = yOf(frame.state[key] ?? 0);
          if (i === view.cursor) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
    ctx.globalAlpha = 1;

    const head = view.frames[view.cursor];
    if (head) {
      const x = xOf(head.t);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(242, 245, 247, 0.55)";
      ctx.setLineDash([3, 4]);
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + innerH);
      ctx.stroke();
      ctx.setLineDash([]);
      keys.forEach((key: string, series: number) => {
        ctx.beginPath();
        ctx.fillStyle = PALETTE[series % PALETTE.length];
        ctx.arc(x, yOf(head.state[key] ?? 0), 3.4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
}
