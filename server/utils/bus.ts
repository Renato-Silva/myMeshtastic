import { EventEmitter } from 'node:events'

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect']

export type MeshEvent =
  | { type: 'node', data: Row<typeof schema.nodes> }
  | { type: 'packet', data: Row<typeof schema.packets> }
  | { type: 'link', data: Awaited<ReturnType<typeof queryLinks>>[number] }
  | { type: 'message', data: Awaited<ReturnType<typeof queryMessages>>[number] }
  | { type: 'traceroute', data: Awaited<ReturnType<typeof queryTraceroutes>>[number] }
  | { type: 'status', data: typeof meshStatus }

/** In-process pub/sub between the MQTT ingest and SSE clients. */
export const meshBus = new EventEmitter<{ event: [MeshEvent] }>()
meshBus.setMaxListeners(0)
