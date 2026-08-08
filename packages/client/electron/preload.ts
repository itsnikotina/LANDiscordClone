import { contextBridge, ipcRenderer, shell } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getNetworkIps: () => ipcRenderer.invoke('get-network-ips'),
  platform: process.platform,
  openExternal: (url: string) => shell.openExternal(url),
});

declare global {
  interface Window {
    electronAPI: {
      getNetworkIps: () => Promise<{ name: string; address: string }[]>;
      platform: string;
      openExternal: (url: string) => void;
    };
  }
}
