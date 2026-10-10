import { and, asc, eq, gte } from 'drizzle-orm'

export default defineEventHandler((event) => {
  const num = Number(getRouterParam(event, 'num'))
  const { positions } = schema
  return useDb().select().from(positions)
    .where(and(eq(positions.nodeNum, num), gte(positions.ts, rangeStart(getQuery(event).range))))
    .orderBy(asc(positions.ts))
})
