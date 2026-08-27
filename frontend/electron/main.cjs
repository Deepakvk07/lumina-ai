const { app, BrowserWindow, globalShortcut, ipcMain, screen, desktopCapturer } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let isStealthActive = true;
let isClickThroughActive = false;

function applyBackendStealth(hwnd, enable = true) {
  try {
    const postData = JSON.stringify({ hwnd: hwnd, enable: enable });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8765,
      path: '/api/stealth',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {});
    req.on('error', () => {});
    req.write(postData);
    req.end();
  } catch (err) {
    console.error('Error contacting stealth backend:', err);
  }
}

function getHwndFromBuffer(hwndBuffer) {
  try {
    if (process.arch === 'x64' || process.arch === 'arm64') {
      return Number(hwndBuffer.readBigInt64LE(0));
    }
    return hwndBuffer.readInt32LE(0);
  } catch (e) {
    try {
      return hwndBuffer.readInt32LE(0);
    } catch {
      return 0;
    }
  }
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 700,
    height: 560,
    minWidth: 380,
    minHeight: 220,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    title: 'AudioSrvHost',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  // Enable Electron hardware content protection (Sets WDA_MONITOR / WDA_EXCLUDEFROMCAPTURE)
  mainWindow.setContentProtection(true);

  // Apply Win32 WDA_EXCLUDEFROMCAPTURE directly via backend
  const hwnd = getHwndFromBuffer(mainWindow.getNativeWindowHandle());
  if (hwnd) {
    applyBackendStealth(hwnd, true);
  }

  // Load dev server or production dist
  const distPath = path.join(__dirname, '../dist/index.html');
  const devUrl = 'http://localhost:5173';

  mainWindow.loadURL(devUrl).catch(() => {
    if (fs.existsSync(distPath)) {
      mainWindow.loadFile(distPath);
    } else {
      setTimeout(() => mainWindow.loadURL(devUrl), 2000);
    }
  });

  // Register Global Hotkeys (unregister first to prevent errors on re-creation)
  globalShortcut.unregisterAll();

  // 1. Panic Hide/Show (Ctrl+Shift+H)
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
      mainWindow.webContents.send('hotkey-event', 'panic_hide');
    }
  });

  // 2. Snip Screen (Ctrl+Shift+S)
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow) {
      mainWindow.webContents.send('hotkey-event', 'snip_screen');
    }
  });

  // 3. Toggle Click-Through (Ctrl+Shift+T)
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    toggleClickThrough();
  });
}

function toggleClickThrough() {
  if (!mainWindow) return;
  isClickThroughActive = !isClickThroughActive;
  mainWindow.setIgnoreMouseEvents(isClickThroughActive, { forward: true });
  mainWindow.webContents.send('hotkey-event', isClickThroughActive ? 'clickthrough_on' : 'clickthrough_off');
}

app.setName('AudioSrvHost');

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('capture-screen', async () => {
  try {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
      await new Promise((r) => setTimeout(r, 30));
    }
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.min(1920, Math.round(width)),
        height: Math.min(1080, Math.round(height))
      }
    });
    if (mainWindow) {
      mainWindow.show();
    }
    if (sources && sources.length > 0) {
      const dataUrl = sources[0].thumbnail.toDataURL();
      return dataUrl;
    }
  } catch (err) {
    if (mainWindow) mainWindow.show();
    console.error('[Electron desktopCapturer] Error capturing screen:', err);
  }
  return null;
});

ipcMain.handle('set-stealth', (event, enable) => {
  if (mainWindow) {
    mainWindow.setContentProtection(enable);
    const hwnd = getHwndFromBuffer(mainWindow.getNativeWindowHandle());
    if (hwnd) applyBackendStealth(hwnd, enable);
    isStealthActive = enable;
  }
  return isStealthActive;
});

ipcMain.handle('set-clickthrough', (event, enable) => {
  if (mainWindow) {
    isClickThroughActive = enable;
    mainWindow.setIgnoreMouseEvents(enable, { forward: true });
  }
  return isClickThroughActive;
});

ipcMain.handle('set-always-on-top', (event, enable) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(enable, 'screen-saver');
  }
  return enable;
});

ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-hide', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.handle('window-show', () => {
  if (mainWindow) mainWindow.show();
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('set-opacity', (event, opacity) => {
  if (mainWindow) {
    mainWindow.setOpacity(Math.max(0.1, Math.min(1.0, opacity)));
  }
});

ipcMain.handle('get-hwnd', () => {
  if (mainWindow) {
    return getHwndFromBuffer(mainWindow.getNativeWindowHandle());
  }
  return 0;
});
