import type { ModelFrame } from "../protocol/types";
import type { MemoryPage, PageAllocationOptions, PageId, PageTableStats } from "./types";

let globalPageSequence = 1;

export class CoWPageTable {
  readonly pageSize: number;
  readonly fields: readonly string[];
  readonly stateDimension: number;
  readonly stride: number; // 1 (for t) + stateDimension

  private pages: MemoryPage[] = [];
  private totalSteps = 0;

  constructor(options: PageAllocationOptions) {
    this.pageSize = Math.max(8, options.pageSize ?? 64);
    this.fields = [...options.stateFields];
    this.stateDimension = this.fields.length;
    this.stride = 1 + this.stateDimension;
  }

  get length(): number {
    return this.totalSteps;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  private createPage(): MemoryPage {
    const id = globalPageSequence++;
    const buffer = new Float64Array(this.pageSize * this.stride);
    return {
      id,
      capacity: this.pageSize,
      stateDimension: this.stateDimension,
      fields: this.fields,
      buffer,
      refCount: 1,
      length: 0,
    };
  }

  private clonePage(source: MemoryPage, upToLength?: number): MemoryPage {
    const id = globalPageSequence++;
    const len = upToLength !== undefined ? Math.min(source.length, upToLength) : source.length;
    const buffer = new Float64Array(this.pageSize * this.stride);
    buffer.set(source.buffer.subarray(0, len * this.stride));
    return {
      id,
      capacity: this.pageSize,
      stateDimension: this.stateDimension,
      fields: this.fields,
      buffer,
      refCount: 1,
      length: len,
    };
  }

  pushFrame(t: number, state: Record<string, number>): void {
    let currentPage = this.pages[this.pages.length - 1];

    if (!currentPage || currentPage.length >= currentPage.capacity) {
      currentPage = this.createPage();
      this.pages.push(currentPage);
    } else if (currentPage.refCount > 1) {
      // Copy-on-Write: unshare the page before mutating
      currentPage.refCount--;
      const unsharedPage = this.clonePage(currentPage);
      this.pages[this.pages.length - 1] = unsharedPage;
      currentPage = unsharedPage;
    }

    const offset = currentPage.length * this.stride;
    currentPage.buffer[offset] = t;
    for (let i = 0; i < this.stateDimension; i++) {
      const key = this.fields[i]!;
      currentPage.buffer[offset + 1 + i] = state[key] ?? 0;
    }

    currentPage.length++;
    this.totalSteps++;
  }

  getFrame(index: number): ModelFrame | undefined {
    if (index < 0 || index >= this.totalSteps) return undefined;

    const pageIndex = Math.floor(index / this.pageSize);
    const stepInPage = index % this.pageSize;
    const page = this.pages[pageIndex];
    if (!page) return undefined;

    const offset = stepInPage * this.stride;
    const t = page.buffer[offset]!;
    const state: Record<string, number> = {};
    for (let i = 0; i < this.stateDimension; i++) {
      const key = this.fields[i]!;
      state[key] = page.buffer[offset + 1 + i]!;
    }

    return { t, state };
  }

  getAllFrames(): ModelFrame[] {
    const frames: ModelFrame[] = new Array(this.totalSteps);
    let outIdx = 0;
    for (const page of this.pages) {
      for (let s = 0; s < page.length; s++) {
        const offset = s * this.stride;
        const t = page.buffer[offset]!;
        const state: Record<string, number> = {};
        for (let i = 0; i < this.stateDimension; i++) {
          const key = this.fields[i]!;
          state[key] = page.buffer[offset + 1 + i]!;
        }
        frames[outIdx++] = { t, state };
      }
    }
    return frames;
  }

  /**
   * Fork a child PageTable sharing historical pages by reference count (CoW).
   */
  fork(upToStep: number): CoWPageTable {
    const targetSteps = Math.max(0, Math.min(this.totalSteps, upToStep + 1));
    const child = new CoWPageTable({
      pageSize: this.pageSize,
      stateFields: this.fields,
    });

    if (targetSteps === 0) return child;

    const fullPagesCount = Math.floor(targetSteps / this.pageSize);
    const partialSteps = targetSteps % this.pageSize;

    for (let i = 0; i < fullPagesCount; i++) {
      const p = this.pages[i]!;
      p.refCount++;
      child.pages.push(p);
    }

    if (partialSteps > 0) {
      const lastPage = this.pages[fullPagesCount]!;
      // Clone only the partial boundary page
      const partialPage = this.clonePage(lastPage, partialSteps);
      child.pages.push(partialPage);
    }

    child.totalSteps = targetSteps;
    return child;
  }

  /**
   * Release page references when disposing table.
   */
  dispose(): void {
    for (const page of this.pages) {
      page.refCount--;
    }
    this.pages = [];
    this.totalSteps = 0;
  }

  stats(): PageTableStats {
    let shared = 0;
    let bytes = 0;
    for (const p of this.pages) {
      if (p.refCount > 1) shared++;
      bytes += p.buffer.byteLength;
    }
    return {
      totalPagesAllocated: this.pages.length,
      activePages: this.pages.length,
      sharedPages: shared,
      totalFrames: this.totalSteps,
      memoryBytes: bytes,
    };
  }
}
