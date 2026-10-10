import { isNotNull, sql } from 'drizzle-orm'

/** Node count per firmware release (build hash dropped), from map reports of every node, newest first. */
export default defineEventHandler(async () => {
  const { nodes } = schema
  const rows = await useDb().select({ raw: nodes.firmwareVersion, count: sql<number>`count(*)` })
    .from(nodes).where(isNotNull(nodes.firmwareVersion)).groupBy(nodes.firmwareVersion)
  const counts = new Map<string, number>()
  for (const r of rows) {
    const version = /^\d+\.\d+\.\d+/.exec(r.raw!)?.[0] ?? r.raw!
    counts.set(version, (counts.get(version) ?? 0) + r.count)
  }
  return [...counts].map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
})
