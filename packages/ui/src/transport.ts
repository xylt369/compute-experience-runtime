import type { ComputeRuntime } from "@compute-experience/core";

export interface TransportBarElements {
  play: HTMLButtonElement;
  scrub: HTMLInputElement;
  time: HTMLElement;
}

export interface TransportBarOptions {
  runtime: ComputeRuntime;
  elements: TransportBarElements;
}

export interface TransportBar {
  sync(): void;
  dispose(): void;
}

export function bindTransportBar(options: TransportBarOptions): TransportBar {
  const { runtime, elements } = options;
  const { play, scrub, time } = elements;

  const sync = () => {
    const frame = runtime.currentFrame();
    scrub.max = String(Math.max(0, runtime.timeline.length - 1));
    scrub.value = String(runtime.currentIndex());
    play.textContent = runtime.isPlaying() ? "❚❚" : "▶";
    if (frame) {
      time.textContent = `${frame.t.toFixed(2)} ${runtime.model.time?.unit ?? "s"}`;
    }
  };

  const onScrub = () => runtime.seekIndex(Number(scrub.value));
  const onPlay = () => runtime.toggle();

  scrub.addEventListener("input", onScrub);
  play.addEventListener("click", onPlay);

  const unsubscribe = runtime.subscribe((event) => {
    if (
      event.type === "frame" ||
      event.type === "rebuild" ||
      event.type === "run-seek" ||
      event.type === "run-state-changed"
    ) {
      sync();
    }
  });

  sync();

  return {
    sync,
    dispose: () => {
      unsubscribe();
      scrub.removeEventListener("input", onScrub);
      play.removeEventListener("click", onPlay);
    },
  };
}
