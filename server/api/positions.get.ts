import { asc, gte } from 'drizzle-orm'

/** Position history of every node, for map trails. */
export default defineEventHandler((event) => {
  const { positions } = schema
  return useDb().select().from(positions)
    .where(gte(positions.ts, rangeStart(getQuery(event).range)))
    .orderBy(asc(positions.ts))
})
