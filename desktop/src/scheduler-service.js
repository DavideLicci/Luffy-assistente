const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function getDefaultSchedulerPath() {
  if (process.env.LUFFY_REMINDERS_PATH) {
    return process.env.LUFFY_REMINDERS_PATH;
  }
  const appData =
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "LuffyAssistant", "reminders.json");
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeReminder(raw) {
  const entry = raw && typeof raw === "object" ? raw : {};
  const id = String(entry.id || crypto.randomUUID());
  const title = String(entry.title || "Promemoria Luffy").trim();
  const message = String(entry.message || "").trim();
  const at = String(entry.at || "");
  const enabled = typeof entry.enabled === "boolean" ? entry.enabled : true;
  const repeat =
    entry.repeat === "daily" || entry.repeat === "weekdays" ? entry.repeat : "none";
  const action =
    entry.action && typeof entry.action === "object"
      ? {
          type:
            entry.action.type === "open_app" || entry.action.type === "command"
              ? entry.action.type
              : "none",
          target: String(entry.action.target || "").trim()
        }
      : { type: "none", target: "" };

  const lastTriggeredAt =
    typeof entry.lastTriggeredAt === "string" && entry.lastTriggeredAt
      ? entry.lastTriggeredAt
      : null;

  const parsedAt = Date.parse(at);
  if (!title || Number.isNaN(parsedAt)) {
    return null;
  }

  return {
    id,
    title,
    message,
    at: new Date(parsedAt).toISOString(),
    enabled,
    repeat,
    action,
    lastTriggeredAt
  };
}

function nextOccurrence(reminder) {
  const currentAt = new Date(reminder.at);
  if (reminder.repeat === "none") {
    return null;
  }

  const next = new Date(currentAt);
  if (reminder.repeat === "daily") {
    next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  do {
    next.setDate(next.getDate() + 1);
  } while (next.getDay() === 0 || next.getDay() === 6);

  return next.toISOString();
}

class SchedulerService {
  constructor(filePath = getDefaultSchedulerPath()) {
    this.filePath = filePath;
    this.timers = new Map();
    this.triggerCallback = null;
  }

  read() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return [];
      }
      const payload = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (!Array.isArray(payload)) {
        return [];
      }
      return payload.map((entry) => normalizeReminder(entry)).filter(Boolean);
    } catch {
      return [];
    }
  }

  write(reminders) {
    ensureParent(this.filePath);
    fs.writeFileSync(this.filePath, JSON.stringify(reminders, null, 2), "utf8");
  }

  list() {
    const items = this.read();
    return items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }

  upsert(payload) {
    const normalized = normalizeReminder(payload);
    if (!normalized) {
      throw new Error("Reminder payload non valido.");
    }
    const current = this.list();
    const next = current.filter((entry) => entry.id !== normalized.id);
    next.push(normalized);
    this.write(next);
    this.rescheduleAll();
    return this.list();
  }

  remove(id) {
    const current = this.list();
    const next = current.filter((entry) => entry.id !== id);
    this.write(next);
    this.rescheduleAll();
    return this.list();
  }

  markTriggered(id) {
    const current = this.list();
    const now = new Date().toISOString();
    const next = current
      .map((entry) => {
        if (entry.id !== id) {
          return entry;
        }
        const followUp = nextOccurrence(entry);
        if (!followUp) {
          return { ...entry, enabled: false, lastTriggeredAt: now };
        }
        return {
          ...entry,
          at: followUp,
          lastTriggeredAt: now,
          enabled: true
        };
      })
      .filter(Boolean);

    this.write(next);
    this.rescheduleAll();
    return this.list();
  }

  triggerNow(id, callback) {
    const reminder = this.list().find((entry) => entry.id === id);
    if (!reminder) {
      return false;
    }
    callback(reminder);
    this.markTriggered(id);
    return true;
  }

  rescheduleAll(callback) {
    if (typeof callback === "function") {
      this.triggerCallback = callback;
    }

    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    const cb = this.triggerCallback;
    if (!cb) {
      return;
    }

    const now = Date.now();
    for (const reminder of this.list()) {
      if (!reminder.enabled) {
        continue;
      }
      const fireAt = Date.parse(reminder.at);
      if (Number.isNaN(fireAt)) {
        continue;
      }
      const delay = Math.max(0, fireAt - now);
      const timer = setTimeout(() => {
        cb(reminder);
        this.markTriggered(reminder.id);
      }, delay);
      this.timers.set(reminder.id, timer);
    }
  }

  dispose() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}

module.exports = {
  SchedulerService
};
