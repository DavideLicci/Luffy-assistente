import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

import { readJsonFile, writeJsonFile } from "../utils/fileStore.js";
import { slugify } from "../utils/normalization.js";

export type MemoryPreferenceValue = string | number | boolean;

export type AppUsageEntry = {
  appId: string;
  displayName: string;
  count: number;
  lastUsedAt: string;
};

export type ContextEntry = {
  id: string;
  key: string;
  value: string;
  updatedAt: string;
};

export type StructuredMemory = {
  version: number;
  preferences: Record<string, MemoryPreferenceValue>;
  appUsage: AppUsageEntry[];
  contextData: ContextEntry[];
};

const STRUCTURED_MEMORY_VERSION = 1;

const DEFAULT_STRUCTURED_MEMORY: StructuredMemory = {
  version: STRUCTURED_MEMORY_VERSION,
  preferences: {},
  appUsage: [],
  contextData: []
};

function getMemoryPath(): string {
  if (process.env.LUFFY_STRUCTURED_MEMORY_PATH) {
    return process.env.LUFFY_STRUCTURED_MEMORY_PATH;
  }

  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ??
      path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "LuffyAssistant", "memory-structured.json");
  }

  return path.join(os.homedir(), ".luffy-assistant", "memory-structured.json");
}

function migrate(raw: unknown): StructuredMemory {
  const candidate = (raw ?? {}) as Partial<StructuredMemory>;
  const preferences =
    candidate.preferences && typeof candidate.preferences === "object"
      ? Object.fromEntries(
          Object.entries(candidate.preferences).filter(
            ([key, value]) =>
              key.trim().length > 0 &&
              (typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean")
          )
        )
      : {};

  const appUsage = Array.isArray(candidate.appUsage)
    ? candidate.appUsage
        .map((entry) => ({
          appId: slugify(String(entry.appId ?? "")),
          displayName: String(entry.displayName ?? "").trim(),
          count: Number(entry.count ?? 0),
          lastUsedAt: String(entry.lastUsedAt ?? "")
        }))
        .filter((entry) => entry.appId && entry.displayName && entry.count > 0)
    : [];

  const contextData = Array.isArray(candidate.contextData)
    ? candidate.contextData
        .map((entry) => ({
          id: String(entry.id ?? ""),
          key: String(entry.key ?? "").trim(),
          value: String(entry.value ?? "").trim(),
          updatedAt: String(entry.updatedAt ?? "")
        }))
        .filter((entry) => entry.id && entry.key)
    : [];

  return {
    version: STRUCTURED_MEMORY_VERSION,
    preferences,
    appUsage,
    contextData
  };
}

export class StructuredMemoryStore {
  constructor(private readonly filePath = getMemoryPath()) {}

  get(): StructuredMemory {
    const raw = readJsonFile<unknown>(this.filePath, DEFAULT_STRUCTURED_MEMORY);
    const migrated = migrate(raw);
    writeJsonFile(this.filePath, migrated);
    return migrated;
  }

  setPreference(key: string, value: MemoryPreferenceValue): StructuredMemory {
    const current = this.get();
    const next = {
      ...current,
      preferences: { ...current.preferences, [key.trim()]: value }
    };
    writeJsonFile(this.filePath, next);
    return next;
  }

  removePreference(key: string): StructuredMemory {
    const current = this.get();
    const nextPreferences = { ...current.preferences };
    delete nextPreferences[key.trim()];
    const next = { ...current, preferences: nextPreferences };
    writeJsonFile(this.filePath, next);
    return next;
  }

  upsertContext(key: string, value: string): StructuredMemory {
    const current = this.get();
    const cleanKey = key.trim();
    const cleanValue = value.trim();
    const now = new Date().toISOString();

    const existing = current.contextData.find(
      (entry) => entry.key.toLowerCase() === cleanKey.toLowerCase()
    );

    const nextContext = existing
      ? current.contextData.map((entry) =>
          entry.id === existing.id
            ? { ...entry, value: cleanValue, updatedAt: now }
            : entry
        )
      : [
          ...current.contextData,
          {
            id: crypto.randomUUID(),
            key: cleanKey,
            value: cleanValue,
            updatedAt: now
          }
        ];

    const next = { ...current, contextData: nextContext };
    writeJsonFile(this.filePath, next);
    return next;
  }

  removeContext(id: string): StructuredMemory {
    const current = this.get();
    const next = {
      ...current,
      contextData: current.contextData.filter((entry) => entry.id !== id)
    };
    writeJsonFile(this.filePath, next);
    return next;
  }

  trackAppUsage(appId: string, displayName: string): StructuredMemory {
    const current = this.get();
    const now = new Date().toISOString();
    const normalizedAppId = slugify(appId);
    const found = current.appUsage.find((entry) => entry.appId === normalizedAppId);

    const nextUsage = found
      ? current.appUsage.map((entry) =>
          entry.appId === normalizedAppId
            ? { ...entry, count: entry.count + 1, lastUsedAt: now }
            : entry
        )
      : [
          ...current.appUsage,
          {
            appId: normalizedAppId,
            displayName,
            count: 1,
            lastUsedAt: now
          }
        ];

    const next = {
      ...current,
      appUsage: nextUsage.sort((a, b) => b.count - a.count)
    };
    writeJsonFile(this.filePath, next);
    return next;
  }
}

export const structuredMemoryStore = new StructuredMemoryStore();
