import { desc, eq } from 'drizzle-orm'

export default defineEventHandler((event) => {
  const node = nodeQuery(event)
  const { packets } = schema
  const query = useDb().select().from(packets).$dynamic()
  if (node !== undefined) query.where(eq(packets.from, node))
  return query.orderBy(desc(packets.id)).limit(limitQuery(event, 100, 500))
})
