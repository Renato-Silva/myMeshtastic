import { and, eq, gte, sql } from 'drizzle-orm'

/** Last 24 h: packets the node sent, messages, the best signal a gateway got from it, and its sensor's min/max. */
export default defineEventHandler(async (event) => {
  const num = routeNodeNum(event)
  const since = new Date(Date.now() - 86_400_000)
  const db = useDb()
  const { packets: p, messages: m, envMetrics: e } = schema
  const [[traffic], [msgs], [env]] = await Promise.all([
    db.select({
      packets: sql<number>`count(*)`,
      bestSnr: sql<number | null>`max(${p.snr})`,
      bestRssi: sql<number | null>`max(${p.rssi})`,
      minHops: sql<number | null>`min(${p.hops})`
    }).from(p).where(and(eq(p.from, num), gte(p.ts, since))),
    db.select({ count: sql<number>`count(*)` }).from(m).where(and(eq(m.from, num), gte(m.ts, since))),
    db.select({
      minTemp: sql<number | null>`min(${e.temperature})`,
      maxTemp: sql<number | null>`max(${e.temperature})`,
      minHum: sql<number | null>`min(${e.humidity})`,
      maxHum: sql<number | null>`max(${e.humidity})`,
      minPres: sql<number | null>`min(${e.pressure})`,
      maxPres: sql<number | null>`max(${e.pressure})`
    }).from(e).where(and(eq(e.nodeNum, num), gte(e.ts, since)))
  ])
  return { ...traffic!, messages: msgs!.count, env: env! }
})
