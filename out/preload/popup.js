"use strict";
const electron = require("electron");
const path = require("path");
electron.contextBridge.exposeInMainWorld("popupAPI", {
  getData: () => electron.ipcRenderer.invoke("popup:get-data"),
  dismiss: () => electron.ipcRenderer.send("popup:dismiss"),
  finished: () => electron.ipcRenderer.send("popup:finished"),
  resize: (height) => electron.ipcRenderer.send("popup:resize", height),
  showCaption: () => electron.ipcRenderer.invoke("caption:show"),
  sendCaptionText: (text) => electron.ipcRenderer.send("caption:text", text),
  clearCaption: () => electron.ipcRenderer.send("caption:clear"),
  closeCaption: () => electron.ipcRenderer.send("caption:close"),
  getAlertSoundUrl: () => {
    const fullPath = path.join(process.resourcesPath, "resources", "alert.mp3");
    const normalized = fullPath.replace(/\\/g, "/");
    return `file://${normalized}`;
  }
});
