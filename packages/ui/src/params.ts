import type { ComputeRuntime, ModelParameter } from "@compute-experience/core";
import { formatParameterValue } from "./format";

export interface ParameterPanelOptions {
  root: HTMLElement;
  runtime: ComputeRuntime;
}

export interface ParameterPanel {
  sync(): void;
  dispose(): void;
}

export function bindParameterPanel(options: ParameterPanelOptions): ParameterPanel {
  const { root, runtime } = options;

  const sync = () => {
    root.replaceChildren();
    for (const parameter of runtime.manifest.parameters) {
      root.appendChild(createParameterControl(parameter, runtime));
    }
  };

  const unsubscribe = runtime.subscribe((event) => {
    if (event.type === "rebuild" || event.type === "parameters" || event.type === "run-updated") sync();
  });

  sync();

  return {
    sync,
    dispose: () => unsubscribe(),
  };
}

function createParameterControl(parameter: ModelParameter, runtime: ComputeRuntime): HTMLElement {
  const box = document.createElement("div");
  box.className = "param";
  box.dataset.paramId = parameter.id;

  const head = document.createElement("div");
  head.className = "param-head";
  const label = document.createElement("span");
  label.textContent = parameter.label;
  const value = document.createElement("span");
  value.className = "param-value";
  head.append(label, value);
  box.appendChild(head);

  const current = () => Number(runtime.parameters[parameter.id]);
  const updateValue = () => {
    value.textContent = formatParameterValue(parameter, current());
  };

  if (parameter.type === "boolean") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = current() >= 0.5;
    input.addEventListener("change", () => {
      runtime.setParameters({ [parameter.id]: input.checked ? 1 : 0 });
      updateValue();
    });
    box.appendChild(input);
  } else if (parameter.type === "enum") {
    const input = document.createElement("select");
    input.className = "control";
    for (const [index, option] of (parameter.options ?? []).entries()) {
      const opt = document.createElement("option");
      opt.value = String(index);
      opt.textContent = option;
      input.appendChild(opt);
    }
    input.value = String(Math.max(0, Math.round(current())));
    input.addEventListener("change", () => {
      runtime.setParameters({ [parameter.id]: Number(input.value) });
      updateValue();
    });
    box.appendChild(input);
  } else {
    const input = document.createElement("input");
    input.className = "range";
    input.type = "range";
    input.min = String(parameter.min ?? 0);
    input.max = String(parameter.max ?? 100);
    input.step = String(parameter.step ?? (parameter.type === "integer" ? 1 : 0.1));
    input.value = String(current());
    input.addEventListener("input", () => {
      const next = parameter.type === "integer" ? Math.round(Number(input.value)) : Number(input.value);
      runtime.setParameters({ [parameter.id]: next });
      updateValue();
    });
    box.appendChild(input);
  }

  updateValue();
  return box;
}
