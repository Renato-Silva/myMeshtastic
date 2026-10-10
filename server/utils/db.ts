import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import { createPool } from 'mysql2/promise'
import * as schema from '../database/schema'

export { schema }

let db: MySql2Database<typeof schema> | undefined

export function useDb() {
  if (!db) {
    const pool = createPool({ uri: useRuntimeConfig().databaseUrl, timezone: 'Z' })
    db = drizzle(pool, { schema, mode: 'default' })
  }
  return db
}
