const LOCAL_DEV = 'mysql://mesh:mesh@localhost:3308/meshtastic'

/**
 * Picks the MySQL connection URL: NUXT_DATABASE_URL if set, otherwise Laravel/Forge-style
 * DB_HOST / DB_PORT / DB_DATABASE / DB_USERNAME / DB_PASSWORD, otherwise the local docker-compose database.
 * Plain module (no Nuxt auto-imports) so drizzle.config.ts can use it too.
 */
export function resolveDatabaseUrl(env: Record<string, string | undefined> = process.env, configured?: string) {
  const explicit = configured || env.NUXT_DATABASE_URL
  if (explicit) return explicit
  if (env.DB_HOST || env.DB_DATABASE) {
    const user = encodeURIComponent(env.DB_USERNAME ?? 'forge')
    const pass = env.DB_PASSWORD ? `:${encodeURIComponent(env.DB_PASSWORD)}` : ''
    return `mysql://${user}${pass}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? 3306}/${env.DB_DATABASE ?? 'forge'}`
  }
  return LOCAL_DEV
}

/** The URL without its password, for logs. */
export const redactUrl = (url: string) => url.replace(/\/\/([^:@/]+):[^@]*@/, '//$1:***@')
