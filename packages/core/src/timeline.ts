import type { StateFrame } from "./protocol/types";

export class Timeline {
  private _frames: StateFrame[] = [];
  private _cursor = 0;

  load(frames: StateFrame[]): void {
    this._frames = frames.slice().sort((a, b) => a.t - b.t);
    this._cursor = 0;
  }

  append(frame: StateFrame): void {
    this._frames.push(frame);
  }

  get frames(): readonly StateFrame[] {
    return this._frames;
  }

  get cursor(): number {
    return this._cursor;
  }

  setCursor(index: number): void {
    if (!this._frames.length) return;
    this._cursor = Math.max(0, Math.min(this._frames.length - 1, index | 0));
  }

  get current(): StateFrame | undefined {
    return this._frames[this._cursor];
  }

  get length(): number {
    return this._frames.length;
  }

  get start(): number {
    return this._frames[0]?.t ?? 0;
  }

  get end(): number {
    return this._frames[this._frames.length - 1]?.t ?? 0;
  }

  get currentTime(): number {
    return this.current?.t ?? 0;
  }

  seekIndex(index: number): void {
    this.setCursor(index);
  }

  seekTime(t: number): void {
    if (!this._frames.length) return;
    let lo = 0;
    let hi = this._frames.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (this._frames[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    this._cursor = lo;
  }
}
