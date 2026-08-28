import type { ComputeRuntime, ExperienceContract } from "@compute-experience/core";
import { fmt } from "./format";
import type { InteractionPrimitive } from "./types";

/** Parameter strip overlay — shows declared parameter targets in the world shell */
export function bindParameterStrip(options: {
  runtime: ComputeRuntime;
  contract: ExperienceContract;
  element: HTMLElement;
}): InteractionPrimitive {
  const { runtime, contract, element } = options;

  const sync = () => {
    const p = runtime.parameters;
    const paramTargets = contract.targets.filter((t) => t.kind === "parameter");
    const entries =
      paramTargets.length > 0
        ? paramTargets.map((t) => ({ key: t.id, label: t.label ?? t.id }))
        : Object.keys(p)
            .filter((key) => !contract.targets.some((t) => t.id === key && t.kind === "state"))
            .slice(0, 6)
            .map((key) => ({ key, label: key }));

    element.innerHTML = entries
      .map(
        ({ key, label }) =>
          `<span class="micro-const" data-kind="parameter">${label} <strong>${fmt(Number(p[key] ?? 0))}</strong></span>`,
      )
      .join("");
  };

  const unsubscribe = runtime.subscribe((event) => {
    if (
      event.type === "frame" ||
      event.type === "run-seek" ||
      event.type === "rebuild" ||
      event.type === "reshape" ||
      event.type === "parameters"
    ) {
      sync();
    }
  });

  sync();

  return { sync, dispose: () => unsubscribe() };
}
