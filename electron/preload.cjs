// The only bridge between the page and the computer: a few named actions, nothing else.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('oceanDesktop', {
  info: () => ipcRenderer.invoke('ocean:info'),
  chooseFolder: () => ipcRenderer.invoke('ocean:choose-folder'),
  markWelcomed: () => ipcRenderer.invoke('ocean:welcomed'),
  revealFolder: () => ipcRenderer.invoke('ocean:reveal'),
});
