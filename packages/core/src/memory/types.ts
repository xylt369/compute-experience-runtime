/**
 * Core types for Copy-on-Write (CoW) page-table timeline memory management.
 */

export type PageId = number;

export interface MemoryPage {
  readonly id: PageId;
  readonly capacity: number;
  readonly stateDimension: number;
  readonly fields: readonly string[];
  readonly buffer: Float64Array;
  refCount: number;
  length: number;
}

export interface PageTableStats {
  totalPagesAllocated: number;
  activePages: number;
  sharedPages: number;
  totalFrames: number;
  memoryBytes: number;
}

export interface PageAllocationOptions {
  pageSize?: number;
  stateFields: readonly string[];
}
