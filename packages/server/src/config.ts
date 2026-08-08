import dotenv from 'dotenv';
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
   */
  dbPath: process.env.DB_PATH || './data/discord-p2p.db',

  /**
   * The directory where uploaded files are stored.
   */
  uploadsDir: process.env.UPLOADS_DIR || './uploads',

  /**
   * The maximum allowed file size for uploads in bytes.
   * Defaults to 20MB.
   */
  maxFileSize: 20 * 1024 * 1024,
};

