import type { ExperienceSnapshot, RunSnapshot } from "../protocol/types";

/**
 * Generate a standalone, self-contained HTML document containing the simulation
 * data and an embedded minimalist SVG/Canvas player.
 * Perfect for Python Jupyter notebooks, Google Colab, and static report exports.
 */
export function generateInteractiveHtml(snapshot: ExperienceSnapshot | RunSnapshot): string {
  const jsonStr = JSON.stringify(snapshot);
  const title =
    (snapshot as ExperienceSnapshot).model ??
    (snapshot as any).manifest?.name ??
    "Simulation Run";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} - Compute Experience</title>
  <style>
    :root {
      --bg: #faf9f5;
      --panel: #ffffff;
      --text: #1f1e1d;
      --line: rgba(20, 20, 19, 0.1);
      --accent: #007aff;
      --amber: #ff9500;
      --font-mono: ui-monospace, SFMono-Regular, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .cx-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px;
      max-width: 720px;
      margin: 0 auto;
      box-shadow: 0 4px 16px rgba(0,0,0,0.04);
    }
    .cx-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 1px solid var(--line);
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .cx-title { font-weight: 600; font-size: 14px; }
    .cx-meta { font: 11px var(--font-mono); color: #8e8e93; }
    .cx-canvas-wrap {
      position: relative;
      width: 100%;
      height: 280px;
      background: #faf9f5;
      border-radius: 8px;
      overflow: hidden;
    }
    canvas { width: 100%; height: 100%; display: block; }
    .cx-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 12px;
    }
    .cx-btn {
      appearance: none;
      border: 1px solid var(--line);
      background: #ffffff;
      padding: 4px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
    }
    .cx-scrub { flex: 1; accent-color: var(--accent); }
    .cx-time { font: 12px var(--font-mono); min-width: 60px; text-align: right; }
  </style>
</head>
<body>
  <div class="cx-card">
    <div class="cx-header">
      <span class="cx-title">${title}</span>
      <span class="cx-meta" id="cxMeta">Compute Experience Interactive Widget</span>
    </div>
    <div class="cx-canvas-wrap">
      <canvas id="cxCanvas"></canvas>
    </div>
    <div class="cx-controls">
      <button class="cx-btn" id="cxPlay" type="button">▶ Play</button>
      <input class="cx-scrub" id="cxScrub" type="range" min="0" max="0" value="0" />
      <span class="cx-time" id="cxTime">0.00s</span>
    </div>
  </div>
  <script>
    const data = ${jsonStr};
    const frames = data.frames || (data.primary && data.primary.frames) || [];
    const canvas = document.getElementById("cxCanvas");
    const ctx = canvas.getContext("2d");
    const playBtn = document.getElementById("cxPlay");
    const scrub = document.getElementById("cxScrub");
    const timeEl = document.getElementById("cxTime");

    let cursor = 0;
    let playing = false;
    let timer = null;

    scrub.max = Math.max(0, frames.length - 1);

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * (window.devicePixelRatio || 1);
      canvas.height = rect.height * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
      render();
    }

    function render() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (!frames.length) return;

      const keys = Object.keys(frames[0].state || {});
      const until = Math.min(cursor, frames.length - 1);
      const pad = 24;
      const w = rect.width - pad * 2;
      const h = rect.height - pad * 2;

      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < frames.length; i++) {
        for (const k of keys) {
          const v = frames[i].state[k] || 0;
          if (v < minY) minY = v;
          if (v > maxY) maxY = v;
        }
      }
      if (minY === maxY) { minY -= 1; maxY += 1; }

      const colors = ["#007aff", "#34c759", "#ff9500", "#af52de"];
      keys.forEach((k, ki) => {
        ctx.beginPath();
        ctx.strokeStyle = colors[ki % colors.length];
        ctx.lineWidth = 2;
        for (let i = 0; i <= until; i++) {
          const x = pad + (i / Math.max(1, frames.length - 1)) * w;
          const val = frames[i].state[k] || 0;
          const y = pad + h - ((val - minY) / (maxY - minY)) * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      const current = frames[until];
      if (current) {
        timeEl.textContent = (current.t || 0).toFixed(2) + "s";
        scrub.value = until;
      }
    }

    playBtn.onclick = () => {
      playing = !playing;
      playBtn.textContent = playing ? "⏸ Pause" : "▶ Play";
      if (playing) {
        timer = setInterval(() => {
          cursor = (cursor + 1) % frames.length;
          render();
        }, 1000 / 60);
      } else {
        clearInterval(timer);
      }
    };

    scrub.oninput = () => {
      cursor = parseInt(scrub.value, 10);
      render();
    };

    window.onresize = resize;
    resize();
  </script>
</body>
</html>`;
}
