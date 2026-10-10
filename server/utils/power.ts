/**
 * A period when the battery was being charged.
 * external = the node reported battery > 100 (firmware's "on external power" value)
 * charging = voltage climbed RISE_V above its recent low (e.g. solar during the day)
 */
export interface ChargeSession {
  start: Date
  end: Date
  kind: 'external' | 'charging'
  fromV: number | null
  toV: number | null
  ongoing: boolean
}

const RISE_V = 0.04 // climb above the running low that counts as charging (readings jitter ~0.01 V)
const DROP_V = 0.03 // fall below the running high that ends a session
const MAX_GAP_MS = 2 * 3_600_000 // no readings for this long closes the session at the last one

type Reading = { ts: Date, battery: number | null, voltage: number | null }
type Point = { ts: Date, v: number | null }

/** Finds charging sessions in device metrics. Rows must be sorted by ts and not bucketed. */
export function chargeSessions(rows: Reading[], now = Date.now()): ChargeSession[] {
  const out: ChargeSession[] = []
  let open: { kind: ChargeSession['kind'], start: Point, last: Point, high: Point } | null = null
  let low: Point | null = null
  let prev: Reading | null = null

  const close = (end: Point) => {
    if (open && end.ts > open.start.ts)
      out.push({ start: open.start.ts, end: end.ts, kind: open.kind, fromV: open.start.v, toV: end.v, ongoing: false })
    open = null
  }

  for (const r of rows) {
    const p: Point = { ts: r.ts, v: r.voltage }
    if (prev && r.ts.getTime() - prev.ts.getTime() > MAX_GAP_MS) {
      if (open) close(open.last)
      low = null
    }
    prev = r

    const external = r.battery != null && r.battery > 100
    if (external) {
      if (open?.kind !== 'external') {
        if (open) close(open.last)
        open = { kind: 'external', start: p, last: p, high: p }
      }
      open.last = p
      low = null
      continue
    }
    if (open?.kind === 'external') close(open.last)
    if (r.voltage == null) continue

    if (open) {
      open.last = p
      if (r.voltage >= open.high.v!) open.high = p
      else if (open.high.v! - r.voltage >= DROP_V) {
        close(open.high)
        low = p
      }
    } else if (!low || r.voltage <= low.v!) low = p
    else if (r.voltage - low.v! >= RISE_V) {
      open = { kind: 'charging', start: low, last: p, high: p }
      low = null
    }
  }

  if (open) {
    const o = open as NonNullable<typeof open>
    const recent = now - o.last.ts.getTime() <= MAX_GAP_MS
    out.push({ start: o.start.ts, end: o.last.ts, kind: o.kind, fromV: o.start.v, toV: o.last.v, ongoing: recent })
  }
  return out
}
