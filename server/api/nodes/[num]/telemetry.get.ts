import { and, asc, eq, gte } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const num = Number(getRouterParam(event, 'num'))
  const { range } = getQuery(event)
  const since = rangeStart(range)
  const db = useDb()
  const { envMetrics: env, deviceMetrics: dev } = schema

  const [environment, device] = await Promise.all([
    db.select().from(env).where(and(eq(env.nodeNum, num), gte(env.ts, since))).orderBy(asc(env.ts)),
    db.select().from(dev).where(and(eq(dev.nodeNum, num), gte(dev.ts, since))).orderBy(asc(dev.ts))
  ])
  return { environment, device }
})
