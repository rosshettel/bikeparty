import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'
import path from 'path'

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'bikeparty.db')

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

// Run migrations manually (no drizzle-kit in production)
export function runMigrations() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      event_date TEXT NOT NULL,
      meet_time TEXT NOT NULL DEFAULT '18:00',
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      final_destination_id TEXT,
      invites_sent_at TEXT,
      group_chat_created_at TEXT,
      conversation_sid TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS destinations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      maps_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rsvps (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      destination_vote_id TEXT,
      responded_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ride_suggestions (
      id TEXT PRIMARY KEY,
      member_name TEXT NOT NULL,
      member_phone TEXT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

  `)

  // Safe migrations for new columns (no-op if already exists)
  const alterations = [
    "ALTER TABLE events ADD COLUMN start_point_name TEXT",
    "ALTER TABLE events ADD COLUMN start_point_address TEXT",
    "ALTER TABLE destinations ADD COLUMN address TEXT",
    "ALTER TABLE ride_suggestions ADD COLUMN address TEXT",
    "ALTER TABLE events ADD COLUMN event_token TEXT",
  ]
  for (const sql of alterations) {
    try { sqlite.exec(sql) } catch { /* column already exists */ }
  }

  console.log('Database migrations complete')
}
