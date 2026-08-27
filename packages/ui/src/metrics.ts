import { formatMetricValue, metricKeys, type ComputeRuntime, type StateFrame } from "@compute-experience/core";

export interface MetricsPanelOptions {
  root: HTMLElement;
  runtime: ComputeRuntime;
}

export interface MetricsPanel {
  update(frame?: StateFrame): void;
  dispose(): void;
}

export function bindMetricsPanel(options: MetricsPanelOptions): MetricsPanel {
  const { root, runtime } = options;

  const update = (frame = runtime.currentFrame()) => {
    root.replaceChildren();
    if (!frame) return;
    const keys = metricKeys(runtime.manifest);
    for (const key of keys) {
      const raw = frame.state[key] ?? frame.derived?.[key];
      const metric = document.createElement("div");
      metric.className = "metric";
      metric.innerHTML = `<small>${key}</small><strong>${
        typeof raw === "number" ? formatMetricValue(key, raw) : "—"
      }</strong>`;
      root.appendChild(metric);
    }
  };

  const unsubscribe = runtime.subscribe((event) => {
    if (event.type === "frame" || event.type === "rebuild") update();
  });

  update();

  return {
    update,
    dispose: () => unsubscribe(),
  };
}
