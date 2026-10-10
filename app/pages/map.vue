<script setup lang="ts">
const { nodes, links } = useMesh()
const showTrails = ref(false)
const showLinks = ref(true)
const range = ref('24h')

const { data: positions } = await useFetch('/api/positions', {
  query: { range },
  immediate: false,
  watch: [range, showTrails],
  default: () => []
})
watch(showTrails, on => on && !positions.value.length && refreshNuxtData())

const trails = computed(() => {
  if (!showTrails.value) return {}
  const out: Record<number, [number, number][]> = {}
  for (const p of positions.value) (out[p.nodeNum] ??= []).push([p.lat, p.lon])
  return out
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-4">
      <USwitch v-model="showLinks" label="RF links (0 hops)" />
      <USwitch v-model="showTrails" label="Show trails" />
      <USelect v-if="showTrails" v-model="range" :items="['6h', '24h', '7d', '30d']" class="w-24" />
    </div>
    <ClientOnly>
      <MeshMap :nodes="nodes" :trails="trails" :links="showLinks ? links : []" height="calc(100vh - 11rem)" />
    </ClientOnly>
  </div>
</template>
