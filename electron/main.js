/* Liseuse accessible — application de bureau (Electron)
   Charge la même webapp que la version en ligne, via un protocole interne app:// */
"use strict";
const { app, BrowserWindow, Menu, protocol, net, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const WEBAPP = path.join(__dirname, "..", "webapp");
const ORIGIN = "app://liseuse";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

let win = null;
let rendererReady = false;
const pendingFiles = [];

/* Fichiers .epub passés en argument (double-clic, « Ouvrir avec ») */
function epubFromArgs(argv) {
  return argv.slice(app.isPackaged ? 1 : 2).filter(a => /\.epub$/i.test(a) && fs.existsSync(a));
}
function sendFile(filePath) {
  if (!win || !rendererReady) { pendingFiles.push(filePath); return; }
  fs.readFile(filePath, (err, buf) => {
    if (err) return;
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    win.webContents.send("open-file", { name: path.basename(filePath, path.extname(filePath)), data });
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

/* Une seule fenêtre : un second lancement transmet son fichier à la première */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    epubFromArgs(argv).forEach(sendFile);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}
// macOS : ouverture par le Finder
app.on("open-file", (e, filePath) => { e.preventDefault(); sendFile(filePath); });

function menu() {
  const send = (cmd) => () => win && win.webContents.send("menu", cmd);
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: "about", label: "À propos de Liseuse accessible" }, { type: "separator" }, { role: "hide", label: "Masquer" }, { role: "hideOthers", label: "Masquer les autres" }, { type: "separator" }, { role: "quit", label: "Quitter" }] }] : []),
    { label: "Fichier", submenu: [
      { label: "Ouvrir un livre…", accelerator: "CmdOrCtrl+O", click: send("open") },
      { label: "Bibliothèque", accelerator: "CmdOrCtrl+B", click: send("home") },
      { type: "separator" },
      isMac ? { role: "close", label: "Fermer la fenêtre" } : { role: "quit", label: "Quitter" }
    ] },
    { label: "Édition", submenu: [
      { role: "copy", label: "Copier" }, { role: "selectAll", label: "Tout sélectionner" }
    ] },
    { label: "Affichage", submenu: [
      { label: "Accessibilité et affichage…", accelerator: "CmdOrCtrl+Shift+A", click: send("a11y") },
      { type: "separator" },
      { role: "resetZoom", label: "Taille réelle" },
      { role: "zoomIn", label: "Zoom avant" },
      { role: "zoomOut", label: "Zoom arrière" },
      { type: "separator" },
      { role: "togglefullscreen", label: "Plein écran" },
      ...(app.isPackaged ? [] : [{ role: "toggleDevTools", label: "Outils de développement" }])
    ] },
    { label: "Aide", submenu: [
      { label: "Aide et raccourcis clavier", accelerator: "F1", click: send("help") },
      { label: "Site du projet", click: () => shell.openExternal("https://github.com/biblioGironde/ePub-Reader-Accessible") }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 860, minWidth: 360, minHeight: 480,
    title: "Liseuse accessible",
    backgroundColor: "#ffffff",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  // Liens externes : navigateur du système ; aucune autre navigation autorisée
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  win.on("closed", () => { win = null; rendererReady = false; });
  win.loadURL(ORIGIN + "/index.html");
}

ipcMain.on("renderer-ready", () => {
  rendererReady = true;
  pendingFiles.splice(0).forEach(sendFile);
});

app.whenReady().then(() => {
  // Sert le dossier webapp/ sous app://liseuse/ (sans sortir du dossier)
  protocol.handle("app", (req) => {
    const { pathname } = new URL(req.url);
    let rel = decodeURIComponent(pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.normalize(path.join(WEBAPP, rel));
    if (!file.startsWith(WEBAPP)) return new Response("Interdit", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  epubFromArgs(process.argv).forEach(f => pendingFiles.push(f));
  menu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
