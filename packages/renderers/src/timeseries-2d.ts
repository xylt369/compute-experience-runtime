import type {
  ModelFrame,
  ModelManifest,
  RendererMountOptions,
  RendererView,
  RunRenderView,
  RuntimeRenderer,
} from "@compute-experience/core";

const CANVAS_BG = "#f5f5f7";
const PALETTE = ["#007aff", "#ff9500", "#34c759", "#af52de"];
const PRIMARY_RGB = "0, 122, 255";
const BRANCH_RGB = "255, 149, 0";
const SHARED_RGB = "142, 142, 147";
const HIGHLIGHT_KEY = "infected";

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
  if (key === "interventionActive") return "intervention";
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
      <div class="hint">scrub to inspect · fork to compare alternative futures</div>
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
        .filter((key: string) => key !== "interventionActive")
        .map((key: string) => {
          const value = view.frame.derived?.[key] ?? Number.NaN;
          return `<div class="pill">${labelFor(key)} ${formatValue(key, value)}</div>`;
        })
        .join("");
    }
    const legend = this.overlay.querySelector('[data-role="legend"]');
    const branch = view.comparisonRuns?.[0];
    if (legend) {
      if (branch) {
        legend.innerHTML = `
          <span><i class="swatch" style="background:rgba(${SHARED_RGB},0.9)"></i>shared history</span>
          <span><i class="swatch" style="background:rgb(${PRIMARY_RGB})"></i>ORIGINAL</span>
          <span><i class="swatch" style="background:rgb(${BRANCH_RGB})"></i>COUNTERFACTUAL</span>
        `;
      } else {
        legend.innerHTML = view.manifest.state
          .map((key: string, i: number) => {
            const color = PALETTE[i % PALETTE.length];
            return `<span><i class="swatch" style="background:${color}"></i>${key}</span>`;
          })
          .join("");
      }
    }
  }

  private layout() {
    const view = this.view;
    const target = this.target;
    if (!view || !target) return null;
    const width = target.clientWidth;
    const height = target.clientHeight;
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
    const collections = [view.frames, ...(view.comparisonRuns?.map((run) => run.frames) ?? [])];
    for (const frames of collections) {
      for (const frame of frames.slice(0, visibleEnd + 1)) {
        for (const key of keys) {
          maxY = Math.max(maxY, frame.state[key] ?? 0);
        }
      }
    }

    const xOf = (t: number) => pad.l + ((t - t0) / span) * innerW;
    const yOf = (v: number) => pad.t + innerH - (v / maxY) * innerH;

    return { width, height, pad, innerW, innerH, keys, t0, t1, span, maxY, xOf, yOf, visibleEnd, last };
  }

  private drawAxes(ctx: CanvasRenderingContext2D, layout: NonNullable<ReturnType<typeof this.layout>>) {
    const { pad, innerW, innerH, maxY, t0, t1 } = layout;
    ctx.strokeStyle = "rgba(60, 60, 67, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + innerH);
    ctx.lineTo(pad.l + innerW, pad.t + innerH);
    ctx.stroke();

    ctx.fillStyle = "#636366";
    ctx.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i += 1) {
      const y = pad.t + innerH - (innerH * i) / 4;
      const value = (maxY * i) / 4;
      ctx.fillStyle = "rgba(60, 60, 67, 0.08)";
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + innerW, y);
      ctx.strokeStyle = "rgba(60, 60, 67, 0.12)";
      ctx.stroke();
      ctx.fillStyle = "#636366";
      ctx.fillText(value >= 100 ? value.toFixed(0) : value.toFixed(1), pad.l - 8, y);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${t0.toFixed(0)}`, pad.l, pad.t + innerH + 10);
    ctx.fillText(`${t1.toFixed(0)}`, pad.l + innerW, pad.t + innerH + 10);
    ctx.fillStyle = "#8e8e93";
    ctx.fillText("t", pad.l + innerW / 2, pad.t + innerH + 24);
  }

  private drawSeriesSegment(
    ctx: CanvasRenderingContext2D,
    frames: readonly ModelFrame[],
    key: string,
    start: number,
    end: number,
    layout: NonNullable<ReturnType<typeof this.layout>>,
    stroke: string,
    lineWidth = 1.5,
    alpha = 1,
  ) {
    const { xOf, yOf } = layout;
    const until = Math.min(end, frames.length - 1);
    if (start > until) return;
    ctx.beginPath();
    let started = false;
    for (let i = start; i <= until; i += 1) {
      const frame = frames[i];
      if (!frame) continue;
      const x = xOf(frame.t);
      const y = yOf(frame.state[key] ?? 0);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawCompare(layout: NonNullable<ReturnType<typeof this.layout>>, primary: RunRenderView, branch: RunRenderView) {
    const ctx = this.ctx;
    const view = this.view;
    if (!ctx || !view) return;

    const forkIndex = branch.forkIndex ?? 0;
    const cursor = Math.min(primary.cursor, branch.cursor);
    const { keys, pad, innerH, xOf, yOf } = layout;

    for (const key of keys) {
      const isHighlight = key === HIGHLIGHT_KEY;
      const sharedAlpha = isHighlight ? 0.95 : 0.55;
      const mutedAlpha = isHighlight ? 0.85 : 0.35;
      this.drawSeriesSegment(
        ctx,
        primary.frames,
        key,
        0,
        Math.min(forkIndex, cursor),
        layout,
        `rgba(${SHARED_RGB}, ${sharedAlpha})`,
        isHighlight ? 2.2 : 1.2,
      );

      if (cursor > forkIndex) {
        this.drawSeriesSegment(
          ctx,
          primary.frames,
          key,
          forkIndex + 1,
          cursor,
          layout,
          `rgba(${PRIMARY_RGB}, ${mutedAlpha})`,
          isHighlight ? 2.1 : 1.3,
        );
        this.drawSeriesSegment(
          ctx,
          branch.frames,
          key,
          forkIndex + 1,
          cursor,
          layout,
          `rgba(${BRANCH_RGB}, ${mutedAlpha})`,
          isHighlight ? 2.1 : 1.3,
        );
      }
    }

    const forkFrame = primary.frames[forkIndex];
    if (forkFrame) {
      const x = xOf(forkFrame.t);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(142, 142, 147, 0.85)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 4]);
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + innerH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(180, 188, 196, 0.9)";
      ctx.font = "9px ui-monospace, SFMono-Regular, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("FORK", x, pad.t - 6);

      ctx.beginPath();
      ctx.strokeStyle = "rgba(180, 188, 196, 0.8)";
      ctx.lineWidth = 1.2;
      ctx.arc(x, yOf(forkFrame.state[HIGHLIGHT_KEY] ?? 0), 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    const divergenceIndex = view.comparison?.divergenceIndex;
    if (divergenceIndex != null && divergenceIndex <= cursor) {
      const divFrame = primary.frames[divergenceIndex];
      if (divFrame) {
        const x = xOf(divFrame.t);
        const y = yOf(divFrame.state[HIGHLIGHT_KEY] ?? 0);
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 149, 0, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const head = primary.frames[cursor];
    const branchHead = branch.frames[cursor];
    if (head && branchHead && cursor > forkIndex) {
      const x = xOf(head.t);
      const yPrimary = yOf(head.state[HIGHLIGHT_KEY] ?? 0);
      const yBranch = yOf(branchHead.state[HIGHLIGHT_KEY] ?? 0);
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255, 149, 0, 0.45)";
      ctx.lineWidth = 1;
      ctx.moveTo(x, yPrimary);
      ctx.lineTo(x, yBranch);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawSingle(layout: NonNullable<ReturnType<typeof this.layout>>) {
    const ctx = this.ctx;
    const view = this.view;
    if (!ctx || !view) return;

    const { keys, xOf, yOf } = layout;
    const last = layout.last;
    const until = Math.min(view.cursor, layout.visibleEnd);

    keys.forEach((key: string, series: number) => {
      this.drawSeriesSegment(
        ctx,
        view.frames,
        key,
        0,
        until,
        layout,
        PALETTE[series % PALETTE.length],
        series === 1 ? 2.1 : 1.5,
      );

      if (this.trail >= 0.99 && view.cursor < last) {
        this.drawSeriesSegment(
          ctx,
          view.frames,
          key,
          view.cursor,
          last,
          layout,
          PALETTE[series % PALETTE.length],
          series === 1 ? 2.1 : 1.5,
          0.22,
        );
      }
    });

    const head = view.frames[view.cursor];
    if (head) {
      const x = xOf(head.t);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0, 122, 255, 0.35)";
      ctx.setLineDash([3, 4]);
      ctx.moveTo(x, layout.pad.t);
      ctx.lineTo(x, layout.pad.t + layout.innerH);
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

  private draw() {
    const ctx = this.ctx;
    const layout = this.layout();
    if (!ctx || !layout || !this.view) return;

    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, layout.width, layout.height);
    this.drawAxes(ctx, layout);

    const primary =
      this.view.primaryRun ??
      ({
        id: "primary",
        frame: this.view.frame,
        frames: this.view.frames,
        cursor: this.view.cursor,
        params: this.view.params,
        isPrimary: true,
      } satisfies RunRenderView);

    const branch = this.view.comparisonRuns?.[0];
    if (branch) {
      this.drawCompare(layout, primary, branch);
    } else {
      this.drawSingle(layout);
    }
  }
}
