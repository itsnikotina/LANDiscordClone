PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_color TEXT DEFAULT '#5865F2',
    status TEXT DEFAULT 'online',
    radmin_ip TEXT,
    created_at INTEGER DEFAULT (unixepoch())
) STRICT;

CREATE TABLE IF NOT EXISTS guilds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon_color TEXT,
    owner_id INTEGER,
    invite_code TEXT UNIQUE,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE IF NOT EXISTS guild_members (
    guild_id TEXT,
    user_id INTEGER,
    joined_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY(guild_id, user_id),
    FOREIGN KEY(guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    guild_id TEXT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#99AAB5',
    hoist INTEGER DEFAULT 0,
    permissions INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    FOREIGN KEY(guild_id) REFERENCES guilds(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS member_roles (
    guild_id TEXT,
    user_id INTEGER,
    role_id TEXT,
    PRIMARY KEY(guild_id, user_id, role_id),
    FOREIGN KEY(guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    guild_id TEXT,
    name TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    FOREIGN KEY(guild_id) REFERENCES guilds(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    guild_id TEXT,
    category_id TEXT,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('TEXT','VOICE','FORUM')) DEFAULT 'TEXT',
    topic TEXT,
    position INTEGER DEFAULT 0,
    FOREIGN KEY(guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT,
    author_id INTEGER,
    content TEXT NOT NULL,
    attachments TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (unixepoch()),
    edited_at INTEGER,
    FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE SET NULL
) STRICT;

CREATE TABLE IF NOT EXISTS voice_states (
    user_id INTEGER PRIMARY KEY,
    channel_id TEXT,
    guild_id TEXT,
    muted INTEGER DEFAULT 0,
    deafened INTEGER DEFAULT 0,
    streaming INTEGER DEFAULT 0,
    joined_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY(guild_id) REFERENCES guilds(id) ON DELETE CASCADE
) STRICT;

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_channels_guild_id ON channels(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_user_id ON guild_members(user_id);
CREATE INDEX IF NOT EXISTS idx_roles_guild_id ON roles(guild_id);
CREATE INDEX IF NOT EXISTS idx_categories_guild_id ON categories(guild_id);
CREATE INDEX IF NOT EXISTS idx_voice_states_channel_id ON voice_states(channel_id);
CREATE INDEX IF NOT EXISTS idx_voice_states_guild_id ON voice_states(guild_id);
