import { sqliteTable, integer, text, real, index, primaryKey } from 'drizzle-orm/sqlite-core'

const ts = (name = 'ts') => integer(name, { mode: 'timestamp_ms' })
const bool = (name: string) => integer(name, { mode: 'boolean' })
const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>()
const id = () => integer('id').primaryKey()

/**
 * One row per node, holding the latest known values for fast dashboard loads.
 * Unmonitored nodes (not in NUXT_NODE_IDS) only get name + position, to measure RF link distances.
 */
export const nodes = sqliteTable('nodes', {
  num: integer('num').primaryKey(),
  id: text('id').notNull(),
  monitored: bool('monitored').notNull().default(false),
  longName: text('long_name'),
  shortName: text('short_name'),
  hwModel: text('hw_model'),
  role: text('role'),
  lastHeard: ts('last_heard'),
  lastGateway: text('last_gateway'),
  snr: real('snr'),
  rssi: integer('rssi'),
  hops: integer('hops'),
  lat: real('lat'),
  lon: real('lon'),
  alt: integer('alt'),
  positionAt: ts('position_at'),
  battery: integer('battery'),
  voltage: real('voltage'),
  chUtil: real('ch_util'),
  airUtilTx: real('air_util_tx'),
  uptime: integer('uptime'),
  deviceAt: ts('device_at'),
  temperature: real('temperature'),
  humidity: real('humidity'),
  pressure: real('pressure'),
  gasResistance: real('gas_resistance'),
  iaq: integer('iaq'),
  lux: real('lux'),
  envAt: ts('env_at'),
  // From map reports (sent by MQTT-connected nodes)
  firmwareVersion: text('firmware_version'),
  region: text('region'),
  modemPreset: text('modem_preset'),
  hasDefaultChannel: bool('has_default_channel'),
  onlineLocalNodes: integer('online_local_nodes'),
  mapReportAt: ts('map_report_at'),
  // Latest snapshot of the less common telemetry kinds (see extraMetrics), each with its own ts
  localStats: json<ExtraSnapshot>('local_stats'),
  powerMetrics: json<ExtraSnapshot>('power_metrics'),
  airQuality: json<ExtraSnapshot>('air_quality')
})

/** Telemetry fields plus `ts` (ISO time of the reading). */
export type ExtraSnapshot = Record<string, number | string>

export const positions = sqliteTable('positions', {
  id: id(),
  nodeNum: integer('node_num').notNull(),
  ts: ts().notNull(),
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  alt: integer('alt'),
  sats: integer('sats')
}, t => [index('positions_node_ts').on(t.nodeNum, t.ts)])

export const deviceMetrics = sqliteTable('device_metrics', {
  id: id(),
  nodeNum: integer('node_num').notNull(),
  ts: ts().notNull(),
  battery: integer('battery'),
  voltage: real('voltage'),
  chUtil: real('ch_util'),
  airUtilTx: real('air_util_tx'),
  uptime: integer('uptime')
}, t => [index('device_node_ts').on(t.nodeNum, t.ts)])

export const envMetrics = sqliteTable('env_metrics', {
  id: id(),
  nodeNum: integer('node_num').notNull(),
  ts: ts().notNull(),
  temperature: real('temperature'),
  humidity: real('humidity'),
  pressure: real('pressure'),
  gasResistance: real('gas_resistance'),
  iaq: integer('iaq'),
  lux: real('lux')
}, t => [index('env_node_ts').on(t.nodeNum, t.ts)])

/** Local stats, power (INA) and air quality telemetry, stored as JSON since the field sets are wide and sparse. */
export const extraMetrics = sqliteTable('extra_metrics', {
  id: id(),
  nodeNum: integer('node_num').notNull(),
  ts: ts().notNull(),
  kind: text('kind', { enum: ['local', 'power', 'air'] }).notNull(),
  data: json<Record<string, number>>('data').notNull()
}, t => [index('extra_node_kind_ts').on(t.nodeNum, t.kind, t.ts)])

export const messages = sqliteTable('messages', {
  id: id(),
  packetId: integer('packet_id').notNull(),
  from: integer('from').notNull(),
  to: integer('to').notNull(),
  channel: text('channel'),
  text: text('text').notNull(),
  replyId: integer('reply_id'),
  emoji: bool('emoji').notNull().default(false),
  gateway: text('gateway'),
  rssi: integer('rssi'),
  snr: real('snr'),
  hops: integer('hops'),
  ts: ts().notNull()
}, t => [index('messages_from_id').on(t.from, t.packetId), index('messages_ts').on(t.ts)])

/** Traceroute replies: the full path out and back, with SNR (dB) per hop. */
export const traceroutes = sqliteTable('traceroutes', {
  id: id(),
  packetId: integer('packet_id').notNull(),
  from: integer('from').notNull(), // the traced node (sends the reply)
  to: integer('to').notNull(), // who asked
  route: json<number[]>('route').notNull(),
  snrTowards: json<(number | null)[]>('snr_towards').notNull(),
  routeBack: json<number[]>('route_back').notNull(),
  snrBack: json<(number | null)[]>('snr_back').notNull(),
  gateway: text('gateway'),
  ts: ts().notNull()
}, t => [index('traceroutes_from_id').on(t.from, t.packetId), index('traceroutes_ts').on(t.ts)])

/** Raw packet log. Duplicates from several gateways are filtered in ingest() using packets_from_id. */
export const packets = sqliteTable('packets', {
  id: id(),
  packetId: integer('packet_id').notNull(),
  from: integer('from').notNull(),
  to: integer('to').notNull(),
  portnum: text('portnum').notNull(),
  channel: text('channel'),
  gateway: text('gateway'),
  rssi: integer('rssi'),
  snr: real('snr'),
  hops: integer('hops'),
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
export const links = sqliteTable('links', {
  fromNum: integer('from_num').notNull(),
  toNum: integer('to_num').notNull(),
  source: text('source', { enum: ['direct', 'relay', 'neighbor', 'traceroute'] }).notNull(),
  snr: real('snr'),
  rssi: integer('rssi'),
  count: integer('count').notNull().default(1),
  firstSeen: ts('first_seen').notNull(),
  lastSeen: ts('last_seen').notNull()
}, t => [
  primaryKey({ columns: [t.fromNum, t.toNum] }),
  index('links_to').on(t.toNum)
])
