import { contextBridge, ipcRenderer, shell } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getNetworkIps: () => ipcRenderer.invoke('get-network-ips'),
  getDiscoveredServers: () => ipcRenderer.invoke('get-discovered-servers'),
  platform: process.platform,
  openExternal: (url: string) => shell.openExternal(url),
});

declare global {
  interface Window {
    electronAPI: {
      getNetworkIps: () => Promise<{ name: string; address: string }[]>;
      getDiscoveredServers: () => Promise<{ address: string; apiPort: number; wsPort: number; lastSeen: number }[]>;
      platform: string;
      openExternal: (url: string) => void;
    };
  }
}
