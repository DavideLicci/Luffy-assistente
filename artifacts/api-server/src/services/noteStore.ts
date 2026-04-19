import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { readJsonFile, writeJsonFile } from "../utils/fileStore.js";

export type NoteEntry = {
  id: string;
  text: string;
  createdAt: string;
};

function getNotesPath(): string {
  if (process.env.LUFFY_NOTES_PATH) {
    return process.env.LUFFY_NOTES_PATH;
  }
  return path.join(os.tmpdir(), "luffy-assistant", "notes.json");
}

export class NoteStore {
  constructor(private readonly filePath = getNotesPath()) {}

  list(limit = 20): NoteEntry[] {
    const notes = readJsonFile<NoteEntry[]>(this.filePath, []);
    return [...notes]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  }

  add(text: string): NoteEntry {
    const next: NoteEntry = {
      id: crypto.randomUUID(),
      text: text.trim(),
      createdAt: new Date().toISOString()
    };
    const notes = this.list(500);
    notes.unshift(next);
    writeJsonFile(this.filePath, notes);
    return next;
  }
}

export const noteStore = new NoteStore();
