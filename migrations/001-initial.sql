PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  mute INTEGER NOT NULL DEFAULT 0 CHECK (mute IN (0,1))
);
CREATE TABLE IF NOT EXISTS saves (
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  game TEXT NOT NULL CHECK (game IN ('balloons','hex','network','evolution','architect','outbreak','cipher')),
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (guest_id, game)
);
CREATE INDEX IF NOT EXISTS saves_owner_idx ON saves(guest_id);
CREATE TABLE IF NOT EXISTS history (
  guest_id TEXT NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  game TEXT NOT NULL CHECK (game IN ('balloons','hex','network','evolution','architect','outbreak','cipher')),
  outcome TEXT NOT NULL CHECK (outcome IN ('win','loss','draw','completed')),
  details TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (guest_id, id)
);
CREATE INDEX IF NOT EXISTS history_owner_created_idx ON history(guest_id, created_at DESC, id);
