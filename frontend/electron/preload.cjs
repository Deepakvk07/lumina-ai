const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  setStealth: (enable) => ipcRenderer.invoke('set-stealth', enable),
  setClickThrough: (enable) => ipcRenderer.invoke('set-clickthrough', enable),
  setAlwaysOnTop: (enable) => ipcRenderer.invoke('set-always-on-top', enable),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  hide: () => ipcRenderer.invoke('window-hide'),
  show: () => ipcRenderer.invoke('window-show'),
  close: () => ipcRenderer.invoke('window-close'),
  setOpacity: (opacity) => ipcRenderer.invoke('set-opacity', opacity),
  onHotkeyTriggered: (callback) => {
    const listener = (event, action) => callback(action);
    ipcRenderer.on('hotkey-event', listener);
    return () => ipcRenderer.removeListener('hotkey-event', listener);
  },
  getHwnd: () => ipcRenderer.invoke('get-hwnd')
});
