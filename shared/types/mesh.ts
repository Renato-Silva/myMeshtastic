import type * as s from '../../server/database/schema'

/** Row type as it arrives over JSON (dates become ISO strings). */
type Json<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] }

export type MeshNode = Json<typeof s.nodes.$inferSelect>
export type MeshPacket = Json<typeof s.packets.$inferSelect>
export type MeshPosition = Json<typeof s.positions.$inferSelect>

export interface LinkPeer {
  num: number
  id: string
  shortName: string | null
  longName: string | null
  lat: number | null
  lon: number | null
}

/** A direct RF link with both ends resolved and the distance between them. */
export type MeshLink = Json<typeof s.links.$inferSelect> & {
  from: LinkPeer
  to: LinkPeer
  distanceKm: number | null
}

export interface NodeName {
  id: string
  shortName: string | null
  longName: string | null
}

export type MeshMessage = Json<typeof s.messages.$inferSelect> & { fromName: NodeName, toName: NodeName | null }

export type MeshTraceroute = Json<typeof s.traceroutes.$inferSelect> & { names: Record<number, NodeName> }

export interface MeshStatus {
  broker: string
  mqttConnected: boolean
  lastMessageAt: string | null
  lastNodePacketAt: string | null
}
