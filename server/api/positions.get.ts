import { asc, gte } from 'drizzle-orm'

/** Hard cap so a year of trails can't produce a multi-megabyte response. */
const MAX_POINTS = 50_000

/** Position history of every node, for map trails. Repeated fixes of a stationary node are collapsed. */
export default defineEventHandler(async (event) => {
  const { positions } = schema
  const rows = await useDb().select().from(positions)
    .where(gte(positions.ts, rangeStart(getQuery(event).range)))
    .orderBy(asc(positions.ts))
  return dedupePositions(rows).slice(-MAX_POINTS)
})
