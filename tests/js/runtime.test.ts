import { describe, expect, it } from "vitest";
import {
  createRuntime,
  defaultParameters,
  makeSnapshot,
  serializeSnapshot,
  deserializeSnapshot,
} from "@compute-experience/core";
import { createRendererRegistry } from "@compute-experience/renderers";
import { pendulum } from "../../examples/pendulum";

describe("createRuntime lifecycle", () => {
  it("rebuilds on parameter changes and emits events", () => {
    const registry = createRendererRegistry();
    const runtime = createRuntime({
      model: pendulum,
      rendererRegistry: registry,
      parameters: defaultParameters(pendulum),
    });
    const events: string[] = [];
    runtime.subscribe((event) => events.push(event.type));

    runtime.rebuild();
    const before = runtime.timeline.length;
    runtime.setParameters({ gravity: 20 });
    expect(runtime.parameters.gravity).toBe(20);
    expect(runtime.timeline.length).toBeGreaterThan(0);
    expect(events).toContain("rebuild");
    expect(events).toContain("parameters");
    expect(runtime.timeline.length).toBe(before);
  });

  it("seeks, steps, and toggles playback", () => {
    const registry = createRendererRegistry();
    const runtime = createRuntime({ model: pendulum, rendererRegistry: registry });
    runtime.rebuild();
    runtime.pause();
    runtime.seekIndex(0);
    expect(runtime.currentIndex()).toBe(0);
    runtime.step(5);
    expect(runtime.currentIndex()).toBe(5);
    runtime.seek(runtime.currentFrame()!.t);
    expect(runtime.currentIndex()).toBe(5);
    runtime.play();
    expect(runtime.isPlaying()).toBe(true);
    runtime.pause();
    expect(runtime.isPlaying()).toBe(false);
    runtime.toggle();
    expect(runtime.isPlaying()).toBe(true);
  });

  it("round-trips snapshots through serialize and restore", () => {
    const registry = createRendererRegistry();
    const runtime = createRuntime({ model: pendulum, rendererRegistry: registry });
    runtime.rebuild();
    runtime.seekIndex(4);
    const snap = runtime.snapshot(true);
    const raw = serializeSnapshot(snap);
    const parsed = deserializeSnapshot(raw);
    expect(parsed.model).toBe("simple-pendulum");
    expect(parsed.cursor).toBe(4);
    expect(parsed.frames?.length).toBe(runtime.timeline.length);

    runtime.setParameters({ gravity: 1 });
    runtime.restore(parsed);
    expect(runtime.parameters.gravity).toBe(snap.params.gravity);
    expect(runtime.currentIndex()).toBe(4);
  });

  it("rejects restoring a snapshot for a different model", () => {
    const registry = createRendererRegistry();
    const runtime = createRuntime({ model: pendulum, rendererRegistry: registry });
    runtime.rebuild();
    const wrong = makeSnapshot("other-model", {}, 0);
    expect(() => runtime.restore(wrong)).toThrow(/model mismatch/);
  });
});
