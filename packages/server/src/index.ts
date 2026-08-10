import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { config } from './config';
import { initDb, closeDb } from './database/db';
import { initWebSocketServer } from './gateway/socket';
import { toCamelCase } from './utils/caseTransform';
import { startDiscoveryBeacon } from './discovery';

// Route imports
import authRoutes from './auth/routes';
import guildsRoutes from './api/guilds';
import channelsRoutes from './api/channels';
import messagesRoutes from './api/messages';
import rolesRoutes from './api/roles';

// Wrap startup in async IIFE
(async () => {
  // Ensure required directories exist
  const dataDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(config.uploadsDir)) {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
  }

  // Initialize sql.js DB (async)
  await initDb();

  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use('/uploads', express.static(config.uploadsDir));

  // Transform all outgoing JSON responses from snake_case (SQLite columns) to camelCase.
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => originalJson(toCamelCase(body));
    next();
  });

  // Mount Routers
  app.use('/auth', authRoutes);
  app.use('/guilds', guildsRoutes);
  app.use('/guilds/:guildId/channels', channelsRoutes);
  app.use('/channels', messagesRoutes); // /channels/:channelId/messages is mounted here
  app.use('/guilds/:guildId/roles', rolesRoutes);
  app.use('/guilds/:guildId/members', rolesRoutes); // member roles also exported from roles route

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Create HTTP server
  const server = http.createServer(app);

  // Start HTTP server
  server.listen(config.port, () => {
    console.log(`===============================================`);
    console.log(`🚀 Discord P2P Backend Server is running`);
    console.log(`📡 HTTP API Port: ${config.port}`);
    console.log(`🌐 WebSocket Port: ${config.wsPort}`);
    console.log(`🌍 Reachable over any VPN (Radmin, Tailscale, ZeroTier) or LAN`);
    console.log(`===============================================`);
  });

  // Initialize WebSocket Gateway
  initWebSocketServer(config.wsPort);

  // Broadcast presence so clients can auto-detect this server on the LAN/VPN.
  startDiscoveryBeacon();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down server gracefully...');
    server.close(() => {
      console.log('HTTP server closed.');
      closeDb();
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('Shutting down server gracefully...');
    server.close(() => {
      console.log('HTTP server closed.');
      closeDb();
      process.exit(0);
    });
  });
})();
