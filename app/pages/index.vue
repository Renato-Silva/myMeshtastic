<script setup lang="ts">
const { nodes } = useMesh()
const now = useNow()

const sorted = computed(() => [...nodes.value].sort((a, b) =>
  (b.lastHeard ? Date.parse(b.lastHeard) : 0) - (a.lastHeard ? Date.parse(a.lastHeard) : 0)))
const online = computed(() => nodes.value.filter(n => nodeStatus(n.lastHeard, now.value).color === 'success').length)
const lowBattery = computed(() => nodes.value.filter(n => n.battery != null && n.battery <= 20).length)

// Newest first; a release older than the newest major.minor on the mesh counts as old
const { data: firmware } = await useFetch<{ version: string, count: number }[]>('/api/firmware', { default: () => [] })
const minor = (v: string) => v.split('.').slice(0, 2).join('.')
const isOld = (v: string) => minor(v) !== minor(firmware.value[0]?.version ?? '')
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <UCard><MetricTile icon="i-lucide-radio" label="Nodes" :value="nodes.length" /></UCard>
      <UCard><MetricTile icon="i-lucide-circle-check" label="Online (2 h)" :value="online" /></UCard>
      <UCard><MetricTile icon="i-lucide-map-pin" label="With position" :value="nodes.filter(n => n.lat != null).length" /></UCard>
      <UCard><MetricTile icon="i-lucide-battery-low" label="Battery ≤ 20%" :value="lowBattery" /></UCard>
    </div>

    <p v-if="firmware.length" class="text-sm text-muted" title="From map reports of every node on the mesh. Highlighted: older than the newest minor release">
      <UIcon name="i-lucide-cpu" class="mr-1 size-3.5 align-[-2px]" />Firmware:
      <template v-for="(f, i) in firmware" :key="f.version">
        <span v-if="i">, </span>
        <span :class="isOld(f.version) ? 'font-medium text-warning' : 'text-default'">{{ f.version }}</span> ×{{ f.count }}
      </template>
    </p>

    <div v-if="nodes.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NodeCard v-for="n in sorted" :key="n.num" :node="n" />
    </div>
    <UAlert
      v-else
      icon="i-lucide-hourglass"
      title="Waiting for packets"
      description="Nodes appear here as soon as the gateway uplinks something from them. Set NUXT_NODE_IDS to list your nodes up front."
    />

    <ClientOnly>
      <MeshMap :nodes="nodes" height="420px" />
    </ClientOnly>
  </div>
</template>
