<script setup lang="ts">
const { nodes } = useMesh()
const showTrails = ref(false)
const range = ref('24h')

const { data: positions } = await useFetch('/api/positions', {
  query: { range },
  immediate: false,
  watch: [range, showTrails],
  default: () => []
})

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
      <USwitch v-model="showTrails" label="Show trails" />
      <USelect v-if="showTrails" v-model="range" :items="['6h', '24h', '7d', '30d', '90d', '1y']" class="w-24" />
    </div>
    <ClientOnly>
      <MeshMap :nodes="nodes" :trails="trails" height="calc(100vh - 11rem)" />
    </ClientOnly>
  </div>
</template>
