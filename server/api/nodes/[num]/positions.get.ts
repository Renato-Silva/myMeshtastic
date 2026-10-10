import { and, asc, eq, gte } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const num = routeNodeNum(event)
  const { positions } = schema
  const rows = await useDb().select().from(positions)
    .where(and(eq(positions.nodeNum, num), gte(positions.ts, rangeStart(getQuery(event).range))))
    .orderBy(asc(positions.ts))
  return dedupePositions(rows)
})
