<script setup lang="ts">
definePageMeta({ bare: true })

// Accepts a node number or a "!hex" id: /n/4243819386 or /n/!fcf36b7a
const route = useRoute()
const { data: fetched, error } = await useFetch<MeshNode>(`/api/nodes/${encodeURIComponent(String(route.params.num))}`)
if (error.value || !fetched.value) throw createError({ statusCode: 404, statusMessage: 'Node not found', fatal: true })
const num = fetched.value.num

const { nodes, links } = useMesh()
const now = useNow()
// Prefer the live copy so the page updates as packets arrive
const node = computed(() => nodes.value.find(n => n.num === num) ?? fetched.value!)
const status = computed(() => nodeStatus(node.value.lastHeard, now.value))
useHead({ title: () => `${nodeName(node.value)} · myMeshtastic` })

const { data: summary, refresh: refreshSummary } = await useFetch(`/api/nodes/${num}/summary`)
watch(() => node.value.lastHeard, () => refreshSummary())

const peers = computed(() => topLinks(links.value, num, Infinity))
const maxRange = computed(() => peers.value[0]?.distanceKm)
const medianRange = computed(() => {
  const d = peers.value.map(p => p.distanceKm)
  return d.length ? d[Math.floor(d.length / 2)] : undefined
})
const nodeLinks = computed(() => links.value.filter(l => l.fromNum === num || l.toNum === num))

const hasSensor = computed(() => node.value.temperature != null || node.value.humidity != null || node.value.pressure != null)
const hiLo = (hi: number | null | undefined, lo: number | null | undefined, digits = 1) =>
  hi == null || lo == null ? undefined : `24 h ${fmt(lo, '', digits)} – ${fmt(hi, '', digits)}`
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-4">
      <div class="flex size-14 items-center justify-center rounded-xl bg-primary/10 font-mono text-lg font-semibold text-primary">
        {{ node.shortName || '?' }}
      </div>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-xl font-semibold">{{ nodeName(node) }}</h1>
        <p class="text-sm text-muted font-mono">{{ node.id }} · {{ prettyEnum(node.hwModel) ?? 'Unknown device' }}</p>
      </div>
      <UBadge :color="status.color" :icon="status.icon" variant="subtle" size="lg" :label="`${status.label} · ${timeAgo(node.lastHeard, now)}`" />
      <UButton :to="`/nodes/${num}`" icon="i-lucide-chart-line" color="neutral" variant="outline" label="Full details" />
    </div>

    <UCard>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricTile icon="i-lucide-radar" label="Max range" :value="maxRange != null ? fmtKm(maxRange) : '—'" :hint="medianRange != null ? `median ${fmtKm(medianRange)}` : undefined" />
        <MetricTile icon="i-lucide-users" label="Direct peers" :value="peers.length" hint="last 30 days" />
        <MetricTile icon="i-lucide-radio-tower" label="Packets (24 h)" :value="summary?.packets ?? '—'" :hint="summary?.messages ? `${summary.messages} messages` : undefined" />
        <MetricTile icon="i-lucide-signal" label="Best SNR (24 h)" :value="fmt(summary?.bestSnr, ' dB')" :hint="fmt(summary?.bestRssi, ' dBm', 0)" />
        <MetricTile :icon="batteryIcon(node.battery)" label="Battery" :value="batteryLabel(node.battery)" :hint="fmt(node.voltage, ' V', 2)" />
        <MetricTile icon="i-lucide-timer" label="Uptime" :value="formatUptime(node.uptime)" :hint="`ch. util ${fmt(node.chUtil, ' %')}`" />
      </div>
    </UCard>

    <div class="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div class="space-y-2">
        <ClientOnly>
          <MeshMap v-if="node.lat != null" :key="num" :nodes="[node]" :links="nodeLinks" range-plot height="440px" />
          <UAlert v-else icon="i-lucide-map-pin-off" color="neutral" variant="subtle" title="No position yet" description="The map appears once this node shares its position." />
        </ClientOnly>
        <p v-if="node.lat != null" class="text-xs text-muted">
          Shaded: how far the node reaches in each direction (farthest direct link per 10° sector, last 30 days). Dashed lines: the links themselves.
        </p>
      </div>

      <div class="space-y-4">
        <UCard v-if="hasSensor">
          <template #header>
            <p class="font-semibold">Weather</p>
            <p class="text-xs text-muted">From the node's sensor · {{ timeAgo(node.envAt, now) }}</p>
          </template>
          <div class="grid grid-cols-3 gap-3">
            <MetricTile icon="i-lucide-thermometer" label="Temp" :value="fmt(node.temperature, ' °C')" :hint="hiLo(summary?.env.maxTemp, summary?.env.minTemp)" />
            <MetricTile icon="i-lucide-droplets" label="Humidity" :value="fmt(node.humidity, ' %', 0)" :hint="hiLo(summary?.env.maxHum, summary?.env.minHum, 0)" />
            <MetricTile icon="i-lucide-gauge" label="Pressure" :value="fmt(node.pressure, ' hPa', 0)" :hint="hiLo(summary?.env.maxPres, summary?.env.minPres, 0)" />
          </div>
        </UCard>

        <UCard>
          <template #header>
            <p class="font-semibold">Longest links</p>
          </template>
          <TopLinks :num="num" />
        </UCard>
      </div>
    </div>
  </div>
</template>
