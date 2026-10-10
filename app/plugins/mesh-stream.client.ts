export default defineNuxtPlugin(() => {
  const { nodes, links, packets, status, connected, upsertNode, upsertLink } = useMesh()
  const source = new EventSource('/api/stream')
  let reconnect = false

  source.onopen = () => (connected.value = true)
  source.onerror = () => (connected.value = false)
  // After a reconnect, resync whatever changed while the stream was down.
  source.addEventListener('ready', async () => {
    if (!reconnect) return void (reconnect = true)
    // Pages that load their own lists (messages, traceroutes) refetch on this
    meshEvents!.dispatchEvent(new Event('resync'))
    const [freshNodes, freshLinks, freshPackets] = await Promise.all([
      $fetch<MeshNode[]>('/api/nodes'),
      $fetch<MeshLink[]>('/api/links'),
      // Only if the packets page already loaded them
      packets.value.length ? $fetch<MeshPacket[]>('/api/packets', { query: { limit: 200 } }) : undefined
    ])
    nodes.value = freshNodes
    links.value = freshLinks
    if (freshPackets) packets.value = mergeById(freshPackets, packets.value).slice(0, 500)
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
