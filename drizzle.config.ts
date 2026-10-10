import { defineConfig } from 'drizzle-kit'
import { redactUrl, resolveDatabaseUrl } from './server/database/url'

// drizzle-kit doesn't read .env on its own (Forge links it into each release)
try {
  process.loadEnvFile()
} catch {}

const url = resolveDatabaseUrl()
console.info(`Database: ${redactUrl(url)}`)

export default defineConfig({
  dialect: 'mysql',
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  dbCredentials: { url }
})
