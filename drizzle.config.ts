import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'mysql',
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  dbCredentials: { url: process.env.NUXT_DATABASE_URL ?? 'mysql://mesh:mesh@localhost:3308/meshtastic' }
})
