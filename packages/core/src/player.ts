import type { StateFrame } from "./protocol/types";
import type { Timeline } from "./timeline";

export interface PlayerClock {
  now: () => number;
  requestAnimationFrame: (cb: FrameRequestCallback) => number;
  cancelAnimationFrame: (id: number) => void;
}

const defaultClock: PlayerClock = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  requestAnimationFrame: (cb) => requestAnimationFrame(cb),
  cancelAnimationFrame: (id) => cancelAnimationFrame(id),
};

export class Player {
  private playing = false;
  private raf = 0;
  private playbackRate = 1;

  constructor(
    private readonly timeline: Timeline,
    private readonly onFrame: (frame: StateFrame, index: number) => void,
    private readonly clock: PlayerClock = defaultClock,
  ) {}

  load(frames: StateFrame[]): void {
    this.pause();
    this.timeline.load(frames);
    if (this.timeline.current) this.emit();
  }

  play(): void {
    const frames = this.timeline.frames;
    if (this.playing || frames.length < 2) return;
    if (this.timeline.cursor >= frames.length - 1) this.timeline.setCursor(0);
    this.playing = true;
    let previous = this.clock.now();
    const tick = (now: number) => {
      if (!this.playing) return;
      const elapsed = ((now - previous) / 1000) * this.playbackRate;
      previous = now;
      const target = (this.timeline.current?.t ?? 0) + elapsed;
      while (
        this.timeline.cursor + 1 < frames.length &&
        frames[this.timeline.cursor + 1].t <= target
      ) {
        this.timeline.setCursor(this.timeline.cursor + 1);
      }
      this.emit();
      if (this.timeline.cursor >= frames.length - 1) {
        this.pause();
        return;
      }
      this.raf = this.clock.requestAnimationFrame(tick);
    };
    this.raf = this.clock.requestAnimationFrame(tick);
  }

  pause(): void {
    this.playing = false;
    this.clock.cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(time: number): void {
    this.timeline.seekTime(time);
    this.emit();
  }

  seekIndex(index: number): void {
    this.timeline.seekIndex(index);
    this.emit();
  }

  step(delta: number): void {
    this.seekIndex(this.timeline.cursor + delta);
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = Math.max(0.01, rate);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private emit(): void {
    const frame = this.timeline.current;
    if (frame) this.onFrame(frame, this.timeline.cursor);
  }
}

/** @deprecated Use Player */
export const ModelPlayer = Player;
