/**
 * Database module using sql.js (pure JavaScript/WASM SQLite).
 * No native compilation required — works on any Node.js version and OS.
 * Data is persisted to disk after each write operation.
 */
import fs from 'fs';
import path from 'path';
import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

/** Permission bitmask values (stored as integer in SQLite). */
export enum Permission {
  VIEW_CHANNEL   = 1,
  SEND_MESSAGES  = 2,
  MANAGE_MESSAGES = 4,
  CONNECT_VOICE  = 8,
  SPEAK          = 16,
  STREAM         = 32,
  MUTE_MEMBERS   = 64,
  DEAFEN_MEMBERS = 128,
  MANAGE_CHANNELS = 256,
  MANAGE_GUILD   = 512,
  MANAGE_ROLES   = 1024,
  ADMINISTRATOR  = 2048,
}

let dbInstance: SqlJsDatabase | null = null;
let sqlJs: SqlJsStatic | null = null;

/** How often to auto-save the DB to disk (milliseconds). */
const PERSIST_INTERVAL_MS = 5000;
let persistTimer: ReturnType<typeof setInterval> | null = null;

/** Write the in-memory database to disk. */
function persistDb(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(config.dbPath, buffer);
  } catch (err) {
    console.error('[DB] Failed to persist database:', err);
  }
}

/** Accepted parameter types for SQL queries. Matches Express req.params + common values. */
export type SqlParam = string | string[] | number | null | Uint8Array;

/** Normalize params: flatten string[] to first element (Express route params are always strings). */
function normalizeParams(params: SqlParam[]): (string | number | null | Uint8Array)[] {
  return params.map((p) => (Array.isArray(p) ? p[0] ?? null : p));
}

/** 
 * Thin wrapper to run a write statement and immediately persist.
 * Use for INSERT/UPDATE/DELETE operations.
 */
export function runWrite(sql: string, params: SqlParam[] = []): void {
  const db = getDb();
  db.run(sql, normalizeParams(params));
  persistDb();
}

/**
 * Execute a query and return all rows as plain objects.
 */
export function queryAll<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.bind(normalizeParams(params));
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

/**
 * Execute a query and return a single row or null.
 */
export function queryOne<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): T | null {
  const rows = queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Execute a raw SQL string (for schema init, multi-statement).
 */
export function execSql(sql: string): void {
  getDb().run(sql);
}

/**
 * Returns the singleton sql.js Database instance (synchronous after init).
 * Must call initDb() before using this.
 */
export function getDb(): SqlJsDatabase {
  if (!dbInstance) {
    throw new Error('[DB] Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}

/**
 * Asynchronously initialize the database.
 * Loads or creates the SQLite file and executes the schema.
 * Must be called once at server startup before any other DB operations.
 */
export async function initDb(): Promise<void> {
  if (dbInstance) return;

  // Load sql.js WASM
  sqlJs = await initSqlJs();

  // Ensure data directory exists
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Load existing DB file or create new one
  if (fs.existsSync(config.dbPath)) {
    const fileBuffer = fs.readFileSync(config.dbPath);
    dbInstance = new sqlJs.Database(fileBuffer);
    console.log(`[DB] Loaded existing database from ${config.dbPath}`);
  } else {
    dbInstance = new sqlJs.Database();
    console.log(`[DB] Created new database at ${config.dbPath}`);
  }

  // Enable WAL-equivalent settings
  dbInstance.run('PRAGMA journal_mode = MEMORY;');
  dbInstance.run('PRAGMA foreign_keys = ON;');

  // Execute schema (CREATE TABLE IF NOT EXISTS — idempotent)
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  dbInstance.run(schemaContent);

  // Initial persist
  persistDb();

  // Start periodic auto-save
  if (persistTimer) clearInterval(persistTimer);
  persistTimer = setInterval(persistDb, PERSIST_INTERVAL_MS);

  // Seed default guild if empty
  seedDefaultGuild();

  console.log('[DB] Database initialized successfully.');
}

/**
 * Seeds a default "General" guild with text + voice channels on first run.
 */
function seedDefaultGuild(): void {
  const result = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM guilds');
  if (!result || result.count > 0) return;

  const guildId      = uuidv4();
  const roleId       = uuidv4();
  const textCatId    = uuidv4();
  const voiceCatId   = uuidv4();
  const textChanId   = uuidv4();
  const voiceChanId  = uuidv4();

  const basePerms = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES |
                    Permission.CONNECT_VOICE | Permission.SPEAK;

  const db = getDb();

  db.run(
    'INSERT INTO guilds (id, name, icon_color, invite_code) VALUES (?,?,?,?)',
    [guildId, 'General', '#5865F2', 'general-invite-' + guildId.slice(0, 8)]
  );
  db.run(
    'INSERT INTO roles (id, guild_id, name, color, position, permissions) VALUES (?,?,?,?,?,?)',
    [roleId, guildId, '@everyone', '#99AAB5', 0, basePerms]
  );
  db.run(
    'INSERT INTO categories (id, guild_id, name, position) VALUES (?,?,?,?)',
    [textCatId, guildId, 'Canais de Texto', 0]
  );
  db.run(
    'INSERT INTO categories (id, guild_id, name, position) VALUES (?,?,?,?)',
    [voiceCatId, guildId, 'Canais de Voz', 1]
  );
  db.run(
    'INSERT INTO channels (id, guild_id, category_id, name, type, position) VALUES (?,?,?,?,?,?)',
    [textChanId, guildId, textCatId, 'geral', 'TEXT', 0]
  );
  db.run(
    'INSERT INTO channels (id, guild_id, category_id, name, type, position) VALUES (?,?,?,?,?,?)',
    [voiceChanId, guildId, voiceCatId, 'voz-geral', 'VOICE', 0]
  );

  persistDb();
  console.log('[DB] Seeded default "General" guild.');
}

/** Gracefully close the database, flushing all data to disk. */
export function closeDb(): void {
  if (persistTimer) {
    clearInterval(persistTimer);
    persistTimer = null;
  }
  persistDb();
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  console.log('[DB] Database closed and persisted.');
}
