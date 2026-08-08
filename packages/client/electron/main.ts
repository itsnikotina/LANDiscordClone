import { app, BrowserWindow, ipcMain, Menu, shell, session, desktopCapturer } from 'electron';
import * as os from 'os';
import * as path from 'path';
import * as dgram from 'dgram';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

const DISCOVERY_PORT = 41234;
const DISCOVERY_STALE_MS = 8000;

interface DiscoveredServer { address: string; apiPort: number; wsPort: number; lastSeen: number; }
const discoveredServers = new Map<string, DiscoveredServer>();

/** Listens for the server's UDP presence beacon (see packages/server/src/discovery.ts) to auto-detect it on the LAN/VPN. */
function startDiscoveryListener(): void {
  try {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data?.app !== 'discord-p2p') return;
        discoveredServers.set(rinfo.address, {
          address: rinfo.address,
          apiPort: data.apiPort,
          wsPort: data.wsPort,
          lastSeen: Date.now(),
        });
      } catch {
        // ignore malformed packets
      }
    });

    socket.on('error', (err) => {
      console.warn('[Discovery] UDP listener error (non-fatal):', err.message);
    });

    socket.bind(DISCOVERY_PORT);
  } catch (err: any) {
    console.warn('[Discovery] Failed to start UDP listener (non-fatal):', err.message);
  }
}

function getDiscoveredServers(): DiscoveredServer[] {
  const now = Date.now();
  return Array.from(discoveredServers.values()).filter(s => now - s.lastSeen < DISCOVERY_STALE_MS);
}

/** Every non-internal IPv4 address this machine has, from any adapter (VPN or physical LAN). */
function getNetworkIps(): { name: string; address: string }[] {
  const interfaces = os.networkInterfaces();
  const result: { name: string; address: string }[] = [];

  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        result.push({ name, address: alias.address });
      }
    }
  }
  return result;
}


let mainWindow: BrowserWindow | null = null;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 940,
      minHeight: 500,
      backgroundColor: '#1e1f22',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    if (isDev) {
      mainWindow.loadURL('http://localhost:5173');
    } else {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });
  }

  app.whenReady().then(() => {
    ipcMain.handle('get-network-ips', () => getNetworkIps());
    ipcMain.handle('get-discovered-servers', () => getDiscoveredServers());
    startDiscoveryListener();

    // Electron doesn't show Chrome's screen-picker UI by default - getDisplayMedia() hangs/rejects without this.
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        callback({ video: sources[0], audio: 'loopback' });
      });
    });

    const menu = Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [{ role: 'quit' }]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About',
            click: () => {}
          }
        ]
      }
    ]);
    Menu.setApplicationMenu(menu);

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
