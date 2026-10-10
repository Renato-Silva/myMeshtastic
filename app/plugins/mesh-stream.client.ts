export default defineNuxtPlugin(() => {
  const { nodes, links, packets, status, connected, upsertNode, upsertLink } = useMesh()
  const source = new EventSource('/api/stream')
  let reconnect = false

  source.onopen = () => (connected.value = true)
  source.onerror = () => (connected.value = false)
  // After a reconnect, resync whatever changed while the stream was down.
  source.addEventListener('ready', async () => {
    if (!reconnect) return void (reconnect = true)
    ;[nodes.value, links.value] = await Promise.all([$fetch<MeshNode[]>('/api/nodes'), $fetch<MeshLink[]>('/api/links')])
  })
  source.addEventListener('status', e => (status.value = JSON.parse(e.data)))
  source.addEventListener('node', e => upsertNode(JSON.parse(e.data)))
  source.addEventListener('link', e => upsertLink(JSON.parse(e.data)))
  source.addEventListener('packet', (e) => {
    packets.value.unshift(JSON.parse(e.data))
    if (packets.value.length > 500) packets.value.length = 500
  })
  for (const type of ['message', 'traceroute']) {
    source.addEventListener(type, e => meshEvents!.dispatchEvent(new CustomEvent(type, { detail: JSON.parse(e.data) })))
  }
})
