import { desc, eq } from 'drizzle-orm'

export default defineEventHandler(() =>
  useDb().select().from(schema.nodes).where(eq(schema.nodes.monitored, true)).orderBy(desc(schema.nodes.lastHeard))
)
