import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

import type { AssistantIntent, HistoryOutcome } from "../types/assistant.js";
import { readJsonFile, writeJsonFile } from "../utils/fileStore.js";

export type CommandHistoryEntry = {
  id: string;
  input: string;
  intent: AssistantIntent;
  outcome: HistoryOutcome;
  source: "text" | "voice";
  timestamp: string;
};

function getHistoryPath(): string {
  if (process.env.LUFFY_HISTORY_PATH) {
    return process.env.LUFFY_HISTORY_PATH;
  }
  return path.join(os.tmpdir(), "luffy-assistant", "history.json");
}

export class CommandHistoryStore {
  constructor(private readonly filePath = getHistoryPath()) {}

  list(limit = 30): CommandHistoryEntry[] {
    const entries = readJsonFile<CommandHistoryEntry[]>(this.filePath, []);
    return [...entries]
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, limit);
  }

  add(
    payload: Omit<CommandHistoryEntry, "id" | "timestamp">
  ): CommandHistoryEntry {
    const entry: CommandHistoryEntry = {
      ...payload,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    };
    const entries = this.list(500);
    entries.unshift(entry);
    writeJsonFile(this.filePath, entries);
    return entry;
  }
}

export const commandHistoryStore = new CommandHistoryStore();
