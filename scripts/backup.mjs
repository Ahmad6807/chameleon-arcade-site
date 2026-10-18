import { DatabaseSync, backup } from 'node:sqlite';
import { resolve, dirname } from 'node:path';
import { mkdirSync, existsSync, chmodSync } from 'node:fs';

const source = resolve(process.env.DATA_DIR || './data', 'arcade.sqlite');
const destination = process.argv[2] && resolve(process.argv[2]);
if (!destination || destination === source) throw new Error('Usage: node scripts/backup.mjs /private/path/arcade-backup.sqlite (must differ from source)');
if (!existsSync(source)) throw new Error('Source database does not exist; start the application first.');
if (existsSync(destination)) throw new Error('Backup destination exists; choose a new filename.');
mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(source, { readOnly: true });
try {
  const pages = await backup(db, destination);
  chmodSync(destination, 0o600);
  console.log(JSON.stringify({ event: 'backup_complete', pages }));
} finally {
  db.close();
}
