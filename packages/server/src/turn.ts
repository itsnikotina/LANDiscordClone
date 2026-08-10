import Turn from 'node-turn';
import { config } from './config';

/**
 * Embedded STUN/TURN relay. When two peers can't reach each other directly (e.g. one is
 * on Tailscale, the other on Radmin - no shared network route), WebRTC falls back to
 * relaying media through THIS host instead of failing the call entirely.
 *
 * SECURITY NOTE: node-turn is an unmaintained package (last published years ago) with
 * known DoS-class vulnerabilities in its logging/config-parsing dependencies (log4js/js-yaml).
 * Those code paths are not exercised by our usage (no .conf file, no untrusted logged input),
 * and this server is only reachable by trusted friends behind SERVER_PASSWORD + JWT - accepted
 * as a deliberate tradeoff since there's no maintained pure-JS alternative and coturn has no
 * official Windows binary. Revisit if a better-maintained option appears.
 */
export function startTurnServer(): void {
  try {
    const server = new Turn({
      authMech: 'long-term',
      credentials: { [config.turnUsername]: config.turnPassword },
      listeningPort: config.turnPort,
      minPort: config.turnMinPort,
      maxPort: config.turnMaxPort,
      debugLevel: 'ERROR',
    });
    server.start();
    console.log(`🧊 TURN/STUN relay listening on port ${config.turnPort} (UDP/TCP) - fallback for peers who can't reach each other directly`);
  } catch (e) {
    console.error('Failed to start TURN relay (direct P2P still works for peers on the same network):', e);
  }
}
