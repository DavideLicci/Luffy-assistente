const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

class LauncherService {
  constructor(settingsStore) {
    this.settingsStore = settingsStore;
  }

  openById(appId) {
    const settings = this.settingsStore.get();
    const app = settings.allowedApps.find((entry) => entry.id === appId);
    if (!app) {
      return { ok: false, reason: "not_whitelisted" };
    }

    if (path.extname(app.executablePath).toLowerCase() !== ".exe") {
      return { ok: false, reason: "invalid_executable" };
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

module.exports = {
  LauncherService
};
