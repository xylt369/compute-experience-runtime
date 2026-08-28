import { describe, expect, it, vi } from "vitest";
import {
  compileModelConcept,
  createOpenAICompilerLLM,
  createRuntime,
  defaultParameters,
  explainField,
  runCompilerProductLoop,
  sirComposedModel,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { composeInteractions } from "@compute-experience/ui";

function quarantineDraftJson() {
  const model = structuredClone(sirComposedModel);
  model.id = "compiled-quarantine-epidemic";
  model.version = "0.1.0-compiled";
  return {
    status: "APPROXIMATED",
    domain: "epidemic-sir",
    assumptions: ["Quarantine modeled as timed contact-rate reduction via interventionFactor."],
    composedModel: model,
  };
}

function fakeOpenAIFetch(payload: Record<string, unknown>) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
  })) as unknown as typeof fetch;
}

function fakeOpenAIError(status: number, statusText: string) {
  return vi.fn(async () => ({
    ok: false,
    status,
    statusText,
    json: async () => ({ error: { message: statusText } }),
  })) as unknown as typeof fetch;
}

describe("compiler product loop (HTTP LLM)", () => {
  it("acceptance: simple epidemic with quarantine → playable, inspectable, intervenable, replayable", async () => {
    const llm = createOpenAICompilerLLM({
      apiKey: "test-key-not-in-source",
      baseUrl: "https://llm.test/v1",
      model: "compiler-test",
      fetch: fakeOpenAIFetch(quarantineDraftJson()),
    });

    const result = await runCompilerProductLoop("simple epidemic with quarantine", {
      llm,
      useMockWhenNoKey: false,
    });

    expect(result.providerError).toBeNull();
    expect(result.envelope.status).toBe("APPROXIMATED");
    expect(result.envelope.assumptions.some((a) => /quarantine/i.test(a))).toBe(true);
    expect(result.model).toBeTruthy();
    expect(result.model!.manifest.experience?.profile).toBe("counterfactual");
    expect(result.contract).toBeTruthy();
    expect(result.composition).toBeTruthy();

    const { interactions, branchPanel } = result.composition!;
    expect(interactions.inspect).toBe(true);
    expect(interactions.replay).toBe(true);
    expect(interactions.fork).toBe(true);
    expect(interactions.compare).toBe(true);
    expect(interactions.intervene).toBe(true);
    expect(branchPanel).toBe(true);

    const registry = createRendererRegistry();
    const runtime = createRuntime({
      model: result.model!,
      rendererRegistry: registry,
      parameters: defaultParameters(result.model!),
    });
    runtime.rebuild();

    expect(runtime.timeline.length).toBeGreaterThan(100);
    expect(runtime.currentFrame()?.state.infected).toBeGreaterThan(0);

    runtime.play();
    expect(runtime.isPlaying()).toBe(true);
    runtime.pause();
    expect(runtime.isPlaying()).toBe(false);

    const trace = explainField(
      result.model!,
      runtime.primaryRun.timeline.frames,
      80,
      "infected",
      runtime.parameters,
    );
    expect(trace?.result.value).toBeGreaterThan(0);

    runtime.seekIndex(60);
    runtime.forkAt(60);
    expect(runtime.comparisonRuns.length).toBe(1);
    const branch = runtime.comparisonRuns[0]!;
    branch.setParameters({ interventionStartDay: 5, interventionFactor: 0.2 });
    expect(runtime.primaryRun.parameters.interventionStartDay).toBe(20);

    runtime.seekIndex(0);
    runtime.step(15);
    expect(runtime.currentIndex()).toBe(15);

    const panel = document.createElement("div");
    const timeline = document.createElement("div");
    const scrub = document.createElement("input");
    const handle = composeInteractions(runtime, {
      contract: result.contract!,
      composition: result.composition!,
      branch: { panel, timeline, scrub },
    });
    expect(handle.branch).toBeDefined();
    handle.dispose();
    runtime.unmount();
  });

  it("surfaces provider HTTP errors without throwing", async () => {
    const llm = createOpenAICompilerLLM({
      apiKey: "test-key",
      fetch: fakeOpenAIError(503, "Service Unavailable"),
    });

    const result = await runCompilerProductLoop("SIR epidemic outbreak", {
      llm,
      useMockWhenNoKey: false,
    });

    expect(result.model).toBeNull();
    expect(result.envelope.status).toBe("UNSUPPORTED");
    expect(result.providerError?.code).toBe("PROVIDER_HTTP_ERROR");
    expect(result.envelope.refusalReason).toMatch(/503/);
  });

  it("refuses unsupported concepts without calling the provider", async () => {
    const fetchSpy = fakeOpenAIFetch(quarantineDraftJson());
    const llm = createOpenAICompilerLLM({
      apiKey: "test-key",
      fetch: fetchSpy,
    });

    const result = await runCompilerProductLoop("Simulate the Lorenz chaotic attractor", {
      llm,
      useMockWhenNoKey: false,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.envelope.status).toBe("UNSUPPORTED");
    expect(result.model).toBeNull();
    expect(result.envelope.refusalReason).toMatch(/outside the v0 epidemic/i);
  });

  it("maps LLM UNSUPPORTED JSON to a non-loadable envelope", async () => {
    const llm = createOpenAICompilerLLM({
      apiKey: "test-key",
      fetch: fakeOpenAIFetch({
        status: "UNSUPPORTED",
        domain: null,
        assumptions: [],
        refusalReason: "Cannot express concept with v0 primitives.",
        composedModel: null,
      }),
    });

    const envelope = await compileModelConcept("SIR with unknown structure", { llm });
    expect(envelope.status).toBe("UNSUPPORTED");
    expect(envelope.model).toBeNull();
    expect(envelope.refusalReason).toMatch(/Cannot express/i);
  });
});
