import { mysqlTable, mysqlEnum, int, varchar, double, float, datetime, serial, boolean, index, uniqueIndex, primaryKey } from 'drizzle-orm/mysql-core'

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
  envAt: ts('env_at')
})

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

/** Raw packet log. The unique key also deduplicates packets uplinked by several gateways. */
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
  uniqueIndex('packets_from_id').on(t.from, t.packetId),
  index('packets_ts').on(t.ts)
])

/**
 * Direct (0-hop) RF links, one row per transmitter → receiver pair.
 * direct   = a gateway heard the sender with no hops used
 * relay    = inferred from relayNode on a 1-hop packet
 * neighbor = reported by the receiver's NeighborInfo module
 */
export const links = mysqlTable('links', {
  fromNum: int('from_num', { unsigned: true }).notNull(),
  toNum: int('to_num', { unsigned: true }).notNull(),
  source: mysqlEnum('source', ['direct', 'relay', 'neighbor']).notNull(),
  snr: float('snr'),
  rssi: int('rssi'),
  count: int('count', { unsigned: true }).notNull().default(1),
  firstSeen: ts('first_seen').notNull(),
  lastSeen: ts('last_seen').notNull()
}, t => [
  primaryKey({ columns: [t.fromNum, t.toNum] }),
  index('links_to').on(t.toNum)
])
