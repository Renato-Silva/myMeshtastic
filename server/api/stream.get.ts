import type { MeshEvent } from '../utils/bus'

/** Server-Sent Events: pushes node and packet updates as they arrive. */
export default defineEventHandler(async (event) => {
  const stream = createEventStream(event)
  const listener = (e: MeshEvent) => stream.push({ event: e.type, data: JSON.stringify(e.type === 'node' ? e.node : e.type === 'packet' ? e.packet : e.link) })
  meshBus.on('event', listener)
  const ping = setInterval(() => stream.push({ event: 'ping', data: '' }), 25_000)
  stream.onClosed(() => {
    clearInterval(ping)
    meshBus.off('event', listener)
  })
  // Headers are only flushed with the first write, so send one right away
  // or the browser's EventSource never reaches "open" on a quiet mesh.
  stream.push({ event: 'ready', data: '' })
  return stream.send()
})
