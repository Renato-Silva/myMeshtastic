import type { MeshEvent } from '../utils/bus'

/** Server-Sent Events: pushes node, packet, link, message, traceroute and broker status updates. */
export default defineEventHandler(async (event) => {
  // Otherwise nginx (e.g. Forge) buffers the stream and events arrive in bursts, or not at all.
  setResponseHeader(event, 'X-Accel-Buffering', 'no')
  const stream = createEventStream(event)
  const send = (e: MeshEvent) => stream.push({ event: e.type, data: JSON.stringify(e.data) })
  meshBus.on('event', send)
  // Doubles as a keep-alive and keeps "last message" times in the header fresh.
  const tick = setInterval(() => send({ type: 'status', data: { ...meshStatus } }), 25_000)
  stream.onClosed(() => {
    clearInterval(tick)
    meshBus.off('event', send)
  })
  // Headers are only flushed with the first write, so send one right away
  // or the browser's EventSource never reaches "open" on a quiet mesh.
  stream.push({ event: 'ready', data: '' })
  send({ type: 'status', data: { ...meshStatus } })
  return stream.send()
})
