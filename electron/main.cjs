// Ocean desktop app: runs the Ocean server inside the app and shows it in a native window.
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

app.setName('Ocean');
const configFile = () => path.join(app.getPath('userData'), 'config.json');
const readConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    return {};
  }
};
const writeConfig = (c) => {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(c, null, 2));
};

let win;
let baseUrl;

async function chooseFolder() {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose your Ocean notes folder',
    message: 'Pick a folder for your notes. An empty folder gets a welcome page; an existing Ocean or Obsidian folder opens as it is.',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: readConfig().vault || path.join(os.homedir(), 'Documents'),
  });
  if (r.canceled || !r.filePaths[0]) return null;
  writeConfig({ ...readConfig(), vault: r.filePaths[0] });
  // The server reads the folder once at start, so restart into the new folder.
  app.relaunch();
  app.exit(0);
  return r.filePaths[0];
}

function buildMenu() {
  const template = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'Choose Notes Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: chooseFolder },
        { label: 'Show Notes Folder in Finder', click: () => shell.openPath(process.env.VAULT) },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'Welcome to Ocean', click: () => win?.webContents.executeJavaScript('window.dispatchEvent(new Event("ocean:welcome"))') }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function start() {
  const config = readConfig();
  const vault = config.vault || path.join(os.homedir(), 'Documents', 'Ocean');
  process.env.VAULT = vault;
  if (!config.vault) writeConfig({ ...config, vault, firstRun: true });

  const { startServer } = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'standalone.js')).href);
  const { port } = await startServer({ port: 0, distDir: path.join(__dirname, '..', 'dist') });
  baseUrl = `http://127.0.0.1:${port}`;

  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: 'Ocean',
    backgroundColor: '#191919',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // Links to the web open in your browser; the window only ever shows Ocean itself.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(baseUrl)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  await win.loadURL(baseUrl);
}

ipcMain.handle('ocean:info', () => ({ vault: process.env.VAULT, firstRun: !!readConfig().firstRun, version: app.getVersion() }));
ipcMain.handle('ocean:choose-folder', () => chooseFolder());
ipcMain.handle('ocean:welcomed', () => {
  const c = readConfig();
  delete c.firstRun;
  writeConfig(c);
});
ipcMain.handle('ocean:reveal', () => shell.openPath(process.env.VAULT));

app.whenReady().then(() => {
  buildMenu();
  start().catch((err) => {
    dialog.showErrorBox('Ocean could not start', String(err?.stack || err));
    app.quit();
  });
});
app.on('window-all-closed', () => app.quit());
