import { createComposedExecutor } from "../composed/executor";
import type { ComposedModel } from "../composed/types";
import { validateComposedModel } from "../composed/validator";
import { wrapSirComposedModel } from "../composed/sir-composed";
import type { ModelDefinition } from "../protocol/types";
import { isSirComposedModel } from "./domains/epidemic";
import type { CompilationEnvelope, ValidatedModel } from "./types";

/** Run the deterministic validator and return a ValidatedModel when valid. */
export function validateCompiledModel(model: unknown): ValidatedModel | null {
  const result = validateComposedModel(model);
  if (!result.ok || !result.order) return null;
  return { model: model as ComposedModel, order: result.order };
}

/** Load a successful compilation envelope into a Runtime-ready ModelDefinition. */
export function loadCompiledModel(envelope: CompilationEnvelope): ModelDefinition | null {
  if (envelope.status === "UNSUPPORTED" || !envelope.model) return null;
  if (isSirComposedModel(envelope.model)) {
    return wrapSirComposedModel(envelope.model, {
      id: envelope.model.id,
      name: `Compiled: ${envelope.model.id}`,
      description: envelope.assumptions.length
        ? `AI-compiled SIR model. ${envelope.assumptions.join(" ")}`
        : "AI-compiled SIR epidemic model.",
    });
  }
  const executor = createComposedExecutor(envelope.model);
  return executor.toModelDefinition({
    id: envelope.model.id,
    name: envelope.model.id,
    description: "AI-compiled model.",
    renderer: "timeseries-2d",
  });
}

/** Verify an envelope produces a simulatable runtime model. */
export function assertLoadableCompilation(envelope: CompilationEnvelope): ModelDefinition {
  const model = loadCompiledModel(envelope);
  if (!model) {
    throw new Error("Compilation envelope is not loadable.");
  }
  createComposedExecutor(envelope.model!);
  return model;
}
