import { createDecipheriv } from 'node:crypto'
import { fromBinary } from '@bufbuild/protobuf'
import { Config, Mesh, Mqtt, Portnums, Telemetry } from '@meshtastic/protobufs'
import { eq } from 'drizzle-orm'

const { PortNum } = Portnums
const DEFAULT_KEY = Buffer.from('1PG7OiApB1nwvP+rz05pAQ==', 'base64')

export const numToId = (num: number) => '!' + num.toString(16).padStart(8, '0')

/** Accepts "!a0cc2ad0", "a0cc2ad0" or a decimal node number. */
export function parseNodeId(value: string): number | undefined {
  const v = value.trim().replace(/^!/, '')
  if (!v) return
  const num = /^\d+$/.test(v) && v.length > 8 ? Number(v) : Number.parseInt(v, 16)
  return Number.isFinite(num) ? num : undefined
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

const nullIfZero = (v: number | undefined) => (v ? v : null)
const defined = <T extends object>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>

type NodeUpdate = Partial<typeof schema.nodes.$inferInsert>

export interface IngestOptions {
  keys: Buffer[]
  /** Node numbers to keep; empty = keep everything. */
  allow: Set<number>
}

/** Decodes one MQTT message and stores whatever it carries. */
export async function ingest(payload: Buffer, opts: IngestOptions) {
  const envelope = fromBinary(Mqtt.ServiceEnvelopeSchema, payload)
  const packet = envelope.packet
  if (!packet || (opts.allow.size && !opts.allow.has(packet.from))) return

  const variant = packet.payloadVariant
  const data = variant.case === 'decoded'
    ? variant.value
    : variant.case === 'encrypted' ? decrypt(packet, variant.value, opts.keys) : undefined
  if (!data) return

  const db = useDb()
  const now = new Date()
  const hops = packet.hopStart ? packet.hopStart - packet.hopLimit : null
  const packetRow = {
    packetId: packet.id,
    from: packet.from,
    to: packet.to,
    portnum: PortNum[data.portnum] ?? String(data.portnum),
    channel: envelope.channelId || null,
    gateway: envelope.gatewayId || null,
    rssi: nullIfZero(packet.rxRssi),
    snr: packet.rxRssi ? packet.rxSnr : null,
    hops,
    ts: now
  }
  const [res] = await db.insert(schema.packets).ignore().values(packetRow)
  if (res.affectedRows === 0) return // duplicate seen via another gateway

  const update: NodeUpdate = {
    lastHeard: now,
    lastGateway: packetRow.gateway,
    snr: packetRow.snr,
    rssi: packetRow.rssi,
    hops
  }

  switch (data.portnum) {
    case PortNum.NODEINFO_APP: {
      const user = fromBinary(Mesh.UserSchema, data.payload)
      Object.assign(update, {
        longName: user.longName,
        shortName: user.shortName,
        hwModel: Mesh.HardwareModel[user.hwModel] ?? String(user.hwModel),
        role: Config.Config_DeviceConfig_Role[user.role] ?? String(user.role)
      })
      break
    }
    case PortNum.POSITION_APP: {
      const pos = fromBinary(Mesh.PositionSchema, data.payload)
      if (!pos.latitudeI || !pos.longitudeI) break
      const row = { lat: pos.latitudeI / 1e7, lon: pos.longitudeI / 1e7, alt: pos.altitude ?? null }
      await db.insert(schema.positions).values({ nodeNum: packet.from, ts: now, sats: pos.satsInView || null, ...row })
      Object.assign(update, row, { positionAt: now })
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
    .values({ num: packet.from, id: numToId(packet.from), ...update })
    .onDuplicateKeyUpdate({ set: update })

  const [node] = await db.select().from(schema.nodes).where(eq(schema.nodes.num, packet.from))
  const [stored] = await db.select().from(schema.packets).where(eq(schema.packets.id, res.insertId))
  if (stored) meshBus.emit('event', { type: 'packet', packet: stored })
  if (node) meshBus.emit('event', { type: 'node', node })
}
