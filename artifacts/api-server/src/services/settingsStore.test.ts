import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SettingsStore } from "./settingsStore.js";

test("settings store applies defaults and persists patch", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "luffy-settings-test-"));
  const settingsPath = path.join(tempDir, "settings.json");

  const store = new SettingsStore(settingsPath);
  const initial = store.getSettings();
  assert.equal(initial.startMinimizedToTray, true);

  const next = store.updateSettings({
    startWithWindows: true,
    pushToTalkHotkey: "Ctrl+Alt+Space"
  });
  assert.equal(next.startWithWindows, true);
  assert.equal(next.pushToTalkHotkey, "Ctrl+Alt+Space");

  const added = store.upsertAllowedApp({
    displayName: "Chrome",
    aliases: ["google chrome"],
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  assert.equal(added.allowedApps.length, 1);
  assert.ok(store.resolveAllowedApp("google chrome"));
});
