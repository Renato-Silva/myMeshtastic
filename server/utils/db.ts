import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import { createPool } from 'mysql2/promise'
import * as schema from '../database/schema'
import { redactUrl, resolveDatabaseUrl } from '../database/url'

export { schema }

let db: MySql2Database<typeof schema> | undefined

export function useDb() {
  if (!db) {
    const url = resolveDatabaseUrl(process.env, useRuntimeConfig().databaseUrl)
    console.info(`[db] using ${redactUrl(url)}`)
    const pool = createPool({ uri: url, timezone: 'Z' })
    db = drizzle(pool, { schema, mode: 'default' })
  }
  return db
}
