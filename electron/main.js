const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');

const appRoot = path.join(__dirname, '..');
const PREFERRED_PORT = parseInt(process.env.WORDLE_PORT || '34787', 10);

let mainWindow = null;
let serverPort = PREFERRED_PORT;

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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
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
    try {
      serverPort = await pickPort(PREFERRED_PORT);
      process.env.NODE_ENV = 'production';
      process.env.PORT = String(serverPort);
      // The Next.js server resolves its project dir from cwd.
      process.chdir(appRoot);
      require(path.join(appRoot, 'dist', 'server.js'));
      await waitForServer(serverPort);
      createWindow();
    } catch (err) {
      dialog.showErrorBox('Wordle Party failed to start', String(err?.stack || err));
      app.quit();
    }
  });

  app.on('activate', () => {
    if (mainWindow === null && app.isReady()) {
      createWindow();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
