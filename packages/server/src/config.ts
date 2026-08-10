import dotenv from 'dotenv';
import path from 'path';
dotenv.config();

/**
 * Environment configuration for the Discord P2P backend server.
 * This object holds all the configuration values used throughout the application.
 */
export const config = {
  /**
   * The port for the Express HTTP server.
   * Defaults to 3001 if not specified in the environment.
   */
  port: Number(process.env.PORT) || 3001,

  /**
   * The port for the WebSocket gateway server.
   * Defaults to 3002 if not specified in the environment.
   */
  wsPort: Number(process.env.WS_PORT) || 3002,

  /**
   * The secret key used for signing JSON Web Tokens (JWT).
   * It is crucial to change this in production.
   */
  jwtSecret: process.env.JWT_SECRET || 'discord-p2p-secret-change-me',

  /**
   * The shared server password required for any user to register or join.
   * Enforces global server access control.
   */
  serverPassword: process.env.SERVER_PASSWORD || 'amigos123',

  /**
   * The path to the SQLite database file.
   * Anchored to this package's own directory (not process.cwd()) so the same
   * database is always found regardless of how/where the server is launched.
   */
  dbPath: path.resolve(__dirname, '..', process.env.DB_PATH || './data/discord-p2p.db'),

  /**
   * The directory where uploaded files are stored.
   * Also anchored to this package's directory - see dbPath comment above.
   */
  uploadsDir: path.resolve(__dirname, '..', process.env.UPLOADS_DIR || './uploads'),

  /**
   * The maximum allowed file size for uploads in bytes.
   * Defaults to 20MB.
   */
  maxFileSize: 20 * 1024 * 1024,

  /**
   * Embedded TURN relay (fallback for peers whose networks can't reach each other
   * directly, e.g. one on Tailscale + one on Radmin). Small relay port range keeps
   * the Windows Firewall rule simple (one UDP/TCP range to allow, not the full
   * 49152-65535 dynamic range).
   */
  turnPort: Number(process.env.TURN_PORT) || 3478,
  turnMinPort: Number(process.env.TURN_MIN_PORT) || 49152,
  turnMaxPort: Number(process.env.TURN_MAX_PORT) || 49172,
  turnUsername: 'discord-p2p',
  // Reuses the server join password - anyone who can register already knows it, so
  // handing it back via the authenticated /rtc-config endpoint reveals nothing new.
  turnPassword: process.env.SERVER_PASSWORD || 'amigos123',
};


