import WebSocket from 'ws';

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible';

export interface UserPresence {
  userId: number;
  username: string;
  status: PresenceStatus;
  activity?: string;
  radminIp?: string;
  wsId: string;
}

// In-memory store mapping WebSocket ID to UserPresence
const presences = new Map<string, UserPresence>();

export function setPresence(wsId: string, presence: UserPresence): void {
  presences.set(wsId, presence);
}

export function removePresence(wsId: string): void {
  presences.delete(wsId);
}

export function getPresence(wsId: string): UserPresence | undefined {
  return presences.get(wsId);
}

export function getAllPresences(): UserPresence[] {
  return Array.from(presences.values());
}

export function getOnlineUserIds(): number[] {
  return Array.from(presences.values()).map(p => p.userId);
}

export function broadcastPresenceUpdate(excludeWsId: string, presence: UserPresence, clients: Map<string, any>): void {
  const payload = JSON.stringify({
    op: 16, // PRESENCE_UPDATE
    d: presence
  });

  clients.forEach((client, wsId) => {
    if (wsId !== excludeWsId && client.ws.readyState === WebSocket.OPEN) {
      // In a full implementation, you'd check if they share a guild.
      // For P2P discord, broadcasting globally to all connected clients is ok for MVP.
      client.ws.send(payload);
    }
  });
}
