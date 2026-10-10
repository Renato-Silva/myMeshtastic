import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import * as schema from '../database/schema'

export { schema }

let sqlite: DatabaseSync | undefined
let db: SqliteRemoteDatabase<typeof schema> | undefined

/** The built-in node:sqlite driver behind Drizzle's proxy adapter: no native module to compile. */
export function useDb() {
  if (!db) {
    const file = resolve(useRuntimeConfig().databasePath)
    console.info(`[db] using ${file}`)
    mkdirSync(dirname(file), { recursive: true })
    const conn = sqlite = new DatabaseSync(file)
    conn.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000')
    db = drizzle(async (query, params, method) => {
      const stmt = conn.prepare(query)
      const args = params as SQLInputValue[]
      if (method === 'run') return { rows: [], ...stmt.run(...args) }
      stmt.setReturnArrays(true)
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

export function closeDb() {
  sqlite?.close()
  sqlite = db = undefined
}
