import { createDecipheriv } from 'node:crypto'
import { fromBinary } from '@bufbuild/protobuf'
import { Config, Mesh, Mqtt, Portnums, Telemetry } from '@meshtastic/protobufs'
import { and, eq, gte, or, sql, type SQL } from 'drizzle-orm'
import type { MeshEvent } from './bus'

const { PortNum } = Portnums
const DEFAULT_KEY = Buffer.from('1PG7OiApB1nwvP+rz05pAQ==', 'base64')
export const BROADCAST = 0xffffffff
/** Traceroute SNRs are int8 × 4; this value means "unknown". */
const SNR_UNKNOWN = -128

export const numToId = (num: number) => '!' + num.toString(16).padStart(8, '0')

/** Accepts "!a0cc2ad0", "a0cc2ad0" or a 9-10 digit decimal node number. */
export function parseNodeId(value: string): number | undefined {
  const v = value.trim().replace(/^!/, '')
  if (/^\d{9,10}$/.test(v)) {
    const num = Number(v)
    return num <= 0xffffffff ? num : undefined
  }
  if (/^[0-9a-f]{1,8}$/i.test(v)) return Number.parseInt(v, 16)
}

/** Expands a base64 channel PSK the way the firmware does (1-byte keys are shorthand for the default key). */
export function expandKey(psk: string): Buffer | undefined {
  const raw = Buffer.from(psk.trim(), 'base64')
  if (raw.length === 0 || (raw.length === 1 && raw[0] === 0)) return
  if (raw.length === 1) {
    const key = Buffer.from(DEFAULT_KEY)
    key[15] = (key[15]! + raw[0]! - 1) & 0xff
    return key
  }
  return raw
}

function decrypt(packet: Mesh.MeshPacket, encrypted: Uint8Array, keys: Buffer[]): Mesh.Data | undefined {
  const nonce = Buffer.alloc(16)
  nonce.writeBigUInt64LE(BigInt(packet.id), 0)
  nonce.writeUInt32LE(packet.from, 8)
  for (const key of keys) {
    try {
      const decipher = createDecipheriv(key.length === 32 ? 'aes-256-ctr' : 'aes-128-ctr', key, nonce)
      const data = fromBinary(Mesh.DataSchema, Buffer.concat([decipher.update(encrypted), decipher.final()]))
      // A wrong key usually fails to parse; when it doesn't, the portnum is garbage.
      if (data.portnum !== PortNum.UNKNOWN_APP && PortNum[data.portnum]) return data
    } catch {}
  }
}

/** Copies of one packet from several gateways arrive within seconds; IDs can repeat over months. */
const DEDUPE_WINDOW_MS = 3_600_000

const nullIfZero = (v: number | undefined) => (v ? v : null)
const defined = <T extends object>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
/** Numeric fields of a protobuf message, minus unset ones. */
const numbers = (msg: object) =>
  Object.fromEntries(Object.entries(msg).filter(([, v]) => typeof v === 'number')) as Record<string, number>

type NodeUpdate = Partial<typeof schema.nodes.$inferInsert>

export interface IngestOptions {
  keys: Buffer[]
  /** Node numbers to keep; empty = keep everything. */
  allow: Set<number>
}

interface Context {
  now: Date
  /** Identifies the packet across gateways' copies: "from:id". */
  packetKey: string
  hops: number | null
  snr: number | null
  rssi: number | null
  gateway: number | undefined
  monitored: (num: number) => boolean
  /** Sent to SSE clients once the message's writes are committed. */
  events: MeshEvent[]
}

function userFields(payload: Uint8Array): NodeUpdate {
  const user = fromBinary(Mesh.UserSchema, payload)
  return {
    longName: user.longName,
    shortName: user.shortName,
    hwModel: Mesh.HardwareModel[user.hwModel] ?? String(user.hwModel),
    role: Config.Config_DeviceConfig_Role[user.role] ?? String(user.role)
  }
}

function positionFields(payload: Uint8Array) {
  const pos = fromBinary(Mesh.PositionSchema, payload)
  if (!pos.latitudeI || !pos.longitudeI) return
  return {
    lat: pos.latitudeI / 1e7,
    lon: pos.longitudeI / 1e7,
    alt: pos.altitude ?? null,
    sats: pos.satsInView || null
  }
}

/** True if this packet was already stored (uplinked by another gateway) within the dedupe window. */
async function seen(table: typeof schema.packets | typeof schema.messages | typeof schema.traceroutes, packet: Mesh.MeshPacket, now: Date) {
  const t = table as typeof schema.packets
  const [row] = await useDb().select({ id: t.id }).from(t).where(and(
    eq(t.from, packet.from),
    eq(t.packetId, packet.id),
    gte(t.ts, new Date(now.getTime() - DEDUPE_WINDOW_MS))
  )).limit(1)
  return !!row
}

/** Decodes one MQTT message and stores whatever it carries. */
export async function ingest(payload: Buffer, opts: IngestOptions) {
  const envelope = fromBinary(Mqtt.ServiceEnvelopeSchema, payload)
  const packet = envelope.packet
  if (!packet) return

  const variant = packet.payloadVariant
  const data = variant.case === 'decoded'
    ? variant.value
    : variant.case === 'encrypted' ? decrypt(packet, variant.value, opts.keys) : undefined
  if (!data) return

  const ctx: Context = {
    now: new Date(),
    packetKey: `${packet.from}:${packet.id}`,
    hops: packet.hopStart && packet.hopStart >= packet.hopLimit ? packet.hopStart - packet.hopLimit : null,
    rssi: nullIfZero(packet.rxRssi),
    snr: packet.rxRssi ? packet.rxSnr : null,
    gateway: envelope.gatewayId ? parseNodeId(envelope.gatewayId) : undefined,
    monitored: num => !opts.allow.size || opts.allow.has(num),
    events: []
  }

  // All of one message's writes or none, and one commit instead of one per write
  await transaction(() => store(envelope, packet, data, ctx))
  for (const e of ctx.events) meshBus.emit('event', e)
}

async function store(envelope: Mqtt.ServiceEnvelope, packet: Mesh.MeshPacket, data: Mesh.Data, ctx: Context) {
  const db = useDb()
  const { now, hops } = ctx

  // Map reports come straight from an MQTT-connected node, not over RF.
  if (data.portnum === PortNum.MAP_REPORT_APP) return handleMapReport(packet.from, data.payload, ctx)

  // Before dedup: the same packet heard by another gateway is another RF link (upsertLinks skips repeats of the same one).
  await recordLinks(envelope, packet, data, ctx)

  // Messages and traceroutes are kept when any of our nodes sent, received or uplinked them.
  const relevant = ctx.monitored(packet.from) || ctx.monitored(packet.to)
    || (ctx.gateway !== undefined && ctx.monitored(ctx.gateway))
  if (relevant && data.portnum === PortNum.TEXT_MESSAGE_APP) await storeMessage(envelope, packet, data, ctx)
  if (relevant && data.portnum === PortNum.TRACEROUTE_APP && data.requestId) await storeTraceroute(envelope, packet, data, ctx)

  if (!ctx.monitored(packet.from)) return updatePeer(packet.from, data, now)

  const packetRow = {
    packetId: packet.id,
    from: packet.from,
    to: packet.to,
    portnum: PortNum[data.portnum] ?? String(data.portnum),
    channel: envelope.channelId || null,
    gateway: envelope.gatewayId || null,
    rssi: ctx.rssi,
    snr: ctx.snr,
    hops,
    ts: now
  }
  if (await seen(schema.packets, packet, now)) return
  const [stored] = await db.insert(schema.packets).values(packetRow).returning()

  const update: NodeUpdate = {
    lastHeard: now,
    lastGateway: packetRow.gateway,
    snr: packetRow.snr,
    rssi: packetRow.rssi,
    hops
  }

  switch (data.portnum) {
    case PortNum.NODEINFO_APP:
      Object.assign(update, userFields(data.payload))
      break
    case PortNum.POSITION_APP: {
      const pos = positionFields(data.payload)
      if (!pos) break
      await db.insert(schema.positions).values({ nodeNum: packet.from, ts: now, ...pos })
      Object.assign(update, { lat: pos.lat, lon: pos.lon, alt: pos.alt, positionAt: now })
      break
    }
    case PortNum.TELEMETRY_APP: {
      const t = fromBinary(Telemetry.TelemetrySchema, data.payload).variant
      if (t.case === 'deviceMetrics') {
        const m = t.value
        const row = defined({
          battery: m.batteryLevel,
          voltage: m.voltage,
          chUtil: m.channelUtilization,
          airUtilTx: m.airUtilTx,
          uptime: m.uptimeSeconds
        })
        await db.insert(schema.deviceMetrics).values({ nodeNum: packet.from, ts: now, ...row })
        Object.assign(update, row, { deviceAt: now })
      } else if (t.case === 'environmentMetrics') {
        const m = t.value
        const row = defined({
          temperature: m.temperature,
          humidity: m.relativeHumidity,
          pressure: m.barometricPressure,
          gasResistance: m.gasResistance,
          iaq: m.iaq,
          lux: m.lux
        })
        await db.insert(schema.envMetrics).values({ nodeNum: packet.from, ts: now, ...row })
        Object.assign(update, row, { envAt: now })
      } else if (t.case === 'localStats' || t.case === 'powerMetrics' || t.case === 'airQualityMetrics') {
        const kind = ({ localStats: 'local', powerMetrics: 'power', airQualityMetrics: 'air' } as const)[t.case]
        const metrics = numbers(t.value)
        if (!Object.keys(metrics).length) break
        await db.insert(schema.extraMetrics).values({ nodeNum: packet.from, ts: now, kind, data: metrics })
        const snapshot = { ...metrics, ts: now.toISOString() }
        const column = ({ local: 'localStats', power: 'powerMetrics', air: 'airQuality' } as const)[kind]
        update[column] = snapshot
      }
      break
    }
  }

  const [node] = await db.insert(schema.nodes)
    .values({ num: packet.from, id: numToId(packet.from), monitored: true, ...update })
    .onConflictDoUpdate({ target: schema.nodes.num, set: update })
    .returning()

  meshStatus.lastNodePacketAt = now
  if (stored) ctx.events.push({ type: 'packet', data: stored })
  if (node) ctx.events.push({ type: 'node', data: node })
}

/** Firmware, region, preset and position, published by nodes with MQTT map reporting on. */
async function handleMapReport(num: number, payload: Uint8Array, ctx: Context) {
  const r = fromBinary(Mqtt.MapReportSchema, payload)
  const update: NodeUpdate = defined({
    longName: r.longName || undefined,
    shortName: r.shortName || undefined,
    hwModel: Mesh.HardwareModel[r.hwModel] ?? String(r.hwModel),
    role: Config.Config_DeviceConfig_Role[r.role] ?? String(r.role),
    firmwareVersion: r.firmwareVersion || null,
    region: Config.Config_LoRaConfig_RegionCode[r.region] ?? String(r.region),
    modemPreset: Config.Config_LoRaConfig_ModemPreset[r.modemPreset] ?? String(r.modemPreset),
    hasDefaultChannel: r.hasDefaultChannel,
    onlineLocalNodes: r.numOnlineLocalNodes,
    mapReportAt: ctx.now
  })
  if (r.latitudeI && r.longitudeI) {
    Object.assign(update, { lat: r.latitudeI / 1e7, lon: r.longitudeI / 1e7, alt: r.altitude || null, positionAt: ctx.now })
  }
  const [node] = await useDb().insert(schema.nodes)
    .values({ num, id: numToId(num), monitored: ctx.monitored(num), ...update })
    .onConflictDoUpdate({ target: schema.nodes.num, set: update })
    .returning()
  if (node?.monitored) ctx.events.push({ type: 'node', data: node })
}

async function storeMessage(envelope: Mqtt.ServiceEnvelope, packet: Mesh.MeshPacket, data: Mesh.Data, ctx: Context) {
  if (await seen(schema.messages, packet, ctx.now)) return
  const [res] = await useDb().insert(schema.messages).values({
    packetId: packet.id,
    from: packet.from,
    to: packet.to,
    channel: envelope.channelId || null,
    text: new TextDecoder().decode(data.payload),
    replyId: data.replyId || null,
    emoji: !!data.emoji,
    gateway: envelope.gatewayId || null,
    rssi: ctx.rssi,
    snr: ctx.snr,
    hops: ctx.hops,
    ts: ctx.now
  }).returning({ id: schema.messages.id })
  const [message] = await queryMessages(eq(schema.messages.id, res!.id), 1)
  if (message) ctx.events.push({ type: 'message', data: message })
}

async function storeTraceroute(envelope: Mqtt.ServiceEnvelope, packet: Mesh.MeshPacket, data: Mesh.Data, ctx: Context) {
  if (await seen(schema.traceroutes, packet, ctx.now)) return
  const rd = fromBinary(Mesh.RouteDiscoverySchema, data.payload)
  const snr = (values: number[]) => values.map(v => (v === SNR_UNKNOWN ? null : v / 4))
  const row = {
    packetId: packet.id,
    from: packet.from,
    to: packet.to,
    route: rd.route,
    snrTowards: snr(rd.snrTowards),
    routeBack: rd.routeBack,
    snrBack: snr(rd.snrBack),
    gateway: envelope.gatewayId || null,
    ts: ctx.now
  }
  const [res] = await useDb().insert(schema.traceroutes).values(row).returning({ id: schema.traceroutes.id })

  // Every consecutive pair on the path is a direct RF hop; snr[i] is measured by the receiver of hop i.
  // The request went requester (packet.to) → traced node (packet.from); the reply came back.
  const forward = [packet.to, ...rd.route, packet.from]
  const back = [packet.from, ...rd.routeBack, packet.to]
  const found: LinkRow[] = []
  for (const [path, snrs] of [[forward, row.snrTowards], [back, row.snrBack]] as const) {
    if (snrs.length !== path.length - 1) continue // incomplete path
    for (let i = 0; i < path.length - 1; i++) {
      if (path[i] === BROADCAST || path[i + 1] === BROADCAST) continue
      found.push({ fromNum: path[i]!, toNum: path[i + 1]!, source: 'traceroute', snr: snrs[i] ?? null, rssi: null })
    }
  }
  await upsertLinks(found, ctx)

  const [trace] = await queryTraceroutes(eq(schema.traceroutes.id, res!.id), 1)
  if (trace) ctx.events.push({ type: 'traceroute', data: trace })
}

/** Nodes outside NUXT_NODE_IDS: keep only what's needed to place them on the map / measure links. */
async function updatePeer(num: number, data: Mesh.Data, now: Date) {
  let update: NodeUpdate | undefined
  if (data.portnum === PortNum.NODEINFO_APP) update = userFields(data.payload)
  if (data.portnum === PortNum.POSITION_APP) {
    const pos = positionFields(data.payload)
    if (pos) update = { lat: pos.lat, lon: pos.lon, alt: pos.alt, positionAt: now }
  }
  if (!update) return
  await useDb().insert(schema.nodes)
    .values({ num, id: numToId(num), ...update })
    .onConflictDoUpdate({ target: schema.nodes.num, set: update })
}

type LinkRow = Pick<typeof schema.links.$inferInsert, 'fromNum' | 'toNum' | 'source' | 'snr' | 'rssi'>

/** relayNode only carries the last byte of the relayer's ID; accept it if exactly one known node matches. */
async function resolveRelayer(lastByte: number, exclude: number[]) {
  const { nodes } = schema
  const rows = await useDb().select({ num: nodes.num }).from(nodes)
    .where(sql`(${nodes.num} & 255) = ${lastByte & 0xff}`)
  const candidates = rows.map(r => r.num).filter(n => !exclude.includes(n))
  return candidates.length === 1 ? candidates[0] : undefined
}

/** Finds direct (0-hop) RF links this packet proves, and upserts them. */
async function recordLinks(envelope: Mqtt.ServiceEnvelope, packet: Mesh.MeshPacket, data: Mesh.Data, ctx: Context) {
  const found: LinkRow[] = []
  const { gateway } = ctx

  if (gateway !== undefined && gateway !== packet.from && !packet.viaMqtt && ctx.hops !== null) {
    if (ctx.hops === 0) {
      found.push({ fromNum: packet.from, toNum: gateway, source: 'direct', snr: ctx.snr, rssi: ctx.rssi })
    } else if (ctx.hops === 1 && packet.relayNode) {
      const relayer = await resolveRelayer(packet.relayNode, [packet.from, gateway])
      if (relayer !== undefined) {
        found.push(
          { fromNum: packet.from, toNum: relayer, source: 'relay', snr: null, rssi: null },
          { fromNum: relayer, toNum: gateway, source: 'direct', snr: ctx.snr, rssi: ctx.rssi }
        )
      }
    }
  }

  if (data.portnum === PortNum.NEIGHBORINFO_APP) {
    for (const n of fromBinary(Mesh.NeighborInfoSchema, data.payload).neighbors) {
      if (n.nodeId && n.nodeId !== packet.from) {
        found.push({ fromNum: n.nodeId, toNum: packet.from, source: 'neighbor', snr: n.snr, rssi: null })
      }
    }
  }

  await upsertLinks(found, ctx)
}

/** Weakest to strongest evidence that a link is direct; a link keeps its strongest source. */
const SOURCE_ORDER = ['relay', 'traceroute', 'neighbor', 'direct'] as const
const sourceRank = (source: SQL) =>
  sql`CASE ${source} ${sql.join(SOURCE_ORDER.map((s, i) => sql`WHEN ${s} THEN ${i}`), sql` `)} END`

/**
 * "packet>from>to" → when it was counted. Links are recorded before dedup, but each packet should count
 * once per link: every gateway that hears a NeighborInfo, or a packet via the same relayer, reports the same hop.
 */
const countedLinks = new Map<string, number>()

/** False if this packet already counted for this link (another gateway's copy). */
export function firstCount(key: string, now: number) {
  // Entries are in time order (one message at a time), so expired ones are at the front
  for (const [k, at] of countedLinks) {
    if (now - at < DEDUPE_WINDOW_MS) break
    countedLinks.delete(k)
  }
  if (countedLinks.has(key)) return false
  countedLinks.set(key, now)
  return true
}

async function upsertLinks(found: LinkRow[], ctx: Context) {
  const { links } = schema
  const upserted: SQL[] = []
  for (const link of found) {
    if (!ctx.monitored(link.fromNum) && !ctx.monitored(link.toNum)) continue
    if (!firstCount(`${ctx.packetKey}>${link.fromNum}>${link.toNum}`, ctx.now.getTime())) continue
    const set: Partial<typeof links.$inferInsert> = {
      lastSeen: ctx.now,
      count: sql`${links.count} + 1` as any,
      source: sql`CASE WHEN ${sourceRank(sql`${links.source}`)} > ${SOURCE_ORDER.indexOf(link.source)} THEN ${links.source} ELSE ${link.source} END` as any
    }
    if (link.snr != null) set.snr = link.snr
    if (link.rssi != null) set.rssi = link.rssi
    await useDb().insert(links)
      .values({ ...link, firstSeen: ctx.now, lastSeen: ctx.now })
      .onConflictDoUpdate({ target: [links.fromNum, links.toNum], set })
    upserted.push(and(eq(links.fromNum, link.fromNum), eq(links.toNum, link.toNum))!)
  }
  // One read for all of them, with names and distances, for the SSE clients
  if (!upserted.length) return
  for (const enriched of await queryLinks(or(...upserted))) ctx.events.push({ type: 'link', data: enriched })
}
