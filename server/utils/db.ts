import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite'
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import * as schema from '../database/schema'

export { schema }

let sqlite: DatabaseSync | undefined
let db: SqliteRemoteDatabase<typeof schema> | undefined

/** Ingest runs the same few statements over and over. Capped because inArray() makes one SQL string per list length. */
const MAX_STATEMENTS = 200
const statements = new Map<string, StatementSync>()

function prepare(conn: DatabaseSync, query: string) {
  let stmt = statements.get(query)
  if (stmt) {
    // Re-insert to mark it most recently used
    statements.delete(query)
  } else {
    stmt = conn.prepare(query)
    // Drizzle's proxy driver wants rows as arrays; run() ignores this
    stmt.setReturnArrays(true)
    if (statements.size >= MAX_STATEMENTS) statements.delete(statements.keys().next().value!)
  }
  statements.set(query, stmt)
  return stmt
}

/** The built-in node:sqlite driver behind Drizzle's proxy adapter: no native module to compile. */
export function useDb() {
  if (!db) {
    const file = resolve(useRuntimeConfig().databasePath)
    console.info(`[db] using ${file}`)
    mkdirSync(dirname(file), { recursive: true })
    const conn = sqlite = new DatabaseSync(file)
    conn.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000')
    db = drizzle(async (query, params, method) => {
      const stmt = prepare(conn, query)
      const args = params as SQLInputValue[]
      if (method === 'run') return { rows: [], ...stmt.run(...args) }
      return { rows: method === 'get' ? stmt.get(...args) as any : stmt.all(...args) }
    }, { schema })
  }
  return db
}

/** Runs migration statements in one transaction (Drizzle's proxy migrator hands them over as strings). */
export function execMigrations(queries: string[]) {
  useDb()
  sqlite!.exec('BEGIN')
  try {
    for (const q of queries) sqlite!.exec(q)
    sqlite!.exec('COMMIT')
  } catch (err) {
    sqlite!.exec('ROLLBACK')
    throw err
  }
}

/**
 * Runs fn's queries in one transaction. The connection is shared, so callers must not overlap
 * (ingest and pruning go through the MQTT plugin's queue); reads from API handlers are fine.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  useDb()
  sqlite!.exec('BEGIN')
  try {
    const result = await fn()
    sqlite!.exec('COMMIT')
    return result
  } catch (err) {
    sqlite!.exec('ROLLBACK')
    throw err
  }
}

export function closeDb() {
  statements.clear()
  sqlite?.close()
  sqlite = db = undefined
}
