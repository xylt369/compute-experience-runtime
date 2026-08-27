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
    const comparison = runtime.compare();
    if (comparison?.stateDifferences.length) {
      for (const diff of comparison.stateDifferences.slice(0, 3)) {
        const metric = document.createElement("div");
        metric.className = "metric metric-delta";
        metric.innerHTML = `<small>Δ ${diff.key}</small><strong>${diff.absoluteDelta.toFixed(3)}</strong>`;
        root.appendChild(metric);
      }
    }
  };

  const unsubscribe = runtime.subscribe((event) => {
    if (
      event.type === "frame" ||
      event.type === "rebuild" ||
      event.type === "run-state-changed" ||
      event.type === "run-forked"
    ) {
      update();
    }
  });

  update();

  return {
    update,
    dispose: () => unsubscribe(),
  };
}
