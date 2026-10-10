/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 12_742 * Math.asin(Math.sqrt(a))
}

/** Initial bearing from point 1 to point 2, in degrees 0–360 (0 = north). */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180
  const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad)
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad)
  return (Math.atan2(y, x) / rad + 360) % 360
}

/** Point `km` away from (lat, lon) along `bearing` degrees. */
export function destination(lat: number, lon: number, bearing: number, km: number): [number, number] {
  const rad = Math.PI / 180
  const d = km / 6371
  const φ1 = lat * rad
  const θ = bearing * rad
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ))
  const λ2 = lon * rad + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2))
  return [φ2 / rad, λ2 / rad]
}

/**
 * Range plot outline: the farthest peer in each `sectorDeg` slice, joined in bearing order.
 * Directions with no peer pull the outline back to the centre, so it shows where the node
 * actually reaches rather than a guessed circle. Fewer than 2 reached sectors → no outline.
 */
export function rangeOutline(center: [number, number], peers: [number, number][], sectorDeg = 10): [number, number][] {
  const sectors = Math.round(360 / sectorDeg)
  const best: ({ p: [number, number], km: number } | undefined)[] = Array.from({ length: sectors })
  for (const p of peers) {
    const km = haversineKm(center[0], center[1], p[0], p[1])
    if (km < 0.05) continue
    const s = Math.floor(bearingDeg(center[0], center[1], p[0], p[1]) / sectorDeg) % sectors
    if (!best[s] || km > best[s]!.km) best[s] = { p, km }
  }
  if (best.filter(Boolean).length < 2) return []
  const out: [number, number][] = []
  for (const b of best) {
    const v = b ? b.p : center
    const last = out[out.length - 1]
    if (!(last === center && v === center)) out.push(v) // one centre vertex per gap
  }
  return out
}

/** Evenly spaced ring radii (km) with a round step, the last one just beyond `maxKm`. */
export function rangeRings(maxKm: number, count = 4): number[] {
  const steps = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500]
  const step = steps.find(s => s * count >= maxKm) ?? steps[steps.length - 1]!
  const n = Math.max(1, Math.ceil(maxKm / step))
  return Array.from({ length: n }, (_, i) => (i + 1) * step)
}
