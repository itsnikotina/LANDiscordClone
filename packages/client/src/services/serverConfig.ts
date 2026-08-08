/** Runtime server address config, persisted in localStorage - no .env editing or rebuild required. */
const STORAGE_KEY = 'discord_p2p_server';

export interface ServerConfig {
  apiUrl: string;
  wsUrl: string;
}

export function getStoredServerConfig(): ServerConfig | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.apiUrl && parsed?.wsUrl) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Prefers the saved runtime config; falls back to build-time env vars (useful for the host's own dev setup). */
export function getEffectiveServerConfig(): ServerConfig | null {
  const stored = getStoredServerConfig();
  if (stored) return stored;

  const envApiUrl = import.meta.env?.VITE_API_URL;
  const envWsUrl = import.meta.env?.VITE_WS_URL;
  if (envApiUrl && envWsUrl) return { apiUrl: envApiUrl, wsUrl: envWsUrl };

  return null;
}

/** Accepts a bare host, "host:port", or a full http(s)/ws(s) URL and normalizes it into api+ws URLs. */
export function buildServerConfig(input: string, apiPort = 3001, wsPort = 3002): ServerConfig {
  const trimmed = input.trim().replace(/^(https?|wss?):\/\//, '').replace(/\/$/, '');
  const [host, port] = trimmed.split(':');
  const resolvedApiPort = port ? Number(port) : apiPort;
  const resolvedWsPort = port ? Number(port) + 1 : wsPort;

  return {
    apiUrl: `http://${host}:${resolvedApiPort}`,
    wsUrl: `ws://${host}:${resolvedWsPort}`,
  };
}

export function saveServerConfig(config: ServerConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearServerConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}
