export const ONLINE_MS = 2 * 3_600_000
export const STALE_MS = 24 * 3_600_000

export type NodeStatus = { label: string, color: 'success' | 'warning' | 'neutral', icon: string }

export function nodeStatus(lastHeard: string | null, now: number): NodeStatus {
  const age = lastHeard ? now - Date.parse(lastHeard) : Infinity
  if (age < ONLINE_MS) return { label: 'Online', color: 'success', icon: 'i-lucide-circle-check' }
  if (age < STALE_MS) return { label: 'Stale', color: 'warning', icon: 'i-lucide-clock' }
  return { label: lastHeard ? 'Offline' : 'Never heard', color: 'neutral', icon: 'i-lucide-circle-off' }
}

export function timeAgo(date: string | null, now: number) {
  if (!date) return '—'
  const s = Math.max(0, Math.round((now - Date.parse(date)) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

/** Date + time, always 24h ("10/10/2026, 14:05:09"), whatever the browser locale. */
export function formatDateTime(date: string | number | Date | null, short = false) {
  if (date == null) return ''
  return new Date(date).toLocaleString([], short
    ? { dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }
    : { dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23' })
}

export function fmt(value: number | null | undefined, unit = '', digits = 1) {
  return value == null ? '—' : `${Number(value.toFixed(digits))}${unit}`
}

export function formatUptime(seconds: number | null) {
  if (seconds == null) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  return d ? `${d}d ${h}h` : `${h}h ${Math.floor((seconds % 3600) / 60)}m`
}

export const nodeName = (n: Pick<MeshNode, 'longName' | 'id'>) => n.longName || n.id

/** Battery level 101 means "powered" in Meshtastic. */
export const batteryLabel = (b: number | null) => (b == null ? '—' : b > 100 ? 'Charging' : `${b}%`)

const ACRONYMS = new Set(['RAK', 'TLORA', 'TBEAM', 'LILYGO', 'ESP32', 'NRF52', 'RP2040', 'TDECK', 'LR1110', 'SX1262', 'USB', 'GPS', 'LTE', 'II', 'V2', 'V3', 'V4'])

/** "HELTEC_MESH_POCKET" → "Heltec Mesh Pocket", "CLIENT_MUTE" → "Client Mute" */
export function prettyEnum(value: string | null) {
  if (!value) return null
  return value.split('_')
    .map(w => (ACRONYMS.has(w) || /\d/.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
    .join(' ')
}

/** Meshtastic reports battery 101 when the node runs on external power (charging). */
export const isCharging = (b: number | null) => b != null && b > 100

export function batteryIcon(b: number | null) {
  if (b == null) return 'i-lucide-battery'
  if (isCharging(b)) return 'i-lucide-battery-charging'
  if (b <= 20) return 'i-lucide-battery-low'
  if (b <= 60) return 'i-lucide-battery-medium'
  return 'i-lucide-battery-full'
}

export interface TopLink {
  peer: LinkPeer
  distanceKm: number
  snr: number | null
  source: MeshLink['source']
  lastSeen: string
  count: number
}

/** A node's longest direct RF links, one entry per peer (A→B and B→A merged). */
export function topLinks(links: MeshLink[], num: number, limit = 5): TopLink[] {
  const byPeer = new Map<number, TopLink>()
  for (const l of links) {
    if (l.distanceKm == null || (l.fromNum !== num && l.toNum !== num)) continue
    const peer = l.fromNum === num ? l.to : l.from
    const prev = byPeer.get(peer.num)
    byPeer.set(peer.num, {
      peer,
      distanceKm: l.distanceKm,
      snr: l.snr ?? prev?.snr ?? null,
      source: prev?.source === 'direct' ? 'direct' : l.source,
      lastSeen: prev && prev.lastSeen > l.lastSeen ? prev.lastSeen : l.lastSeen,
      count: (prev?.count ?? 0) + l.count
    })
  }
  return [...byPeer.values()].sort((a, b) => b.distanceKm - a.distanceKm).slice(0, limit)
}

export const peerLabel = (p: LinkPeer) => p.shortName || p.id

export function fmtKm(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${Number(km.toFixed(km < 10 ? 2 : 1))} km`
}

/** Refetched rows plus any live ones that arrived meanwhile, newest first, without duplicates. */
export function mergeById<T extends { id: number }>(fetched: T[], current: T[]) {
  const byId = new Map(current.map(r => [r.id, r]))
  for (const r of fetched) byId.set(r.id, r)
  return [...byId.values()].sort((a, b) => b.id - a.id)
}

export const BROADCAST = 0xffffffff
// Unnamed nodes fall back to the last 4 hex digits of their id, like the firmware's default short name
export const shortLabel = (n: NodeName | undefined, num?: number) =>
  n?.shortName || n?.id?.slice(-4) || (num != null ? num.toString(16).padStart(8, '0').slice(-4) : '?')
export const longLabel = (n: NodeName | undefined) => n?.longName || n?.id || '?'
