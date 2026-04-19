const path = require("node:path");
const { pathToFileURL } = require("node:url");

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  globalShortcut,
  Notification
} = require("electron");
const isDev = require("electron-is-dev");

const { DesktopSettingsStore, DEFAULT_SETTINGS } = require("./settings-store");
const { LauncherService } = require("./launcher-service");
const { VoskVoiceService, defaultModelPath } = require("./voice/vosk-service");
const { SchedulerService } = require("./scheduler-service");

const APP_NAME = "Luffy Assistant";
const API_PORT = Number(process.env.PORT || 8080);
const WEB_PORT = Number(process.env.WEB_PORT || 3000);

const settingsStore = new DesktopSettingsStore();
const launcherService = new LauncherService(settingsStore);
const voiceService = new VoskVoiceService({
  modelPath: defaultModelPath()
});
const schedulerService = new SchedulerService();

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let quitting = false;

function sendToRenderers(channel, payload) {
  for (const win of [mainWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

function getBaseUrl() {
  if (isDev) {
    return `http://127.0.0.1:${WEB_PORT}`;
  }
  return `http://127.0.0.1:${API_PORT}`;
}

function getMainWindowUrl() {
  return getBaseUrl();
}

function getOverlayWindowUrl() {
  return `${getBaseUrl()}?overlay=1`;
}

function getNotificationIcon() {
  const iconPath = path.join(__dirname, "../assets/luffy_icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? undefined : icon;
}

function showNativeNotification(payload) {
  if (!Notification.isSupported()) {
    return;
  }
  const title = payload && payload.title ? String(payload.title) : APP_NAME;
  const body = payload && payload.body ? String(payload.body) : "";
  const silent = payload && typeof payload.silent === "boolean" ? payload.silent : true;
  const icon = getNotificationIcon();

  const notification = new Notification({
    title,
    body,
    silent,
    icon
  });
  notification.show();
}

function applyLoginSettings(settings) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(settings.startWithWindows),
    args: settings.startMinimizedToTray ? ["--startup-tray"] : []
  });
}

function registerGlobalHotkeys(settings) {
  globalShortcut.unregisterAll();

  try {
    const pushToTalkRegistered = globalShortcut.register(
      settings.pushToTalkHotkey || DEFAULT_SETTINGS.pushToTalkHotkey,
      () => {
        sendToRenderers("hotkey:push-to-talk");
      }
    );
    if (!pushToTalkRegistered) {
      sendToRenderers("voice:error", {
        code: "HOTKEY_REGISTER_FAILED",
        message: `Non riesco a registrare la hotkey push-to-talk (${settings.pushToTalkHotkey}).`
      });
    }
  } catch (error) {
    sendToRenderers("voice:error", {
      code: "HOTKEY_ERROR",
      message: error instanceof Error ? error.message : "Errore registrazione hotkey."
    });
  }

  try {
    const paletteRegistered = globalShortcut.register(
      settings.commandPaletteHotkey || DEFAULT_SETTINGS.commandPaletteHotkey,
      () => {
        toggleOverlayWindow();
      }
    );
    if (!paletteRegistered) {
      showNativeNotification({
        title: APP_NAME,
        body: `Hotkey palette non disponibile (${settings.commandPaletteHotkey}).`
      });
    }
  } catch (error) {
    showNativeNotification({
      title: APP_NAME,
      body: `Errore hotkey palette: ${
        error instanceof Error ? error.message : "sconosciuto"
      }`
    });
  }
}

function shouldOpenInTray() {
  const startupTrayArg = process.argv.includes("--startup-tray");
  const settings = settingsStore.get();
  return startupTrayArg && settings.startMinimizedToTray;
}

function showMainWindow() {
  if (!mainWindow) {
    return;
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function hideToTray() {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.hide();
  }
}

function toggleOverlayWindow() {
  if (!overlayWindow) {
    return;
  }
  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
    return;
  }
  overlayWindow.show();
  overlayWindow.focus();
}

function hideOverlayWindow() {
  if (overlayWindow && overlayWindow.isVisible()) {
    overlayWindow.hide();
  }
}

async function spawnApiForProduction() {
  if (isDev) {
    return;
  }

  const apiEntry = path.join(process.resourcesPath, "api", "index.js");
  const staticDir = path.join(process.resourcesPath, "web", "public");

  process.env.PORT = String(API_PORT);
  process.env.SERVE_STATIC = "true";
  process.env.STATIC_DIR = staticDir;
  await import(pathToFileURL(apiEntry).href);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    show: false,
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.on("ready-to-show", () => {
    if (shouldOpenInTray()) {
      hideToTray();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on("close", (event) => {
    if (quitting) {
      return;
    }
    event.preventDefault();
    hideToTray();
  });

  const targetUrl = getMainWindowUrl();
  const tryLoad = (attempt = 0) => {
    mainWindow.loadURL(targetUrl).catch(() => {
      if (attempt >= 25) {
        return;
      }
      setTimeout(() => tryLoad(attempt + 1), 300);
    });
  };

  tryLoad();
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 720,
    height: 170,
    frame: false,
    show: false,
    transparent: false,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: `${APP_NAME} Quick Command`,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  overlayWindow.on("blur", () => {
    if (!quitting) {
      overlayWindow.hide();
    }
  });

  const targetUrl = getOverlayWindowUrl();
  const tryLoad = (attempt = 0) => {
    overlayWindow.loadURL(targetUrl).catch(() => {
      if (attempt >= 25) {
        return;
      }
      setTimeout(() => tryLoad(attempt + 1), 300);
    });
  };

  tryLoad();
}

function buildTray() {
  if (tray) {
    return;
  }
  const icon = getNotificationIcon();
  tray = new Tray(icon || nativeImage.createEmpty());
  tray.setToolTip(APP_NAME);

  tray.on("double-click", () => {
    showMainWindow();
  });

  const menu = Menu.buildFromTemplate([
    {
      label: "Apri Luffy",
      click: () => showMainWindow()
    },
    {
      label: "Comando rapido",
      click: () => toggleOverlayWindow()
    },
    {
      label: "Esci",
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
}

async function executeScheduledAction(reminder) {
  if (!reminder.action || reminder.action.type === "none") {
    return;
  }
  if (reminder.action.type === "open_app") {
    const result = launcherService.openById(reminder.action.target);
    console.log("[scheduler] open_app", reminder.id, result);
    if (!result.ok) {
      showNativeNotification({
        title: APP_NAME,
        body: `Azione programmata fallita (${result.reason}).`
      });
    }
    return;
  }

  if (reminder.action.type === "command" && reminder.action.target) {
    try {
      await fetch(`http://127.0.0.1:${API_PORT}/api/assistant/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: reminder.action.target,
          source: "text"
        })
      });
      console.log("[scheduler] command", reminder.id, reminder.action.target);
    } catch {
      console.error("[scheduler] command failed", reminder.id);
      showNativeNotification({
        title: APP_NAME,
        body: "Azione schedulata non eseguita: API non raggiungibile."
      });
    }
  }
}

function handleReminderTriggered(reminder) {
  console.log("[scheduler] triggered", reminder.id, reminder.title, reminder.at);
  showNativeNotification({
    title: reminder.title || "Promemoria Luffy",
    body: reminder.message || `Reminder delle ${new Date(reminder.at).toLocaleTimeString("it-IT")}`
  });
  sendToRenderers("scheduler:triggered", reminder);
  void executeScheduledAction(reminder);
}

function bindIpc() {
  ipcMain.handle("voice:start", async () => {
    await voiceService.start();
  });

  ipcMain.handle("voice:stop", async () => {
    voiceService.stop();
  });

  ipcMain.on("voice:chunk", (_event, payload) => {
    if (!payload) {
      return;
    }
    voiceService.processChunk(Buffer.from(payload));
  });

  ipcMain.handle("settings:sync", async (_event, payload) => {
    const next = settingsStore.patch(payload || {});
    applyLoginSettings(next);
    registerGlobalHotkeys(next);
    return { ok: true, settings: next };
  });

  ipcMain.handle("launcher:open", async (_event, payload) => {
    if (!payload || typeof payload.appId !== "string") {
      return { ok: false, reason: "invalid_payload" };
    }

    const result = launcherService.openById(payload.appId);
    if (result.ok) {
      showNativeNotification({
        title: APP_NAME,
        body: "Apertura app avviata."
      });
    } else {
      showNativeNotification({
        title: APP_NAME,
        body: `Apertura app non riuscita (${result.reason}).`
      });
    }
    return result;
  });

  ipcMain.handle("notify:show", async (_event, payload) => {
    showNativeNotification(payload || {});
    return { ok: true };
  });

  ipcMain.handle("overlay:show", async () => {
    toggleOverlayWindow();
    return { ok: true };
  });

  ipcMain.handle("overlay:hide", async () => {
    hideOverlayWindow();
    return { ok: true };
  });

  ipcMain.handle("scheduler:list", async () => {
    return schedulerService.list();
  });

  ipcMain.handle("scheduler:upsert", async (_event, payload) => {
    const next = schedulerService.upsert(payload);
    schedulerService.rescheduleAll(handleReminderTriggered);
    return next;
  });

  ipcMain.handle("scheduler:remove", async (_event, id) => {
    const next = schedulerService.remove(String(id));
    schedulerService.rescheduleAll(handleReminderTriggered);
    return next;
  });

  ipcMain.handle("scheduler:run-now", async (_event, id) => {
    const ok = schedulerService.triggerNow(String(id), handleReminderTriggered);
    return { ok };
  });

  voiceService.on("result", (payload) => {
    sendToRenderers("voice:result", payload);
  });

  voiceService.on("error", (payload) => {
    sendToRenderers("voice:error", payload);
    showNativeNotification({
      title: APP_NAME,
      body: payload && payload.message ? String(payload.message) : "Errore voce."
    });
  });
}

function initializeDesktopSettings() {
  const settings = settingsStore.get();
  applyLoginSettings(settings);
  registerGlobalHotkeys(settings);
}

const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  app.on("ready", () => {
    void (async () => {
      await spawnApiForProduction();
      initializeDesktopSettings();
      bindIpc();
      buildTray();
      createMainWindow();
      createOverlayWindow();
      schedulerService.rescheduleAll(handleReminderTriggered);
    })();
  });

  app.on("activate", () => {
    showMainWindow();
  });

  app.on("before-quit", () => {
    quitting = true;
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    voiceService.dispose();
    schedulerService.dispose();
  });
}
