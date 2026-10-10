import { createDecipheriv } from 'node:crypto'
import { fromBinary } from '@bufbuild/protobuf'
import { Config, Mesh, Mqtt, Portnums, Telemetry } from '@meshtastic/protobufs'
import { and, eq, gte, sql } from 'drizzle-orm'

const { PortNum } = Portnums
const DEFAULT_KEY = Buffer.from('1PG7OiApB1nwvP+rz05pAQ==', 'base64')

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

type NodeUpdate = Partial<typeof schema.nodes.$inferInsert>

export interface IngestOptions {
  keys: Buffer[]
  /** Node numbers to keep; empty = keep everything. */
  allow: Set<number>
}

interface Context {
  now: Date
  hops: number | null
  snr: number | null
  rssi: number | null
  monitored: (num: number) => boolean
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

  const db = useDb()
  const ctx: Context = {
    now: new Date(),
    hops: packet.hopStart && packet.hopStart >= packet.hopLimit ? packet.hopStart - packet.hopLimit : null,
    rssi: nullIfZero(packet.rxRssi),
    snr: packet.rxRssi ? packet.rxSnr : null,
    monitored: num => !opts.allow.size || opts.allow.has(num)
  }
  const { now, hops } = ctx

  // Before dedup: the same packet heard by another gateway is another RF link.
  await recordLinks(envelope, packet, data, ctx)

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
  const { packets } = schema
  const [duplicate] = await db.select({ id: packets.id }).from(packets).where(and(
    eq(packets.from, packet.from),
    eq(packets.packetId, packet.id),
    gte(packets.ts, new Date(now.getTime() - DEDUPE_WINDOW_MS))
  )).limit(1)
  if (duplicate) return // same packet already uplinked by another gateway
  const [res] = await db.insert(packets).values(packetRow)

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
      }
      break
    }
  }

  await db.insert(schema.nodes)
    .values({ num: packet.from, id: numToId(packet.from), monitored: true, ...update })
    .onDuplicateKeyUpdate({ set: update })

  const [node] = await db.select().from(schema.nodes).where(eq(schema.nodes.num, packet.from))
  const [stored] = await db.select().from(schema.packets).where(eq(schema.packets.id, res.insertId))
  if (stored) meshBus.emit('event', { type: 'packet', packet: stored })
  if (node) meshBus.emit('event', { type: 'node', node })
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
    .onDuplicateKeyUpdate({ set: update })
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
  const gateway = envelope.gatewayId ? parseNodeId(envelope.gatewayId) : undefined

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

  const { links } = schema
  for (const link of found) {
    if (!ctx.monitored(link.fromNum) && !ctx.monitored(link.toNum)) continue
    const set: Partial<typeof links.$inferInsert> = { lastSeen: ctx.now, count: sql`${links.count} + 1` as any }
    if (link.snr != null) set.snr = link.snr
    if (link.rssi != null) set.rssi = link.rssi
    if (link.source !== 'relay') set.source = link.source // relay is the weakest evidence
    await useDb().insert(links)
      .values({ ...link, firstSeen: ctx.now, lastSeen: ctx.now })
      .onDuplicateKeyUpdate({ set })
    const [enriched] = await queryLinks(and(eq(links.fromNum, link.fromNum), eq(links.toNum, link.toNum)))
    if (enriched) meshBus.emit('event', { type: 'link', link: enriched })
  }
}
