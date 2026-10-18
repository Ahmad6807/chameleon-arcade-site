import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migration = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../migrations/001-initial.sql'), 'utf8');
export function openDatabase(path) {
  mkdirSync(dirname(path), {recursive: true});
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(migration);
  return db;
}
