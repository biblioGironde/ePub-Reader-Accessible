/* Pont minimal et sûr entre Electron et la webapp */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("liseuse", {
  platform: process.platform,
  onOpenFile(cb) { ipcRenderer.on("open-file", (_e, msg) => cb(msg.data, msg.name)); },
  onMenu(cb) { ipcRenderer.on("menu", (_e, cmd) => cb(cmd)); },
  ready() { ipcRenderer.send("renderer-ready"); }
});
