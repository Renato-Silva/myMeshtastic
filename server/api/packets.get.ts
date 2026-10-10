import { desc, eq } from 'drizzle-orm'

export default defineEventHandler((event) => {
  const { limit, node } = getQuery(event)
  const { packets } = schema
  const query = useDb().select().from(packets).$dynamic()
  if (node) query.where(eq(packets.from, Number(node)))
  return query.orderBy(desc(packets.id)).limit(Math.min(Number(limit) || 100, 500))
})
