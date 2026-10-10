/** Chart ranges; longer ones are averaged into buckets so a year of data stays a few hundred points. */
const RANGES: Record<string, { hours: number, bucketMinutes: number }> = {
  '6h': { hours: 6, bucketMinutes: 0 },
  '24h': { hours: 24, bucketMinutes: 0 },
  '7d': { hours: 168, bucketMinutes: 0 },
  '30d': { hours: 720, bucketMinutes: 60 },
  '90d': { hours: 2160, bucketMinutes: 180 },
  '1y': { hours: 8760, bucketMinutes: 1440 }
}

export function parseRange(range: unknown) {
  const r = RANGES[String(range)] ?? RANGES['24h']!
  return { since: new Date(Date.now() - r.hours * 3_600_000), bucketMs: r.bucketMinutes * 60_000 }
}

/** Converts a ?range= query value into a start date (defaults to 24h). */
export const rangeStart = (range: unknown) => parseRange(range).since

/** Averages every numeric field per time bucket. Rows must be sorted by ts. */
export function bucketRows<T extends { ts: Date }>(rows: T[], bucketMs: number): T[] {
  if (!bucketMs || !rows.length) return rows
  const groups = new Map<number, T[]>()
  for (const row of rows) {
    const key = Math.floor(row.ts.getTime() / bucketMs)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return [...groups].map(([key, group]) => {
    const out: Record<string, unknown> = { ...group[0], ts: new Date(key * bucketMs) }
    for (const field of Object.keys(out)) {
      if (field === 'ts' || field === 'id' || field === 'nodeNum') continue
      const values = group.map(r => (r as any)[field]).filter((v): v is number => typeof v === 'number')
      if (values.length) out[field] = values.reduce((a, b) => a + b, 0) / values.length
    }
    return out as T
  })
}

/** Drops fixes identical to the node's previous one (stationary nodes re-send the same position every few minutes). */
export function dedupePositions<T extends { nodeNum: number, lat: number, lon: number }>(rows: T[]): T[] {
  const last = new Map<number, T>()
  return rows.filter((row) => {
    const prev = last.get(row.nodeNum)
    last.set(row.nodeNum, row)
    return !prev || prev.lat !== row.lat || prev.lon !== row.lon
  })
}
