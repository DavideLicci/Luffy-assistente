import os from "node:os";
import path from "node:path";

import { readJsonFile, writeJsonFile } from "../utils/fileStore.js";

type MemoryShape = Record<string, unknown>;

function getMemoryPath(): string {
  if (process.env.LUFFY_MEMORY_PATH) {
    return process.env.LUFFY_MEMORY_PATH;
  }
  return path.join(os.tmpdir(), "luffy-assistant", "memory.json");
}

export class MemoryStore {
  constructor(private readonly filePath = getMemoryPath()) {}

  getAll(): MemoryShape {
    return readJsonFile<MemoryShape>(this.filePath, {});
  }

  set(key: string, value: unknown): MemoryShape {
    const current = this.getAll();
    const next = { ...current, [key]: value };
    writeJsonFile(this.filePath, next);
    return next;
  }
}

export const memoryStore = new MemoryStore();
