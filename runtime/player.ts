import type { ModelFrame } from "./model.schema";

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

export class ModelPlayer {
  private frames: ModelFrame[] = [];
  private cursor = 0;
  private playing = false;
  private raf = 0;
  private playbackRate = 1;

  constructor(
    private readonly onFrame: (frame: ModelFrame, index: number) => void,
    private readonly clock: PlayerClock = defaultClock,
  ) {}

  load(frames: ModelFrame[]) {
    this.pause();
    this.frames = frames.slice().sort((a, b) => a.t - b.t);
    this.cursor = 0;
    if (this.frames[0]) this.emit();
  }

  play() {
    if (this.playing || this.frames.length < 2) return;
    if (this.cursor >= this.frames.length - 1) this.cursor = 0;
    this.playing = true;
    let previous = this.clock.now();
    const tick = (now: number) => {
      if (!this.playing) return;
      const elapsed = ((now - previous) / 1000) * this.playbackRate;
      previous = now;
      const target = (this.frames[this.cursor]?.t ?? 0) + elapsed;
      while (this.cursor + 1 < this.frames.length && this.frames[this.cursor + 1].t <= target) {
        this.cursor += 1;
      }
      this.emit();
      if (this.cursor >= this.frames.length - 1) {
        this.pause();
        return;
      }
      this.raf = this.clock.requestAnimationFrame(tick);
    };
    this.raf = this.clock.requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    this.clock.cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: number) {
    if (!this.frames.length) return;
    let lo = 0;
    let hi = this.frames.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.frames[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    this.cursor = lo;
    this.emit();
  }

  seekIndex(index: number) {
    if (!this.frames.length) return;
    this.cursor = Math.max(0, Math.min(this.frames.length - 1, index | 0));
    this.emit();
  }

  step(delta: number) {
    this.seekIndex(this.cursor + delta);
  }

  setPlaybackRate(rate: number) {
    this.playbackRate = Math.max(0.01, rate);
  }

  get index() {
    return this.cursor;
  }

  get length() {
    return this.frames.length;
  }

  get isPlaying() {
    return this.playing;
  }

  get current() {
    return this.frames[this.cursor];
  }

  get allFrames() {
    return this.frames;
  }

  private emit() {
    const frame = this.frames[this.cursor];
    if (frame) this.onFrame(frame, this.cursor);
  }
}
