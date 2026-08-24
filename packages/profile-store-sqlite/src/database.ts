import { readFileSync } from 'node:fs'

import Database from 'better-sqlite3'

export type SqliteDatabase = Database.Database

export type SqliteDatabaseOptions = Readonly<{
  /** Explicit SQLite filename. Use `:memory:` for an ephemeral database. */
  filename: string
}>

const fileBackedDatabases = new WeakSet<SqliteDatabase>()
const migrationSql = readFileSync(
  new URL('../migrations/0001_initial.sql', import.meta.url),
  'utf8',
)

const isMemoryFilename = (filename: string): boolean =>
  filename === ':memory:' ||
  filename.startsWith('file::memory:') ||
  /^file:.*[?&]mode=memory(?:&|$)/.test(filename)

export const openSqliteDatabase = ({ filename }: SqliteDatabaseOptions): SqliteDatabase => {
  if (filename.length === 0) {
    throw new Error('SQLite filename must not be empty')
  }

  const database = new Database(filename)
  database.pragma('foreign_keys = ON')
  database.pragma('secure_delete = ON')

  if (!isMemoryFilename(filename)) {
    database.pragma('journal_mode = WAL')
    fileBackedDatabases.add(database)
  }

  return database
}

export const migrateSqliteDatabase = (database: SqliteDatabase): void => {
  const migrate = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `)

    const latest = database
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .get() as { version: number | null } | undefined
    const currentVersion = latest?.version ?? 0

    if (currentVersion < 1) {
      database.exec(migrationSql)
      database
        .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(1, new Date().toISOString())
    }
  })

  migrate()
}

export const checkpointSqliteWal = (database: SqliteDatabase): void => {
  if (fileBackedDatabases.has(database)) {
    database.pragma('wal_checkpoint(TRUNCATE)')
  }
}
