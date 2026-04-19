const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SETTINGS_VERSION = 2;
const DEFAULT_SETTINGS = {
  version: SETTINGS_VERSION,
  startWithWindows: false,
  startMinimizedToTray: true,
  pushToTalkHotkey: "CommandOrControl+Shift+Space",
  commandPaletteHotkey: "CommandOrControl+Shift+P",
  voiceEnabled: true,
  onboardingCompleted: false,
  microphoneDeviceId: null,
  voiceProfile: {
    voiceURI: null,
    rate: 1,
    pitch: 1,
    volume: 1
  },
  personalityProfile: {
    style: "friendly",
    customSystemNote: ""
  },
  allowedApps: []
};

function getSettingsPath() {
  if (process.env.LUFFY_SETTINGS_PATH) {
    return process.env.LUFFY_SETTINGS_PATH;
  }
  const appData =
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "LuffyAssistant", "settings.json");
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeAllowedApp(app) {
  const displayName = String(app.displayName || "").trim();
  const executablePath = path.resolve(String(app.executablePath || "").trim());
  const aliases = Array.isArray(app.aliases)
    ? app.aliases
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => normalizeText(entry))
    : [];

  const id = app.id ? slugify(app.id) : slugify(displayName);
  if (!id || !displayName || !executablePath) {
    return null;
  }
  return {
    id,
    displayName,
    aliases: Array.from(new Set([normalizeText(displayName), ...aliases])),
    executablePath
  };
}

function clamp(value, min, max, fallback) {
  const numeric = typeof value === "number" ? value : Number.NaN;
  if (Number.isNaN(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

function sanitizeVoiceProfile(raw) {
  const profile = raw && typeof raw === "object" ? raw : {};
  return {
    voiceURI:
      typeof profile.voiceURI === "string" && profile.voiceURI.trim()
        ? profile.voiceURI.trim()
        : null,
    rate: clamp(profile.rate, 0.5, 1.7, DEFAULT_SETTINGS.voiceProfile.rate),
    pitch: clamp(profile.pitch, 0.5, 1.7, DEFAULT_SETTINGS.voiceProfile.pitch),
    volume: clamp(profile.volume, 0, 1, DEFAULT_SETTINGS.voiceProfile.volume)
  };
}

function sanitizePersonalityProfile(raw) {
  const profile = raw && typeof raw === "object" ? raw : {};
  const style =
    profile.style === "focused" || profile.style === "professional"
      ? profile.style
      : DEFAULT_SETTINGS.personalityProfile.style;
  return {
    style,
    customSystemNote:
      typeof profile.customSystemNote === "string" ? profile.customSystemNote.trim() : ""
  };
}

function migrate(raw) {
  const candidate = raw && typeof raw === "object" ? raw : {};
  const allowedApps = Array.isArray(candidate.allowedApps)
    ? candidate.allowedApps
        .map((entry) => sanitizeAllowedApp(entry))
        .filter(Boolean)
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
      candidate.pushToTalkHotkey.trim()
        ? candidate.pushToTalkHotkey
        : DEFAULT_SETTINGS.pushToTalkHotkey,
    commandPaletteHotkey:
      typeof candidate.commandPaletteHotkey === "string" &&
      candidate.commandPaletteHotkey.trim()
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

class DesktopSettingsStore {
  constructor(filePath = getSettingsPath()) {
    this.filePath = filePath;
  }

  getPath() {
    return this.filePath;
  }

  get() {
    let current = DEFAULT_SETTINGS;
    try {
      if (fs.existsSync(this.filePath)) {
        current = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      }
    } catch {
      current = DEFAULT_SETTINGS;
    }
    const migrated = migrate(current);
    this.write(migrated);
    return migrated;
  }

  write(payload) {
    ensureParent(this.filePath);
    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  patch(partial) {
    const current = this.get();
    const next = {
      ...current,
      startWithWindows:
        typeof partial.startWithWindows === "boolean"
          ? partial.startWithWindows
          : current.startWithWindows,
      startMinimizedToTray:
        typeof partial.startMinimizedToTray === "boolean"
          ? partial.startMinimizedToTray
          : current.startMinimizedToTray,
      pushToTalkHotkey:
        typeof partial.pushToTalkHotkey === "string" && partial.pushToTalkHotkey.trim()
          ? partial.pushToTalkHotkey
          : current.pushToTalkHotkey,
      commandPaletteHotkey:
        typeof partial.commandPaletteHotkey === "string" &&
        partial.commandPaletteHotkey.trim()
          ? partial.commandPaletteHotkey
          : current.commandPaletteHotkey,
      voiceEnabled:
        typeof partial.voiceEnabled === "boolean"
          ? partial.voiceEnabled
          : current.voiceEnabled,
      onboardingCompleted:
        typeof partial.onboardingCompleted === "boolean"
          ? partial.onboardingCompleted
          : current.onboardingCompleted,
      microphoneDeviceId:
        typeof partial.microphoneDeviceId === "string" && partial.microphoneDeviceId.trim()
          ? partial.microphoneDeviceId.trim()
          : partial.microphoneDeviceId === null
            ? null
            : current.microphoneDeviceId,
      voiceProfile: partial.voiceProfile
        ? sanitizeVoiceProfile({ ...current.voiceProfile, ...partial.voiceProfile })
        : current.voiceProfile,
      personalityProfile: partial.personalityProfile
        ? sanitizePersonalityProfile({
            ...current.personalityProfile,
            ...partial.personalityProfile
          })
        : current.personalityProfile,
      allowedApps: current.allowedApps
    };
    this.write(next);
    return next;
  }
}

module.exports = {
  DesktopSettingsStore,
  DEFAULT_SETTINGS
};
