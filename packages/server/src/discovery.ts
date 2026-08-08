import dgram from 'dgram';
import { config } from './config';

const DISCOVERY_PORT = 41234;
const BROADCAST_INTERVAL_MS = 2000;

/** Periodically broadcasts this server's presence on the LAN/VPN so clients can auto-detect it, Minecraft-LAN-style. */
export function startDiscoveryBeacon(): void {
  try {
    const socket = dgram.createSocket('udp4');

    socket.on('error', (err) => {
      console.warn('[Discovery] UDP beacon error (non-fatal, auto-discovery just won\'t work):', err.message);
    });

    socket.bind(() => {
      socket.setBroadcast(true);
    });

    const payload = Buffer.from(JSON.stringify({
      app: 'discord-p2p',
      apiPort: config.port,
      wsPort: config.wsPort,
    }));

    setInterval(() => {
      socket.send(payload, 0, payload.length, DISCOVERY_PORT, '255.255.255.255', (err) => {
        if (err) console.warn('[Discovery] Broadcast send failed (non-fatal):', err.message);
      });
    }, BROADCAST_INTERVAL_MS);

    console.log(`[Discovery] Broadcasting presence on UDP port ${DISCOVERY_PORT} every ${BROADCAST_INTERVAL_MS}ms`);
  } catch (err: any) {
    console.warn('[Discovery] Failed to start UDP beacon (non-fatal, auto-discovery just won\'t work):', err.message);
  }
}
