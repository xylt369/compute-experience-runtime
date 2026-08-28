import { describe, expect, it } from "vitest";
import { CoWPageTable } from "@compute-experience/core";

describe("CoWPageTable Memory Subsystem", () => {
  it("allocates chunked pages and reads frames correctly", () => {
    const table = new CoWPageTable({
      pageSize: 16,
      stateFields: ["x", "y", "z"],
    });

    for (let i = 0; i < 40; i++) {
      table.pushFrame(i * 0.1, { x: i, y: i * 2, z: i * 3 });
    }

    expect(table.length).toBe(40);
    expect(table.pageCount).toBe(3); // 16 + 16 + 8 = 40 (3 pages)

    const f0 = table.getFrame(0);
    expect(f0?.t).toBe(0);
    expect(f0?.state).toEqual({ x: 0, y: 0, z: 0 });

    const f25 = table.getFrame(25);
    expect(f25?.t).toBeCloseTo(2.5);
    expect(f25?.state).toEqual({ x: 25, y: 50, z: 75 });

    const stats = table.stats();
    expect(stats.totalFrames).toBe(40);
    expect(stats.sharedPages).toBe(0);
  });

  it("shares pages upon fork and clones only upon mutation (Copy-on-Write)", () => {
    const parent = new CoWPageTable({
      pageSize: 16,
      stateFields: ["x", "y"],
    });

    for (let i = 0; i < 32; i++) {
      parent.pushFrame(i * 0.1, { x: i, y: i * 10 });
    }

    expect(parent.pageCount).toBe(2);

    // Fork at step 31 (takes both full pages)
    const child = parent.fork(31);
    expect(child.length).toBe(32);
    expect(child.pageCount).toBe(2);

    // Both pages should now be shared
    const parentStatsBefore = parent.stats();
    expect(parentStatsBefore.sharedPages).toBe(2);

    // Push new frame to child -> triggers CoW on the last page
    child.pushFrame(3.2, { x: 999, y: 888 });

    expect(child.length).toBe(33);
    const childF32 = child.getFrame(32);
    expect(childF32?.state.x).toBe(999);

    // Parent should remain unaffected
    expect(parent.length).toBe(32);
    expect(parent.getFrame(31)?.state.x).toBe(31);
  });

  it("handles partial boundary page forks cleanly", () => {
    const parent = new CoWPageTable({
      pageSize: 16,
      stateFields: ["val"],
    });

    for (let i = 0; i < 20; i++) {
      parent.pushFrame(i, { val: i });
    }

    // Fork at index 10 (inside first page)
    const child = parent.fork(10);
    expect(child.length).toBe(11);
    expect(child.getFrame(10)?.state.val).toBe(10);
    expect(child.getFrame(11)).toBeUndefined();
  });
});
