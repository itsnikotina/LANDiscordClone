import { contextBridge, ipcRenderer, shell } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getNetworkIps: () => ipcRenderer.invoke('get-network-ips'),
  getDiscoveredServers: () => ipcRenderer.invoke('get-discovered-servers'),
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  selectScreenSource: (sourceId: string) => ipcRenderer.invoke('select-screen-source', sourceId),
  platform: process.platform,
  openExternal: (url: string) => shell.openExternal(url),
});

declare global {
  interface Window {
    electronAPI: {
      getNetworkIps: () => Promise<{ name: string; address: string }[]>;
      getDiscoveredServers: () => Promise<{ address: string; apiPort: number; wsPort: number; lastSeen: number }[]>;
      getScreenSources: () => Promise<{ id: string; name: string; type: 'screen' | 'window'; thumbnail: string }[]>;
      selectScreenSource: (sourceId: string) => Promise<void>;
      platform: string;
      openExternal: (url: string) => void;
    };
  }
}
