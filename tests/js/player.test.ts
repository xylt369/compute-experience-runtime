import { describe, expect, it } from "vitest";
import { Player, type PlayerClock } from "@compute-experience/core";
import type { StateFrame } from "@compute-experience/core";
import { Timeline } from "@compute-experience/core";

function framesAt(times: number[]): StateFrame[] {
  return times.map((t) => ({ t, state: { x: t }, derived: { radius: t } }));
}

function makeClock() {
  let now = 0;
  const queue: FrameRequestCallback[] = [];
  const clock: PlayerClock = {
    now: () => now,
    requestAnimationFrame: (cb) => {
      queue.push(cb);
      return queue.length;
    },
    cancelAnimationFrame: () => {
      queue.length = 0;
    },
  };
  return {
    clock,
    flush(ms: number) {
      now += ms;
      const pending = queue.splice(0);
      for (const cb of pending) cb(now);
    },
  };
}

describe("Timeline", () => {
  it("tracks frames, cursor, and time bounds", () => {
    const timeline = new Timeline();
    timeline.load(framesAt([0, 0.1, 0.2, 0.3]));
    expect(timeline.length).toBe(4);
    expect(timeline.start).toBe(0);
    expect(timeline.end).toBe(0.3);
    timeline.seekTime(0.2);
    expect(timeline.currentTime).toBe(0.2);
    timeline.seekIndex(1);
    expect(timeline.cursor).toBe(1);
  });
});

describe("Player", () => {
  it("loads the first frame and seeks by time and index", () => {
    const timeline = new Timeline();
    const seen: number[] = [];
    const player = new Player(timeline, (frame) => {
      seen.push(frame.t);
    });
    player.load(framesAt([0, 0.1, 0.2, 0.3]));
    expect(timeline.cursor).toBe(0);
    expect(seen).toEqual([0]);

    player.seek(0.2);
    expect(timeline.cursor).toBe(2);
    expect(timeline.current?.t).toBe(0.2);

    player.seekIndex(1);
    expect(timeline.cursor).toBe(1);
    player.step(1);
    expect(timeline.cursor).toBe(2);
  });

  it("plays until the last frame and then stops", () => {
    const timeline = new Timeline();
    const { clock, flush } = makeClock();
    const seen: number[] = [];
    const player = new Player(
      timeline,
      (frame) => {
        seen.push(frame.t);
      },
      clock,
    );
    player.load(framesAt([0, 0.05, 0.1, 0.15]));
    player.setPlaybackRate(1);
    player.play();
    expect(player.isPlaying).toBe(true);

    for (let i = 0; i < 20; i += 1) flush(50);

    expect(player.isPlaying).toBe(false);
    expect(timeline.cursor).toBe(3);
    expect(seen.at(-1)).toBe(0.15);
  });
});
