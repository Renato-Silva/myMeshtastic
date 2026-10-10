import { and, asc, eq, gte } from 'drizzle-orm'

const flatten = (rows: { ts: Date, data: Record<string, number> }[]) => rows.map(r => ({ ts: r.ts, ...r.data }))

export default defineEventHandler(async (event) => {
  const num = Number(getRouterParam(event, 'num'))
  const { since, bucketMs } = parseRange(getQuery(event).range)
  const db = useDb()
  const { envMetrics: env, deviceMetrics: dev, extraMetrics: extra } = schema
  const extraOf = (kind: 'local' | 'power' | 'air') =>
    db.select({ ts: extra.ts, data: extra.data }).from(extra)
      .where(and(eq(extra.nodeNum, num), eq(extra.kind, kind), gte(extra.ts, since)))
      .orderBy(asc(extra.ts))
      .then(flatten)

  const [environment, device, local, power, air] = await Promise.all([
    db.select().from(env).where(and(eq(env.nodeNum, num), gte(env.ts, since))).orderBy(asc(env.ts)),
    db.select().from(dev).where(and(eq(dev.nodeNum, num), gte(dev.ts, since))).orderBy(asc(dev.ts)),
    extraOf('local'),
    extraOf('power'),
    extraOf('air')
  ])
  return {
    environment: bucketRows(environment, bucketMs),
    device: bucketRows(device, bucketMs),
    local: bucketRows(local, bucketMs) as { ts: Date, [key: string]: number | Date }[],
    power: bucketRows(power, bucketMs) as { ts: Date, [key: string]: number | Date }[],
    air: bucketRows(air, bucketMs) as { ts: Date, [key: string]: number | Date }[]
  }
})
