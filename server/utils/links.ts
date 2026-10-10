import { and, eq, gte, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/mysql-core'

const LINK_WINDOW_MS = 30 * 86_400_000

const peerColumns = (n: typeof schema.nodes) => ({
  num: n.num, id: n.id, shortName: n.shortName, longName: n.longName, lat: n.lat, lon: n.lon
})

/** Links seen in the last 30 days, with both ends' names/positions and the distance between them. */
export async function queryLinks(filter?: SQL) {
  const l = schema.links
  const a = alias(schema.nodes, 'a')
  const b = alias(schema.nodes, 'b')
  const rows = await useDb()
    .select({ link: l, from: peerColumns(a), to: peerColumns(b) })
    .from(l)
    .leftJoin(a, eq(a.num, l.fromNum))
    .leftJoin(b, eq(b.num, l.toNum))
    .where(and(gte(l.lastSeen, new Date(Date.now() - LINK_WINDOW_MS)), filter))

  return rows.map(({ link, from, to }) => {
    const f = from ?? { num: link.fromNum, id: numToId(link.fromNum), shortName: null, longName: null, lat: null, lon: null }
    const t = to ?? { num: link.toNum, id: numToId(link.toNum), shortName: null, longName: null, lat: null, lon: null }
    const distanceKm = f.lat != null && f.lon != null && t.lat != null && t.lon != null
      ? haversineKm(f.lat, f.lon, t.lat, t.lon)
      : null
    return { ...link, from: f, to: t, distanceKm }
  })
}
