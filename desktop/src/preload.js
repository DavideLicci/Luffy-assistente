const { contextBridge, ipcRenderer } = require("electron");

function createListener(channel) {
  return (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  };
}

contextBridge.exposeInMainWorld("desktop", {
  voice: {
    start: () => ipcRenderer.invoke("voice:start"),
    stop: () => ipcRenderer.invoke("voice:stop"),
    pushChunk: (payload) => ipcRenderer.send("voice:chunk", payload),
    onResult: createListener("voice:result"),
    onError: createListener("voice:error")
  },
  settings: {
    sync: (settings) => ipcRenderer.invoke("settings:sync", settings)
  },
  launcher: {
    open: (payload) => ipcRenderer.invoke("launcher:open", payload)
  },
  notify: {
    show: (payload) => ipcRenderer.invoke("notify:show", payload)
  },
  overlay: {
    show: () => ipcRenderer.invoke("overlay:show"),
    hide: () => ipcRenderer.invoke("overlay:hide")
  },
  scheduler: {
    list: () => ipcRenderer.invoke("scheduler:list"),
    upsert: (payload) => ipcRenderer.invoke("scheduler:upsert", payload),
    remove: (id) => ipcRenderer.invoke("scheduler:remove", id),
    runNow: (id) => ipcRenderer.invoke("scheduler:run-now", id),
    onTriggered: createListener("scheduler:triggered")
  },
  hotkey: {
    onPushToTalk: createListener("hotkey:push-to-talk")
  }
});
