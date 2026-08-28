import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  compileConceptForPlayground,
  compileUiStateFromResult,
  createPlaygroundCompilerLLM,
  readPlaygroundCompileEnv,
} from "../../playground/src/compile-entry";
import {
  composeExperience,
  createOpenAICompilerLLM,
  createRuntime,
  defaultParameters,
  explainField,
  resolveExperience,
  sirComposedModel,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";

describe("playground compile entry", () => {
  it("uses mock LLM when no API key is configured", () => {
    expect(createPlaygroundCompilerLLM({})).toBeDefined();
  });

  it("reads Vite env keys for the real adapter", () => {
    expect(
      readPlaygroundCompileEnv({
        VITE_COMPILE_LLM_API_KEY: "sk-test",
        VITE_COMPILE_LLM_BASE_URL: "https://example.test/v1",
        VITE_COMPILE_LLM_MODEL: "gpt-test",
      }).apiKey,
    ).toBe("sk-test");
  });

  it("acceptance phrase compiles into playable SIR experience", async () => {
    const llm = createOpenAICompilerLLM({
      apiKey: "test-key",
      fetch: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  status: "APPROXIMATED",
                  domain: "epidemic-sir",
                  assumptions: [
                    "Quarantine modeled as timed contact-rate reduction via interventionFactor.",
                  ],
                  composedModel: {
                    ...structuredClone(sirComposedModel),
                    id: "compiled-quarantine-epidemic",
                  },
                }),
              },
            },
          ],
        }),
      })) as unknown as typeof fetch,
    });

    const result = await compileConceptForPlayground("simple epidemic with quarantine", llm);
    const ui = compileUiStateFromResult(result);

    expect(ui.status).toBe("APPROXIMATED");
    expect(ui.detail).toMatch(/quarantine/i);
    expect(result.model).toBeTruthy();

    const contract = resolveExperience(result.model!);
    const composition = composeExperience(contract);
    expect(composition.interactions.inspect).toBe(true);
    expect(composition.interactions.replay).toBe(true);
    expect(composition.branchPanel).toBe(true);

    const runtime = createRuntime({
      model: result.model!,
      rendererRegistry: createRendererRegistry(),
      parameters: defaultParameters(result.model!),
    });
    runtime.rebuild();
    expect(
      explainField(result.model!, runtime.primaryRun.timeline.frames, 40, "infected", runtime.parameters),
    ).toBeTruthy();
    runtime.forkAt(30);
    expect(runtime.comparisonRuns.length).toBe(1);
  });

  it("keeps compile entry in the always-visible strip, not the sidebar", () => {
    const html = readFileSync(resolve(import.meta.dirname, "../../playground/index.html"), "utf-8");
    expect(html).toContain('id="compileStrip"');
    expect(html).toContain('id="conceptInput"');
    expect(html.indexOf("compile-strip")).toBeGreaterThan(-1);
    expect(html.indexOf("compile-strip")).toBeLessThan(html.indexOf('id="sidebar"'));
    expect(html.indexOf('id="sidebar"')).toBeGreaterThan(html.indexOf('id="compileEntry"'));
  });
});
