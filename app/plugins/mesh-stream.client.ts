export default defineNuxtPlugin(() => {
  const { packets, connected, upsertNode } = useMesh()
  const source = new EventSource('/api/stream')

  source.onopen = () => (connected.value = true)
  source.onerror = () => (connected.value = false)
  source.addEventListener('node', e => upsertNode(JSON.parse(e.data)))
  source.addEventListener('packet', (e) => {
    packets.value.unshift(JSON.parse(e.data))
    if (packets.value.length > 500) packets.value.length = 500
  })
})
