import { describe, expect, it } from "vitest";
import {
  compileModelConcept,
  createMockCompilerLLM,
  createRuntime,
  createSirComposedModelDefinition,
  defaultParameters,
  findTraceTerm,
  explainField,
  loadCompiledModel,
  simulate,
  validateComposedModel,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { sir } from "../../examples/sir";

const SIR_PARAMS = {
  population: 1000,
  contactRate: 0.55,
  recoveryRate: 0.12,
  initialInfected: 10,
  interventionStartDay: 20,
  interventionFactor: 0.45,
};

describe("AI Model Compiler v0", () => {
  const llm = createMockCompilerLLM();

  it("compiles a valid SIR concept into a loadable envelope", async () => {
    const envelope = await compileModelConcept("Model a basic SIR epidemic outbreak", { llm });

    expect(envelope.status).toBe("SUPPORTED");
    expect(envelope.domain).toBe("epidemic-sir");
    expect(envelope.model).toBeTruthy();
    expect(validateComposedModel(envelope.model).ok).toBe(true);

    const runtimeModel = loadCompiledModel(envelope);
    expect(runtimeModel).toBeTruthy();
    expect(runtimeModel!.manifest.state).toEqual(["susceptible", "infected", "recovered"]);

    const handFrames = simulate(sir, SIR_PARAMS);
    const compiledFrames = simulate(runtimeModel!, SIR_PARAMS);
    for (let i = 0; i < handFrames.length; i += 1) {
      for (const key of ["susceptible", "infected", "recovered"] as const) {
        expect(compiledFrames[i]!.state[key]).toBeCloseTo(handFrames[i]!.state[key], 10);
      }
    }
  });

  it("loads compiled model into Runtime unchanged", async () => {
    const envelope = await compileModelConcept("SIR infectious disease spread", { llm });
    const model = loadCompiledModel(envelope)!;
    const registry = createRendererRegistry();

    const runtime = createRuntime({
      model,
      rendererRegistry: registry,
      parameters: defaultParameters(model),
    });
    runtime.rebuild();

    expect(runtime.timeline.length).toBeGreaterThan(0);
    expect(runtime.manifest.renderer).toBe("timeseries-2d");
    expect(runtime.currentFrame()?.state.infected).toBeGreaterThan(0);
  });

  it("repairs structural wire errors within bounded attempts", async () => {
    const envelope = await compileModelConcept("SIR epidemic __broken_wire__", { llm });

    expect(envelope.status).toBe("SUPPORTED");
    expect(envelope.repairAttempts).toBe(1);
    expect(validateComposedModel(envelope.model).ok).toBe(true);
  });

  it("approximates SEIR requests instead of silently adding compartments", async () => {
    const envelope = await compileModelConcept("SEIR model with exposed compartment", { llm });

    expect(envelope.status).toBe("APPROXIMATED");
    expect(envelope.assumptions.some((a) => /exposed|sir/i.test(a))).toBe(true);
    expect(envelope.model?.state).toEqual(["susceptible", "infected", "recovered"]);
    expect(loadCompiledModel(envelope)).toBeTruthy();
  });

  it("refuses out-of-domain concepts before compilation", async () => {
    const envelope = await compileModelConcept("Simulate the Lorenz chaotic attractor", { llm });

    expect(envelope.status).toBe("UNSUPPORTED");
    expect(envelope.model).toBeNull();
    expect(envelope.refusalReason).toMatch(/outside the v0 epidemic/i);
  });

  it("refuses when LLM declines the concept", async () => {
    const envelope = await compileModelConcept("SIR epidemic __llm_refusal__", { llm });

    expect(envelope.status).toBe("UNSUPPORTED");
    expect(envelope.model).toBeNull();
    expect(envelope.refusalReason).toMatch(/declined/i);
  });

  it("rejects invalid primitive output after validator failure", async () => {
    const envelope = await compileModelConcept("SIR epidemic __invalid_primitive__", { llm });

    expect(envelope.status).toBe("UNSUPPORTED");
    expect(envelope.model).toBeNull();
    expect(envelope.diagnostics?.some((d) => d.code === "UNKNOWN_PRIMITIVE" || d.code === "SCHEMA_INVALID")).toBe(
      true,
    );
    expect(envelope.refusalReason).toMatch(/validation/i);
  });

  it("exposes infection and recovery fluxes in compiled trace", async () => {
    const envelope = await compileModelConcept("SIR epidemic with infection and recovery", { llm });
    const model = loadCompiledModel(envelope)!;
    const frames = simulate(model, SIR_PARAMS);
    const trace = explainField(model, frames, 80, "infected", SIR_PARAMS)!;

    expect(findTraceTerm(trace.result, "infection_flux")?.label).toBe("β·S·I/N");
    expect(findTraceTerm(trace.result, "recovery_flux")?.label).toBe("γ·I");
    expect(findTraceTerm(trace.result, "dI_rate")?.children?.map((c) => c.id)).toEqual(
      expect.arrayContaining(["infection_flux", "recovery_flux"]),
    );
  });

  it("matches hand-written composed SIR reference implementation", async () => {
    const envelope = await compileModelConcept("Standard SIR epidemic", { llm });
    const compiled = loadCompiledModel(envelope)!;
    const reference = createSirComposedModelDefinition();
    const params = SIR_PARAMS;

    const compiledFrames = simulate(compiled, params);
    const referenceFrames = simulate(reference, params);
    for (let i = 0; i < compiledFrames.length; i += 1) {
      for (const key of ["susceptible", "infected", "recovered"] as const) {
        expect(compiledFrames[i]!.state[key]).toBeCloseTo(referenceFrames[i]!.state[key], 10);
      }
    }
  });
});
