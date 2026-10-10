import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import { createPool, type Pool } from 'mysql2/promise'
import * as schema from '../database/schema'
import { redactUrl, resolveDatabaseUrl } from '../database/url'

export { schema }

let pool: Pool | undefined
let db: MySql2Database<typeof schema> | undefined

export function useDb() {
  if (!db) {
    const url = resolveDatabaseUrl(process.env, useRuntimeConfig().databaseUrl)
    console.info(`[db] using ${redactUrl(url)}`)
    pool = createPool({ uri: url, timezone: 'Z', connectionLimit: 10, enableKeepAlive: true })
    db = drizzle(pool, { schema, mode: 'default' })
  }
  return db
}

export async function closeDb() {
  const p = pool
  pool = db = undefined
  await p?.end()
}
