<script setup lang="ts">
const route = useRoute()
const num = Number(route.params.num)
const { nodes } = useMesh()
const now = useNow()
const range = ref('24h')

const { data: fetched, error } = await useFetch(`/api/nodes/${num}`)
if (error.value) throw createError({ statusCode: 404, statusMessage: 'Node not found', fatal: true })
// Prefer the live copy so the header updates as packets arrive.
const node = computed(() => (nodes.value.find(n => n.num === num) ?? fetched.value) as MeshNode)
const status = computed(() => nodeStatus(node.value.lastHeard, now.value))

const { data: telemetry, refresh: refreshTelemetry } = await useFetch(`/api/nodes/${num}/telemetry`, { query: { range } })
const { data: track, refresh: refreshTrack } = await useFetch(`/api/nodes/${num}/positions`, { query: { range }, default: () => [] })
const { data: packets, refresh: refreshPackets } = await useFetch('/api/packets', { query: { node: num, limit: 50 }, default: () => [] })

watch(() => node.value.lastHeard, () => {
  refreshTelemetry()
  refreshTrack()
  refreshPackets()
})

const series = <T extends { ts: string }>(rows: T[] | undefined, key: keyof T, name: string) =>
  ({ name, data: (rows ?? []).map(r => [r.ts, r[key] as number | null] as [string, number | null]) })

const env = computed(() => telemetry.value?.environment ?? [])
const dev = computed(() => telemetry.value?.device ?? [])
const has = (rows: any[], key: string) => rows.some(r => r[key] != null)
const trail = computed(() => ({ [num]: track.value.map(p => [p.lat, p.lon] as [number, number]) }))
const { links } = useMesh()
const nodeLinks = computed(() => links.value.filter(l => l.fromNum === num || l.toNum === num))
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-4">
      <div class="flex size-14 items-center justify-center rounded-xl bg-primary/10 font-mono text-lg font-semibold text-primary">
        {{ node.shortName || '?' }}
      </div>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-xl font-semibold">{{ nodeName(node) }}</h1>
        <p class="text-sm text-muted font-mono">{{ node.id }} · {{ prettyEnum(node.hwModel) ?? 'Unknown device' }} · {{ prettyEnum(node.role) ?? 'Unknown role' }}</p>
      </div>
      <UBadge :color="status.color" :icon="status.icon" variant="subtle" size="lg" :label="`${status.label} · ${timeAgo(node.lastHeard, now)}`" />
    </div>

    <UCard>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        <MetricTile :icon="batteryIcon(node.battery)" label="Battery" :value="batteryLabel(node.battery)" :hint="fmt(node.voltage, ' V', 2)" />
        <MetricTile icon="i-lucide-thermometer" label="Temperature" :value="fmt(node.temperature, ' °C')" />
        <MetricTile icon="i-lucide-droplets" label="Humidity" :value="fmt(node.humidity, ' %', 0)" />
        <MetricTile icon="i-lucide-gauge" label="Pressure" :value="fmt(node.pressure, ' hPa', 0)" />
        <MetricTile icon="i-lucide-signal" label="SNR / RSSI" :value="fmt(node.snr, ' dB')" :hint="fmt(node.rssi, ' dBm', 0)" />
        <MetricTile icon="i-lucide-activity" label="Ch. util / Air TX" :value="fmt(node.chUtil, ' %')" :hint="fmt(node.airUtilTx, ' %')" />
        <MetricTile icon="i-lucide-timer" label="Uptime" :value="formatUptime(node.uptime)" />
        <MetricTile icon="i-lucide-route" label="Hops" :value="node.hops ?? '—'" :hint="node.lastGateway ? `via ${node.lastGateway}` : undefined" />
      </div>
    </UCard>

    <div class="flex items-center justify-between">
      <h2 class="font-semibold">History</h2>
      <UTabs v-model="range" :items="['6h', '24h', '7d', '30d'].map(v => ({ label: v, value: v }))" :content="false" size="sm" />
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <MetricChart v-if="has(env, 'temperature')" title="Temperature" unit="°C" :series="[series(env, 'temperature', 'Temperature')]" />
      <MetricChart v-if="has(env, 'humidity')" title="Relative humidity" unit="%" :digits="0" :series="[series(env, 'humidity', 'Humidity')]" />
      <MetricChart v-if="has(env, 'pressure')" title="Barometric pressure" unit="hPa" :series="[series(env, 'pressure', 'Pressure')]" />
      <MetricChart v-if="has(env, 'iaq')" title="Air quality (IAQ)" unit="" :digits="0" :series="[series(env, 'iaq', 'IAQ')]" />
      <MetricChart v-if="has(env, 'lux')" title="Light" unit="lx" :series="[series(env, 'lux', 'Lux')]" />
      <MetricChart title="Battery" unit="%" :digits="0" :series="[{ name: 'Battery', data: dev.map(r => [r.ts, r.battery == null ? null : Math.min(r.battery, 100)] as [string, number | null]) }]" />
      <MetricChart title="Voltage" unit="V" :digits="2" :series="[series(dev, 'voltage', 'Voltage')]" />
      <MetricChart
        title="Channel utilisation & airtime"
        unit="%"
        :series="[series(dev, 'chUtil', 'Channel util'), series(dev, 'airUtilTx', 'Air TX')]"
      />
    </div>

    <div class="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <UCard>
        <template #header>
          <p class="font-semibold">Top 5 direct RF links</p>
          <p class="text-xs text-muted">Longest 0-hop links seen in the last 30 days</p>
        </template>
        <TopLinks :num="num" />
      </UCard>
      <ClientOnly>
        <MeshMap v-if="node.lat != null" :key="num" :nodes="[node]" :trails="trail" :links="nodeLinks" height="360px" />
      </ClientOnly>
    </div>

    <div class="space-y-2">
      <h2 class="font-semibold">Recent packets</h2>
      <PacketTable :packets="packets as MeshPacket[]" />
    </div>
  </div>
</template>
