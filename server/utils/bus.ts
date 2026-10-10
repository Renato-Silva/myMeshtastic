import { EventEmitter } from 'node:events'

export type MeshEvent =
  | { type: 'node', node: typeof schema.nodes.$inferSelect }
  | { type: 'packet', packet: typeof schema.packets.$inferSelect }
  | { type: 'link', link: Awaited<ReturnType<typeof queryLinks>>[number] }

/** In-process pub/sub between the MQTT ingest and SSE clients. */
export const meshBus = new EventEmitter<{ event: [MeshEvent] }>()
meshBus.setMaxListeners(0)
