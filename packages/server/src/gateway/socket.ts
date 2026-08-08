/**
 * WebSocket Gateway — Discord P2P Clone
 * Handles real-time signaling, voice, presence, and auth for all connected clients.
 * Network-agnostic: works over Radmin VPN, Tailscale, ZeroTier, or a plain LAN - access
 * is controlled by the server password (registration) and JWT (everything else), not IP.
 */
import WebSocket, { Server as WSServer } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { verifyToken } from '../auth/jwt';
import { queryOne, queryAll, runWrite } from '../database/db';
import { toCamelCase } from '../utils/caseTransform';
import * as presenceMgr from './presence';
import * as signaling from './signaling';

// ── Opcodes Client→Server ──────────────────────────────────────
const OP_IDENTIFY        = 0;
const OP_HEARTBEAT       = 1;
const OP_JOIN_VOICE      = 2;
const OP_LEAVE_VOICE     = 3;
const OP_VOICE_SIGNAL    = 4;
const OP_UPDATE_PRESENCE = 5;
const OP_START_STREAM    = 6;
const OP_STOP_STREAM     = 7;

// ── Opcodes Server→Client ──────────────────────────────────────
const OP_HELLO             = 10;
const OP_READY             = 11;
// const OP_GUILD_CREATE   = 12;  // sent from REST handlers
const OP_MESSAGE_CREATE    = 13; // sent from REST handlers
const OP_VOICE_STATE_UPDATE = 14;
const OP_VOICE_PEER_SIGNAL = 15;
const OP_PRESENCE_UPDATE   = 16;
// const OP_STREAM_START   = 17;  // relayed via signaling
const OP_HEARTBEAT_ACK     = 18;
const OP_VOICE_JOINED      = 19;
const OP_VOICE_LEFT        = 20;
const OP_MESSAGE_UPDATE    = 21; // sent from REST handlers
const OP_MESSAGE_DELETE    = 22; // sent from REST handlers
const OP_GUILD_MEMBER_ADD  = 23; // sent from REST handlers (invite join)
const OP_ERROR             = 99;

/** Heartbeat interval in ms — client must respond within 3 missed cycles. */
const HEARTBEAT_INTERVAL_MS = 45_000;

export interface ClientConnection {
  ws: WebSocket;
  userId: number;
  username: string;
  radminIp: string;
  isAlive: boolean;
  missedHeartbeats: number;
}

/** Registry of all authenticated WebSocket clients, keyed by wsId (UUID). */
const clients = new Map<string, ClientConnection>();

/** Returns the full client registry (used by REST handlers to broadcast). */
export function getConnectedClients(): Map<string, ClientConnection> {
  return clients;
}

/**
 * Broadcasts a JSON payload to all clients who are members of a given guild.
 */
export function broadcastToGuildMembers(guildId: string, payload: object): void {
  const members = queryAll<{ user_id: number }>(
    'SELECT user_id FROM guild_members WHERE guild_id = ?',
    [guildId]
  );
  const memberIds = new Set(members.map((m) => m.user_id));
  const message = JSON.stringify(toCamelCase(payload));

  for (const client of clients.values()) {
    if (memberIds.has(client.userId) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

/**
 * Initializes the WebSocket server on the given port.
 */
export function initWebSocketServer(port: number): void {
  const wss = new WSServer({ port });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const rawIp = req.socket.remoteAddress ?? '';
    // Normalize IPv6-mapped IPv4 (::ffff:10.x.x.x → 10.x.x.x) - kept for display/logging only.
    const ip = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;

    const wsId = uuidv4();
    let authenticated = false;

    // Immediately send HELLO to request IDENTIFY from client
    ws.send(JSON.stringify({ op: OP_HELLO, d: { heartbeatInterval: HEARTBEAT_INTERVAL_MS } }));

    ws.on('message', (rawMsg) => {
      try {
        const payload = JSON.parse(rawMsg.toString()) as { op: number; d: any };
        const { op, d } = payload;

        // ── IDENTIFY ──────────────────────────────────────────────
        if (op === OP_IDENTIFY) {
          const decoded = verifyToken(d?.token);
          if (!decoded) {
            ws.send(JSON.stringify({ op: OP_ERROR, d: { message: 'Token inválido' } }));
            ws.close(4001, 'Authentication failed');
            return;
          }

          const fullUser = queryOne<{
            id: number; username: string; avatar_color: string;
            status: string; radmin_ip: string | null;
          }>('SELECT id, username, avatar_color, status, radmin_ip FROM users WHERE id = ?', [decoded.userId]);

          if (!fullUser) {
            ws.close(4001, 'User not found');
            return;
          }

          authenticated = true;
          const clientRadminIp = fullUser.radmin_ip ?? ip;

          clients.set(wsId, {
            ws,
            userId: decoded.userId,
            username: decoded.username,
            radminIp: clientRadminIp,
            isAlive: true,
            missedHeartbeats: 0,
          });

          presenceMgr.setPresence(wsId, {
            userId: decoded.userId,
            username: decoded.username,
            status: 'online',
            radminIp: clientRadminIp,
            wsId,
          });

          // Fetch guilds with full structure for READY payload
          const guilds = queryAll<{ id: string; name: string; icon_color: string; owner_id: number; invite_code: string }>(
            `SELECT g.id, g.name, g.icon_color, g.owner_id, g.invite_code
             FROM guilds g JOIN guild_members gm ON g.id = gm.guild_id
             WHERE gm.user_id = ?`,
            [decoded.userId]
          );

          // Enrich each guild with its channels, categories, roles, members
          const enrichedGuilds = guilds.map((guild) => {
            const categories = queryAll<{ id: string }>(
              'SELECT * FROM categories WHERE guild_id = ? ORDER BY position',
              [guild.id]
            );
            const channels = queryAll<{ id: string; category_id: string | null }>(
              'SELECT * FROM channels WHERE guild_id = ? ORDER BY position',
              [guild.id]
            );
            const roles = queryAll(
              'SELECT * FROM roles WHERE guild_id = ? ORDER BY position',
              [guild.id]
            );
            const members = queryAll<{ user_id: number; username: string; avatar_color: string; status: string }>(
              `SELECT u.id as user_id, u.username, u.avatar_color, u.status
               FROM users u JOIN guild_members gm ON u.id = gm.user_id
               WHERE gm.guild_id = ?`,
              [guild.id]
            );
            // Nest channels under their category (client only renders category.channels), same shape as POST /guilds.
            const nestedCategories = categories.map((c) => ({
              ...c,
              channels: channels.filter((ch) => ch.category_id === c.id),
            }));
            return {
              ...guild,
              categories: nestedCategories,
              channels: channels.filter((ch) => !ch.category_id),
              roles,
              members,
            };
          });

          const voiceStates = queryAll(
            `SELECT vs.*, u.username, u.avatar_color
             FROM voice_states vs JOIN users u ON u.id = vs.user_id`
          );

          ws.send(JSON.stringify(toCamelCase({
            op: OP_READY,
            d: {
              sessionId: wsId,
              user: {
                id: fullUser.id,
                username: fullUser.username,
                avatarColor: fullUser.avatar_color,
                status: fullUser.status,
                radminIp: clientRadminIp,
              },
              guilds: enrichedGuilds,
              voiceStates,
            },
          })));

          // Broadcast presence update to guild members
          const presence = presenceMgr.getPresence(wsId);
          if (presence) presenceMgr.broadcastPresenceUpdate(wsId, presence, clients);

          console.log(`[Gateway] Client authenticated: ${decoded.username} (${clientRadminIp})`);

        // ── HEARTBEAT ─────────────────────────────────────────────
        } else if (op === OP_HEARTBEAT) {
          const client = clients.get(wsId);
          if (client) {
            client.isAlive = true;
            client.missedHeartbeats = 0;
          }
          ws.send(JSON.stringify({ op: OP_HEARTBEAT_ACK }));

        // ── Authenticated messages ─────────────────────────────────
        } else if (authenticated) {
          handleAuthenticatedMessage(wsId, op, d);
        }
      } catch (err) {
        console.error('[Gateway] Error handling WS message:', err);
      }
    });

    ws.on('close', () => handleDisconnect(wsId));
    ws.on('error', (err) => console.error(`[Gateway] WS error (${wsId}):`, err));
  });

  // ── Heartbeat watchdog ─────────────────────────────────────────
  setInterval(() => {
    for (const [wsId, client] of clients.entries()) {
      if (!client.isAlive) {
        client.missedHeartbeats++;
        if (client.missedHeartbeats >= 3) {
          console.warn(`[Gateway] Terminating zombie client: ${client.username}`);
          client.ws.terminate();
          handleDisconnect(wsId);
          continue;
        }
      }
      client.isAlive = false;
    }
  }, HEARTBEAT_INTERVAL_MS);

  console.log(`[Gateway] WebSocket server listening on port ${port}`);
}

/** Handles authenticated gateway messages (all opcodes except IDENTIFY + HEARTBEAT). */
function handleAuthenticatedMessage(wsId: string, op: number, d: any): void {
  const client = clients.get(wsId);
  if (!client) return;

  switch (op) {
    case OP_JOIN_VOICE: {
      const { channelId, guildId } = d as { channelId: string; guildId: string };

      runWrite(
        `INSERT OR REPLACE INTO voice_states
         (user_id, channel_id, guild_id, muted, deafened, streaming, joined_at)
         VALUES (?, ?, ?, 0, 0, 0, unixepoch())`,
        [client.userId, channelId, guildId]
      );
      signaling.joinVoiceRoom(channelId, client.userId);

      const vs = queryOne(
        `SELECT vs.*, u.username, u.avatar_color
         FROM voice_states vs JOIN users u ON u.id = vs.user_id WHERE vs.user_id = ?`,
        [client.userId]
      );
      broadcastToGuildMembers(guildId, { op: OP_VOICE_STATE_UPDATE, d: vs });

      // Send list of existing peers to the newly joined client
      const peerIds = signaling.getVoiceRoomPeers(channelId).filter((id) => id !== client.userId);
      const peers = peerIds.map((peerId) =>
        queryOne<{ user_id: number; username: string; radmin_ip: string | null }>(
          'SELECT id as user_id, username, radmin_ip FROM users WHERE id = ?',
          [peerId]
        )
      ).filter(Boolean);

      client.ws.send(JSON.stringify(toCamelCase({ op: OP_VOICE_JOINED, d: { channelId, peers } })));
      break;
    }

    case OP_LEAVE_VOICE: {
      const { channelId, guildId } = d as { channelId: string; guildId: string };
      runWrite('DELETE FROM voice_states WHERE user_id = ?', [client.userId]);
      signaling.leaveVoiceRoom(channelId, client.userId);
      broadcastToGuildMembers(guildId, {
        op: OP_VOICE_LEFT,
        d: { userId: client.userId, channelId, guildId },
      });
      break;
    }

    case OP_VOICE_SIGNAL: {
      // Relay SDP offer/answer/ICE-candidate between peers
      signaling.relaySignal(client.userId, d, clients);
      break;
    }

    case OP_UPDATE_PRESENCE: {
      const presence = presenceMgr.getPresence(wsId);
      if (presence) {
        presence.status = d.status ?? presence.status;
        presence.activity = d.activity;
        presenceMgr.broadcastPresenceUpdate(wsId, presence, clients);
      }

      // Mute/deafen/streaming toggles are also sent through this opcode - persist + broadcast to the voice channel.
      if (d.muted !== undefined || d.deafened !== undefined || d.streaming !== undefined) {
        const vs = queryOne<{ channel_id: string; guild_id: string }>(
          'SELECT channel_id, guild_id FROM voice_states WHERE user_id = ?',
          [client.userId]
        );
        if (vs) {
          runWrite(
            'UPDATE voice_states SET muted = ?, deafened = ?, streaming = ? WHERE user_id = ?',
            [d.muted ? 1 : 0, d.deafened ? 1 : 0, d.streaming ? 1 : 0, client.userId]
          );
          const updated = queryOne(
            `SELECT vs.*, u.username, u.avatar_color
             FROM voice_states vs JOIN users u ON u.id = vs.user_id WHERE vs.user_id = ?`,
            [client.userId]
          );
          broadcastToGuildMembers(vs.guild_id, { op: OP_VOICE_STATE_UPDATE, d: updated });
        }
      }
      break;
    }

    case OP_START_STREAM: {
      const { channelId } = d as { channelId: string };
      runWrite('UPDATE voice_states SET streaming = 1 WHERE user_id = ?', [client.userId]);
      const peerIds = signaling.getVoiceRoomPeers(channelId).filter((id) => id !== client.userId);
      peerIds.forEach((peerId) =>
        signaling.relaySignal(client.userId, { targetUserId: peerId, type: 'stream-start', data: {} }, clients)
      );
      break;
    }

    case OP_STOP_STREAM: {
      const { channelId } = d as { channelId: string };
      runWrite('UPDATE voice_states SET streaming = 0 WHERE user_id = ?', [client.userId]);
      const peerIds = signaling.getVoiceRoomPeers(channelId).filter((id) => id !== client.userId);
      peerIds.forEach((peerId) =>
        signaling.relaySignal(client.userId, { targetUserId: peerId, type: 'stream-stop', data: {} }, clients)
      );
      break;
    }
  }
}

/** Cleans up a disconnected client — removes from voice, updates presence. */
function handleDisconnect(wsId: string): void {
  const client = clients.get(wsId);
  if (!client) return;

  console.log(`[Gateway] Client disconnected: ${client.username}`);

  // Remove from voice channel if connected
  const vs = queryOne<{ channel_id: string; guild_id: string }>(
    'SELECT channel_id, guild_id FROM voice_states WHERE user_id = ?',
    [client.userId]
  );
  if (vs) {
    runWrite('DELETE FROM voice_states WHERE user_id = ?', [client.userId]);
    signaling.leaveVoiceRoom(vs.channel_id, client.userId);
    broadcastToGuildMembers(vs.guild_id, {
      op: OP_VOICE_LEFT,
      d: { userId: client.userId, channelId: vs.channel_id, guildId: vs.guild_id },
    });
  }

  // Broadcast offline presence
  const presence = presenceMgr.getPresence(wsId);
  if (presence) {
    presence.status = 'invisible';
    presenceMgr.broadcastPresenceUpdate(wsId, presence, clients);
    presenceMgr.removePresence(wsId);
  }

  clients.delete(wsId);
}

/** Used by message REST API to broadcast MESSAGE_CREATE to a channel's guild members. */
export function broadcastMessageCreate(guildId: string, message: object): void {
  broadcastToGuildMembers(guildId, { op: OP_MESSAGE_CREATE, d: { message } });
}

/** Used by message REST API to broadcast MESSAGE_UPDATE to a channel's guild members. */
export function broadcastMessageUpdate(guildId: string, message: object): void {
  broadcastToGuildMembers(guildId, { op: OP_MESSAGE_UPDATE, d: { message } });
}

/** Used by message REST API to broadcast MESSAGE_DELETE to a channel's guild members. */
export function broadcastMessageDelete(guildId: string, channelId: string, messageId: string): void {
  broadcastToGuildMembers(guildId, { op: OP_MESSAGE_DELETE, d: { channelId, messageId } });
}

/** Used by guild REST API to notify existing members when someone joins via invite. */
export function broadcastGuildMemberAdd(guildId: string, member: object): void {
  broadcastToGuildMembers(guildId, { op: OP_GUILD_MEMBER_ADD, d: { guildId, member } });
}
