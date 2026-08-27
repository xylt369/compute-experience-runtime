import type { ExperienceSnapshot, ModelFrame } from "../../runtime/model.schema";

export const SNAPSHOT_KEY = "compute-experience-snapshot";

export function isSnapshot(value: unknown): value is ExperienceSnapshot {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.model !== "string" || !record.model) return false;
  if (typeof record.cursor !== "number" || !Number.isFinite(record.cursor)) return false;
  if (typeof record.savedAt !== "string") return false;
  if (!record.params || typeof record.params !== "object") return false;
  if (record.frames !== undefined && !Array.isArray(record.frames)) return false;
  return true;
}

export function readStoredSnapshot(): ExperienceSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredSnapshot(snapshot: ExperienceSnapshot): void {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function makeSnapshot(
  model: string,
  params: Record<string, number>,
  cursor: number,
  frames?: ModelFrame[],
): ExperienceSnapshot {
  const snapshot: ExperienceSnapshot = {
    model,
    params: { ...params },
    cursor,
    savedAt: new Date().toISOString(),
  };
  if (frames) snapshot.frames = frames;
  return snapshot;
}

export function downloadSnapshot(snapshot: ExperienceSnapshot): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${snapshot.model}-${snapshot.savedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readSnapshotFile(file: File): Promise<ExperienceSnapshot> {
  return file.text().then((text) => {
    const parsed = JSON.parse(text) as unknown;
    if (!isSnapshot(parsed)) throw new Error("Not a Compute Experience snapshot");
    return parsed;
  });
}
