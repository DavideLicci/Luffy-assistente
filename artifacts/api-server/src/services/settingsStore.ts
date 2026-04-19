import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import type {
  AllowedApp,
  AssistantPersonalityProfile,
  AssistantSettings,
  AssistantVoiceProfile
} from "../types/settings.js";
import { DEFAULT_SETTINGS, SETTINGS_VERSION } from "../types/settings.js";
import { readJsonFile, writeJsonFile } from "../utils/fileStore.js";
import { normalizeText, slugify } from "../utils/normalization.js";

function getDefaultSettingsPath(): string {
  if (process.env.LUFFY_SETTINGS_PATH) {
    return process.env.LUFFY_SETTINGS_PATH;
  }

  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ??
      path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "LuffyAssistant", "settings.json");
  }

  return path.join(os.homedir(), ".luffy-assistant", "settings.json");
}

function sanitizeAllowedApp(app: Partial<AllowedApp>): AllowedApp {
  const displayName = (app.displayName ?? "").trim();
  const executablePath = path.resolve((app.executablePath ?? "").trim());

  const aliases = (app.aliases ?? [])
    .map((alias) => alias.trim())
    .filter(Boolean);

  const id =
    app.id && app.id.trim().length > 0 ? slugify(app.id) : slugify(displayName);

  if (!id || !displayName || !executablePath) {
    throw new Error("Invalid allowed app payload.");
  }

  if (path.extname(executablePath).toLowerCase() !== ".exe") {
    throw new Error("Only .exe executables are allowed.");
  }

  return {
    id,
    displayName,
    executablePath,
    aliases: Array.from(new Set([displayName, ...aliases])).map((entry) =>
      normalizeText(entry)
    )
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeVoiceProfile(raw: unknown): AssistantVoiceProfile {
  const profile = (raw ?? {}) as Partial<AssistantVoiceProfile>;
  return {
    voiceURI:
      typeof profile.voiceURI === "string" && profile.voiceURI.trim()
        ? profile.voiceURI
        : null,
    rate: clamp(profile.rate, 0.5, 1.7, DEFAULT_SETTINGS.voiceProfile.rate),
    pitch: clamp(profile.pitch, 0.5, 1.7, DEFAULT_SETTINGS.voiceProfile.pitch),
    volume: clamp(profile.volume, 0, 1, DEFAULT_SETTINGS.voiceProfile.volume)
  };
}

function sanitizePersonalityProfile(raw: unknown): AssistantPersonalityProfile {
  const profile = (raw ?? {}) as Partial<AssistantPersonalityProfile>;
  const style =
    profile.style === "focused" || profile.style === "professional"
      ? profile.style
      : "friendly";
  return {
    style,
    customSystemNote:
      typeof profile.customSystemNote === "string" ? profile.customSystemNote.trim() : ""
  };
}

function migrateSettings(raw: unknown): AssistantSettings {
  const candidate = (raw ?? {}) as Partial<AssistantSettings>;

  const allowedApps = Array.isArray(candidate.allowedApps)
    ? candidate.allowedApps.map((app) => sanitizeAllowedApp(app))
    : [];

  return {
    version: SETTINGS_VERSION,
    startWithWindows:
      typeof candidate.startWithWindows === "boolean"
        ? candidate.startWithWindows
        : DEFAULT_SETTINGS.startWithWindows,
    startMinimizedToTray:
      typeof candidate.startMinimizedToTray === "boolean"
        ? candidate.startMinimizedToTray
        : DEFAULT_SETTINGS.startMinimizedToTray,
    pushToTalkHotkey:
      typeof candidate.pushToTalkHotkey === "string" &&
      candidate.pushToTalkHotkey.trim().length > 0
        ? candidate.pushToTalkHotkey
        : DEFAULT_SETTINGS.pushToTalkHotkey,
    commandPaletteHotkey:
      typeof candidate.commandPaletteHotkey === "string" &&
      candidate.commandPaletteHotkey.trim().length > 0
        ? candidate.commandPaletteHotkey
        : DEFAULT_SETTINGS.commandPaletteHotkey,
    voiceEnabled:
      typeof candidate.voiceEnabled === "boolean"
        ? candidate.voiceEnabled
        : DEFAULT_SETTINGS.voiceEnabled,
    onboardingCompleted:
      typeof candidate.onboardingCompleted === "boolean"
        ? candidate.onboardingCompleted
        : DEFAULT_SETTINGS.onboardingCompleted,
    microphoneDeviceId:
      typeof candidate.microphoneDeviceId === "string" && candidate.microphoneDeviceId.trim()
        ? candidate.microphoneDeviceId.trim()
        : null,
    voiceProfile: sanitizeVoiceProfile(candidate.voiceProfile),
    personalityProfile: sanitizePersonalityProfile(candidate.personalityProfile),
    allowedApps
  };
}

type SettingsPatch = {
  startWithWindows?: boolean;
  startMinimizedToTray?: boolean;
  pushToTalkHotkey?: string;
  commandPaletteHotkey?: string;
  voiceEnabled?: boolean;
  onboardingCompleted?: boolean;
  microphoneDeviceId?: string | null;
  voiceProfile?: Partial<AssistantVoiceProfile>;
  personalityProfile?: Partial<AssistantPersonalityProfile>;
};

export class SettingsStore {
  private readonly filePath: string;

  constructor(filePath = getDefaultSettingsPath()) {
    this.filePath = filePath;
  }

  getSettingsPath(): string {
    return this.filePath;
  }

  getSettings(): AssistantSettings {
    const raw = readJsonFile<unknown>(this.filePath, DEFAULT_SETTINGS);
    const migrated = migrateSettings(raw);
    writeJsonFile(this.filePath, migrated);
    return migrated;
  }

  updateSettings(patch: SettingsPatch): AssistantSettings {
    const current = this.getSettings();
    const next: AssistantSettings = {
      ...current,
      startWithWindows:
        typeof patch.startWithWindows === "boolean"
          ? patch.startWithWindows
          : current.startWithWindows,
      startMinimizedToTray:
        typeof patch.startMinimizedToTray === "boolean"
          ? patch.startMinimizedToTray
          : current.startMinimizedToTray,
      pushToTalkHotkey:
        typeof patch.pushToTalkHotkey === "string" && patch.pushToTalkHotkey.trim()
          ? patch.pushToTalkHotkey
          : current.pushToTalkHotkey,
      commandPaletteHotkey:
        typeof patch.commandPaletteHotkey === "string" && patch.commandPaletteHotkey.trim()
          ? patch.commandPaletteHotkey
          : current.commandPaletteHotkey,
      voiceEnabled:
        typeof patch.voiceEnabled === "boolean"
          ? patch.voiceEnabled
          : current.voiceEnabled,
      onboardingCompleted:
        typeof patch.onboardingCompleted === "boolean"
          ? patch.onboardingCompleted
          : current.onboardingCompleted,
      microphoneDeviceId:
        typeof patch.microphoneDeviceId === "string" && patch.microphoneDeviceId.trim()
          ? patch.microphoneDeviceId.trim()
          : patch.microphoneDeviceId === null
            ? null
            : current.microphoneDeviceId,
      voiceProfile: patch.voiceProfile
        ? sanitizeVoiceProfile({ ...current.voiceProfile, ...patch.voiceProfile })
        : current.voiceProfile,
      personalityProfile: patch.personalityProfile
        ? sanitizePersonalityProfile({
            ...current.personalityProfile,
            ...patch.personalityProfile
          })
        : current.personalityProfile,
      allowedApps: current.allowedApps
    };

    writeJsonFile(this.filePath, next);
    return next;
  }

  upsertAllowedApp(payload: Partial<AllowedApp>): AssistantSettings {
    const current = this.getSettings();
    const app = sanitizeAllowedApp(payload);
    const nextApps = current.allowedApps.filter((entry) => entry.id !== app.id);
    nextApps.push(app);
    const next = { ...current, allowedApps: nextApps };
    writeJsonFile(this.filePath, next);
    return next;
  }

  removeAllowedApp(appId: string): AssistantSettings {
    const current = this.getSettings();
    const next = {
      ...current,
      allowedApps: current.allowedApps.filter((app) => app.id !== slugify(appId))
    };
    writeJsonFile(this.filePath, next);
    return next;
  }

  resolveAllowedApp(aliasOrId: string): AllowedApp | undefined {
    const needle = normalizeText(aliasOrId);
    const settings = this.getSettings();

    return settings.allowedApps.find(
      (app) =>
        app.id === slugify(needle) ||
        app.aliases.includes(needle) ||
        normalizeText(app.displayName) === needle
    );
  }

  launchAllowedApp(appId: string): { ok: boolean; reason?: string } {
    const app = this.resolveAllowedApp(appId);
    if (!app) {
      return { ok: false, reason: "not_whitelisted" };
    }

    if (!fs.existsSync(app.executablePath)) {
      return { ok: false, reason: "executable_not_found" };
    }

    try {
      const child = spawn(app.executablePath, [], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
      child.unref();
      return { ok: true };
    } catch {
      return { ok: false, reason: "launch_error" };
    }
  }
}

export const settingsStore = new SettingsStore();
