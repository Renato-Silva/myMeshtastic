import { desc, gte, isNull, ne, or, sql } from 'drizzle-orm'

/** Hard cap so a year of trails can't produce a multi-megabyte response. */
const MAX_POINTS = 50_000

/** Position history of every node, for map trails. Repeated fixes of a stationary node are collapsed. */
export default defineEventHandler(async (event) => {
  const { positions: p } = schema
  const db = useDb()
  // Same as dedupePositions(), but in SQL so only the newest MAX_POINTS fixes ever leave the database
  const fixes = db.select({
    nodeNum: p.nodeNum,
    lat: p.lat,
    lon: p.lon,
    ts: p.ts,
    prevLat: sql<number | null>`lag(${p.lat}) over (partition by ${p.nodeNum} order by ${p.ts}, ${p.id})`.as('prev_lat'),
    prevLon: sql<number | null>`lag(${p.lon}) over (partition by ${p.nodeNum} order by ${p.ts}, ${p.id})`.as('prev_lon')
  }).from(p).where(gte(p.ts, rangeStart(getQuery(event).range))).as('fixes')

  const rows = await db.select({ nodeNum: fixes.nodeNum, lat: fixes.lat, lon: fixes.lon, ts: fixes.ts })
    .from(fixes)
    .where(or(isNull(fixes.prevLat), ne(fixes.lat, fixes.prevLat), ne(fixes.lon, fixes.prevLon)))
    .orderBy(desc(fixes.ts))
    .limit(MAX_POINTS)
  return rows.reverse()
})
