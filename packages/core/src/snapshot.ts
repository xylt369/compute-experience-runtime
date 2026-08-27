import type { ExperienceSnapshot, StateFrame } from "./protocol/types";

export const SNAPSHOT_STORAGE_KEY = "compute-experience-snapshot";

export function isSnapshot(value: unknown): value is ExperienceSnapshot {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.model !== "string" || !record.model) return false;
  if (typeof record.cursor !== "number" || !Number.isFinite(record.cursor)) return false;
  if (typeof record.savedAt !== "string") return false;
  if (!record.params || typeof record.params !== "object") return false;
  if (record.frames !== undefined && !Array.isArray(record.frames)) return false;
  if (record.runs !== undefined && !Array.isArray(record.runs)) return false;
  return true;
}

export function serializeSnapshot(snapshot: ExperienceSnapshot): string {
  return JSON.stringify(snapshot);
}

export function deserializeSnapshot(raw: string): ExperienceSnapshot {
  const parsed = JSON.parse(raw) as unknown;
  if (!isSnapshot(parsed)) throw new Error("Not a Compute Experience snapshot");
  return parsed;
}

export function makeSnapshot(
  modelId: string,
  params: Record<string, number>,
  cursor: number,
  options?: { version?: string; frames?: StateFrame[] },
): ExperienceSnapshot {
  const snapshot: ExperienceSnapshot = {
    model: modelId,
    params: { ...params },
    cursor,
    savedAt: new Date().toISOString(),
  };
  if (options?.version) snapshot.version = options.version;
  if (options?.frames) snapshot.frames = options.frames;
  return snapshot;
}

export function readStoredSnapshot(key = SNAPSHOT_STORAGE_KEY): ExperienceSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return deserializeSnapshot(raw);
  } catch {
    return null;
  }
}

export function writeStoredSnapshot(snapshot: ExperienceSnapshot, key = SNAPSHOT_STORAGE_KEY): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, serializeSnapshot(snapshot));
}

export function downloadSnapshot(snapshot: ExperienceSnapshot): void {
  const blob = new Blob([serializeSnapshot(snapshot)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${snapshot.model}-${snapshot.savedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readSnapshotFile(file: File): Promise<ExperienceSnapshot> {
  return file.text().then((text) => deserializeSnapshot(text));
}
