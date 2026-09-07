const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const net = require('net');

const appRoot = path.join(__dirname, '..');
const CLOUD_URL = process.env.WORDLE_CLOUD_URL || 'https://wordle.armand0e.com';
const PREFERRED_PORT = parseInt(process.env.WORDLE_PORT || '34787', 10);

let mainWindow = null;
let serverPort = null;
let localServerStarted = false;
let currentMode = null; // 'online' | 'offline'

// The bundled server binds the preferred port when free, otherwise any free one.
function pickPort(preferred) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => {
      const fallback = net.createServer();
      fallback.listen(0, () => {
        const port = fallback.address().port;
        fallback.close(() => resolve(port));
      });
    });
    probe.listen(preferred, () => {
      probe.close(() => resolve(preferred));
    });
  });
}

function waitForServer(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error('Game server did not start in time'));
        } else {
          setTimeout(attempt, 250);
        }
      });
    };
    attempt();
  });
}

function cloudReachable(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = https.get(CLOUD_URL, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function ensureLocalServer() {
  if (localServerStarted) return serverPort;

  serverPort = await pickPort(PREFERRED_PORT);
  process.env.NODE_ENV = 'production';
  process.env.PORT = String(serverPort);
  // The Next.js server resolves its project dir from cwd.
  process.chdir(appRoot);
  require(path.join(appRoot, 'dist', 'server.js'));
  await waitForServer(serverPort);
  localServerStarted = true;
  return serverPort;
}

async function loadOnline() {
  if (!mainWindow) return;
  currentMode = 'online';
  await mainWindow.loadURL(CLOUD_URL).catch(() => {});
}

async function loadOffline() {
  if (!mainWindow) return;
  currentMode = 'offline';
  try {
    const port = await ensureLocalServer();
    await mainWindow.loadURL(`http://127.0.0.1:${port}`).catch(() => {});
  } catch (err) {
    dialog.showErrorBox('Wordle Party failed to start', String(err?.stack || err));
    app.quit();
  }
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'Game',
      submenu: [
        {
          label: 'Play Online (cloud rooms)',
          click: () => loadOnline(),
        },
        {
          label: 'Play Offline (local only)',
          click: () => loadOffline(),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#121213',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // If the cloud page fails to load (offline, tunnel down), fall back to the
  // bundled local server.
  mainWindow.webContents.on('did-fail-load', (_event, _code, _desc, validatedURL, isMainFrame) => {
    if (isMainFrame && currentMode === 'online' && validatedURL.startsWith(CLOUD_URL)) {
      loadOffline();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    buildMenu();
    createWindow();
    if (await cloudReachable()) {
      await loadOnline();
    } else {
      await loadOffline();
    }
  });

  app.on('activate', () => {
    if (mainWindow === null && app.isReady()) {
      createWindow();
      if (currentMode === 'offline') {
        loadOffline();
      } else {
        loadOnline();
      }
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
