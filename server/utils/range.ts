const RANGES: Record<string, number> = { '6h': 6, '24h': 24, '7d': 168, '30d': 720 }

/** Converts a ?range= query value into a start date (defaults to 24h). */
export function rangeStart(range: unknown) {
  const hours = RANGES[String(range)] ?? 24
  return new Date(Date.now() - hours * 3_600_000)
}
