import type { MeshEvent } from '../utils/bus'

/** Server-Sent Events: pushes node and packet updates as they arrive. */
export default defineEventHandler(async (event) => {
  const stream = createEventStream(event)
  const listener = (e: MeshEvent) => stream.push({ event: e.type, data: JSON.stringify(e.type === 'node' ? e.node : e.packet) })
  meshBus.on('event', listener)
  const ping = setInterval(() => stream.push({ event: 'ping', data: '' }), 25_000)
  stream.onClosed(() => {
    clearInterval(ping)
    meshBus.off('event', listener)
  })
  return stream.send()
})
