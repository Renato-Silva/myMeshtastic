<script setup lang="ts">
const { packets, nodes } = useMesh()
const filter = ref<number | 'all'>('all')

await callOnce('mesh-packets', async () => {
  packets.value = await $fetch<MeshPacket[]>('/api/packets', { query: { limit: 200 } })
})

const items = computed(() => [
  { label: 'All nodes', value: 'all' as const },
  ...nodes.value.map(n => ({ label: `${n.shortName ?? '?'} · ${nodeName(n)}`, value: n.num }))
])
const shown = computed(() => filter.value === 'all' ? packets.value : packets.value.filter(p => p.from === filter.value))
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-lg font-semibold">Live packets</h1>
      <USelect v-model="filter" :items="items" class="w-64" />
    </div>
    <PacketTable :packets="shown" />
  </div>
</template>
