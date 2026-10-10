import { desc } from 'drizzle-orm'

export default defineEventHandler(() =>
  useDb().select().from(schema.nodes).orderBy(desc(schema.nodes.lastHeard))
)
