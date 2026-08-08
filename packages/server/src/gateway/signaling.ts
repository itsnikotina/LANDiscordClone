import WebSocket from 'ws';

export interface SignalPayload {
  targetUserId: number;
  type: 'offer' | 'answer' | 'ice-candidate' | 'stream-start' | 'stream-stop';
  data: unknown;
}

// Maps channelId to a Set of userIds currently in the voice room
const voiceRooms = new Map<string, Set<number>>();

export function joinVoiceRoom(channelId: string, userId: number): void {
  let room = voiceRooms.get(channelId);
  if (!room) {
    room = new Set<number>();
    voiceRooms.set(channelId, room);
  }
  room.add(userId);
}

export function leaveVoiceRoom(channelId: string, userId: number): void {
  const room = voiceRooms.get(channelId);
  if (room) {
    room.delete(userId);
    if (room.size === 0) {
      voiceRooms.delete(channelId);
    }
  }
}

export function getVoiceRoomPeers(channelId: string): number[] {
  const room = voiceRooms.get(channelId);
  return room ? Array.from(room) : [];
}

/**
 * Relays a WebRTC signaling payload to the intended target user.
 */
export function relaySignal(
  fromUserId: number, 
  payload: SignalPayload, 
  clients: Map<string, { ws: WebSocket; userId: number }>
): void {
  const { targetUserId, type, data } = payload;
  
  // Find target client's WebSocket connection
  for (const [wsId, client] of clients.entries()) {
    if (client.userId === targetUserId && client.ws.readyState === WebSocket.OPEN) {
      const relayMessage = JSON.stringify({
        op: 15, // VOICE_PEER_SIGNAL
        d: {
          fromUserId,
          type,
          data
        }
      });
      client.ws.send(relayMessage);
      return; // Assuming one connection per user for simplicity
    }
  }
}
