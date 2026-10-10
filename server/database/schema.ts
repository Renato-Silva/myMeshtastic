import { mysqlTable, mysqlEnum, int, varchar, double, float, datetime, serial, boolean, json, text, index, primaryKey } from 'drizzle-orm/mysql-core'

const ts = (name = 'ts') => datetime(name, { mode: 'date' })

/**
 * One row per node, holding the latest known values for fast dashboard loads.
 * Unmonitored nodes (not in NUXT_NODE_IDS) only get name + position, to measure RF link distances.
 */
export const nodes = mysqlTable('nodes', {
  num: int('num', { unsigned: true }).primaryKey(),
  id: varchar('id', { length: 9 }).notNull(),
  monitored: boolean('monitored').notNull().default(false),
  longName: varchar('long_name', { length: 64 }),
  shortName: varchar('short_name', { length: 8 }),
  hwModel: varchar('hw_model', { length: 48 }),
  role: varchar('role', { length: 32 }),
  lastHeard: ts('last_heard'),
  lastGateway: varchar('last_gateway', { length: 9 }),
  snr: float('snr'),
  rssi: int('rssi'),
  hops: int('hops'),
  lat: double('lat'),
  lon: double('lon'),
  alt: int('alt'),
  positionAt: ts('position_at'),
  battery: int('battery'),
  voltage: float('voltage'),
  chUtil: float('ch_util'),
  airUtilTx: float('air_util_tx'),
  uptime: int('uptime', { unsigned: true }),
  deviceAt: ts('device_at'),
  temperature: float('temperature'),
  humidity: float('humidity'),
  pressure: float('pressure'),
  gasResistance: float('gas_resistance'),
  iaq: int('iaq'),
  lux: float('lux'),
  envAt: ts('env_at'),
  // From map reports (sent by MQTT-connected nodes)
  firmwareVersion: varchar('firmware_version', { length: 32 }),
  region: varchar('region', { length: 16 }),
  modemPreset: varchar('modem_preset', { length: 24 }),
  hasDefaultChannel: boolean('has_default_channel'),
  onlineLocalNodes: int('online_local_nodes'),
  mapReportAt: ts('map_report_at'),
  // Latest snapshot of the less common telemetry kinds (see extraMetrics), each with its own ts
  localStats: json('local_stats').$type<ExtraSnapshot>(),
  powerMetrics: json('power_metrics').$type<ExtraSnapshot>(),
  airQuality: json('air_quality').$type<ExtraSnapshot>()
})

/** Telemetry fields plus `ts` (ISO time of the reading). */
export type ExtraSnapshot = Record<string, number | string>

export const positions = mysqlTable('positions', {
  id: serial('id').primaryKey(),
  nodeNum: int('node_num', { unsigned: true }).notNull(),
  ts: ts().notNull(),
  lat: double('lat').notNull(),
  lon: double('lon').notNull(),
  alt: int('alt'),
  sats: int('sats')
}, t => [index('positions_node_ts').on(t.nodeNum, t.ts)])

export const deviceMetrics = mysqlTable('device_metrics', {
  id: serial('id').primaryKey(),
  nodeNum: int('node_num', { unsigned: true }).notNull(),
  ts: ts().notNull(),
  battery: int('battery'),
  voltage: float('voltage'),
  chUtil: float('ch_util'),
  airUtilTx: float('air_util_tx'),
  uptime: int('uptime', { unsigned: true })
}, t => [index('device_node_ts').on(t.nodeNum, t.ts)])

export const envMetrics = mysqlTable('env_metrics', {
  id: serial('id').primaryKey(),
  nodeNum: int('node_num', { unsigned: true }).notNull(),
  ts: ts().notNull(),
  temperature: float('temperature'),
  humidity: float('humidity'),
  pressure: float('pressure'),
  gasResistance: float('gas_resistance'),
  iaq: int('iaq'),
  lux: float('lux')
}, t => [index('env_node_ts').on(t.nodeNum, t.ts)])

/** Local stats, power (INA) and air quality telemetry, stored as JSON since the field sets are wide and sparse. */
export const extraMetrics = mysqlTable('extra_metrics', {
  id: serial('id').primaryKey(),
  nodeNum: int('node_num', { unsigned: true }).notNull(),
  ts: ts().notNull(),
  kind: mysqlEnum('kind', ['local', 'power', 'air']).notNull(),
  data: json('data').$type<Record<string, number>>().notNull()
}, t => [index('extra_node_kind_ts').on(t.nodeNum, t.kind, t.ts)])

export const messages = mysqlTable('messages', {
  id: serial('id').primaryKey(),
  packetId: int('packet_id', { unsigned: true }).notNull(),
  from: int('from', { unsigned: true }).notNull(),
  to: int('to', { unsigned: true }).notNull(),
  channel: varchar('channel', { length: 32 }),
  text: text('text').notNull(),
  replyId: int('reply_id', { unsigned: true }),
  emoji: boolean('emoji').notNull().default(false),
  gateway: varchar('gateway', { length: 9 }),
  rssi: int('rssi'),
  snr: float('snr'),
  hops: int('hops'),
  ts: ts().notNull()
}, t => [index('messages_from_id').on(t.from, t.packetId), index('messages_ts').on(t.ts)])

/** Traceroute replies: the full path out and back, with SNR (dB) per hop. */
export const traceroutes = mysqlTable('traceroutes', {
  id: serial('id').primaryKey(),
  packetId: int('packet_id', { unsigned: true }).notNull(),
  from: int('from', { unsigned: true }).notNull(), // the traced node (sends the reply)
  to: int('to', { unsigned: true }).notNull(), // who asked
  route: json('route').$type<number[]>().notNull(),
  snrTowards: json('snr_towards').$type<(number | null)[]>().notNull(),
  routeBack: json('route_back').$type<number[]>().notNull(),
  snrBack: json('snr_back').$type<(number | null)[]>().notNull(),
  gateway: varchar('gateway', { length: 9 }),
  ts: ts().notNull()
}, t => [index('traceroutes_from_id').on(t.from, t.packetId), index('traceroutes_ts').on(t.ts)])

/** Raw packet log. Duplicates from several gateways are filtered in ingest() using packets_from_id. */
export const packets = mysqlTable('packets', {
  id: serial('id').primaryKey(),
  packetId: int('packet_id', { unsigned: true }).notNull(),
  from: int('from', { unsigned: true }).notNull(),
  to: int('to', { unsigned: true }).notNull(),
  portnum: varchar('portnum', { length: 32 }).notNull(),
  channel: varchar('channel', { length: 32 }),
  gateway: varchar('gateway', { length: 9 }),
  rssi: int('rssi'),
  snr: float('snr'),
  hops: int('hops'),
  ts: ts().notNull()
}, t => [
  index('packets_from_id').on(t.from, t.packetId),
  index('packets_ts').on(t.ts)
])

/**
 * Direct (0-hop) RF links, one row per transmitter → receiver pair.
 * direct   = a gateway heard the sender with no hops used
 * relay    = inferred from relayNode on a 1-hop packet
 * neighbor = reported by the receiver's NeighborInfo module
 * traceroute = consecutive hops of a traceroute reply
 */
export const links = mysqlTable('links', {
  fromNum: int('from_num', { unsigned: true }).notNull(),
  toNum: int('to_num', { unsigned: true }).notNull(),
  source: mysqlEnum('source', ['direct', 'relay', 'neighbor', 'traceroute']).notNull(),
  snr: float('snr'),
  rssi: int('rssi'),
  count: int('count', { unsigned: true }).notNull().default(1),
  firstSeen: ts('first_seen').notNull(),
  lastSeen: ts('last_seen').notNull()
}, t => [
  primaryKey({ columns: [t.fromNum, t.toNum] }),
  index('links_to').on(t.toNum)
])
