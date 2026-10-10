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

const RANGES = ['6h', '24h', '7d', '30d', '90d', '1y']
const averaged = computed(() => ['30d', '90d', '1y'].includes(range.value))

type Row = { ts: string, [key: string]: unknown }
const local = computed(() => (telemetry.value?.local ?? []) as Row[])
const power = computed(() => (telemetry.value?.power ?? []) as Row[])
const air = computed(() => (telemetry.value?.air ?? []) as Row[])
/** Series for the keys present in the rows, e.g. INA channels 1–8. */
const presentSeries = (rows: Row[], keys: [string, string][]) =>
  keys.filter(([k]) => has(rows, k)).map(([k, name]) => series(rows, k, name))
const powerChannels = (suffix: 'Voltage' | 'Current') =>
  presentSeries(power.value, Array.from({ length: 8 }, (_, i) => [`ch${i + 1}${suffix}`, `Ch ${i + 1}`] as [string, string]))
const ls = computed(() => node.value.localStats as Record<string, number> | null)
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
        <div v-if="node.mapReportAt" class="mt-2 flex flex-wrap gap-1.5" :title="`From map report, ${timeAgo(node.mapReportAt, now)}`">
          <UBadge v-if="node.firmwareVersion" variant="outline" color="neutral" size="sm" icon="i-lucide-cpu" :label="`Firmware ${node.firmwareVersion}`" />
          <UBadge v-if="node.region" variant="outline" color="neutral" size="sm" icon="i-lucide-globe" :label="node.region" />
          <UBadge v-if="node.modemPreset" variant="outline" color="neutral" size="sm" icon="i-lucide-radio" :label="prettyEnum(node.modemPreset)!" />
          <UBadge v-if="node.onlineLocalNodes != null" variant="outline" color="neutral" size="sm" icon="i-lucide-users" :label="`${node.onlineLocalNodes} nodes online nearby`" />
        </div>
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
      <div>
        <h2 class="font-semibold">History</h2>
        <p v-if="averaged" class="text-xs text-muted">Averaged per {{ range === '1y' ? 'day' : range === '90d' ? '3 hours' : 'hour' }}</p>
      </div>
      <UTabs v-model="range" :items="RANGES.map(v => ({ label: v, value: v }))" :content="false" size="sm" />
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

    <template v-if="ls || local.length">
      <div>
        <h2 class="font-semibold">Radio stats</h2>
        <p class="text-xs text-muted">Counters since the node last booted{{ ls?.ts ? ` · ${timeAgo(String(ls.ts), now)}` : '' }}</p>
      </div>
      <UCard v-if="ls">
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <MetricTile icon="i-lucide-download" label="Packets RX" :value="ls.numPacketsRx ?? '—'" />
          <MetricTile icon="i-lucide-upload" label="Packets TX" :value="ls.numPacketsTx ?? '—'" />
          <MetricTile icon="i-lucide-circle-x" label="Bad RX" :value="ls.numPacketsRxBad ?? '—'" />
          <MetricTile icon="i-lucide-copy" label="Duplicates" :value="ls.numRxDupe ?? '—'" />
          <MetricTile icon="i-lucide-repeat" label="Relayed" :value="ls.numTxRelay ?? '—'" :hint="ls.numTxRelayCanceled != null ? `${ls.numTxRelayCanceled} cancelled` : undefined" />
          <MetricTile icon="i-lucide-ban" label="TX dropped" :value="ls.numTxDropped ?? '—'" />
          <MetricTile icon="i-lucide-users" label="Nodes online" :value="ls.numOnlineNodes ?? '—'" :hint="ls.numTotalNodes != null ? `of ${ls.numTotalNodes}` : undefined" />
          <MetricTile icon="i-lucide-audio-waveform" label="Noise floor" :value="fmt(ls.noiseFloor, ' dBm', 0)" />
        </div>
      </UCard>
      <div class="grid gap-4 md:grid-cols-2">
        <MetricChart
          title="Packets"
          unit=""
          :digits="0"
          :series="presentSeries(local, [['numPacketsRx', 'RX'], ['numPacketsTx', 'TX'], ['numPacketsRxBad', 'Bad RX'], ['numTxRelay', 'Relayed']])"
        />
        <MetricChart v-if="has(local, 'noiseFloor')" title="Noise floor" unit="dBm" :digits="0" :series="[series(local, 'noiseFloor', 'Noise floor')]" />
        <MetricChart v-if="has(local, 'numOnlineNodes')" title="Nodes online" unit="" :digits="0" :series="[series(local, 'numOnlineNodes', 'Online')]" />
      </div>
    </template>

    <template v-if="power.length">
      <h2 class="font-semibold">Power sensors</h2>
      <div class="grid gap-4 md:grid-cols-2">
        <MetricChart v-if="powerChannels('Voltage').length" title="Voltage" unit="V" :digits="2" :series="powerChannels('Voltage')" />
        <MetricChart v-if="powerChannels('Current').length" title="Current" unit="mA" :digits="0" :series="powerChannels('Current')" />
      </div>
    </template>

    <template v-if="air.length">
      <h2 class="font-semibold">Air quality</h2>
      <div class="grid gap-4 md:grid-cols-2">
        <MetricChart
          v-if="has(air, 'pm25Standard') || has(air, 'pm10Standard')"
          title="Particulate matter"
          unit="µg/m³"
          :digits="0"
          :series="presentSeries(air, [['pm10Standard', 'PM1.0'], ['pm25Standard', 'PM2.5'], ['pm100Standard', 'PM10']])"
        />
        <MetricChart v-if="has(air, 'co2')" title="CO₂" unit="ppm" :digits="0" :series="[series(air, 'co2', 'CO₂')]" />
        <MetricChart
          v-if="has(air, 'pmVocIdx') || has(air, 'pmNoxIdx')"
          title="VOC & NOx index"
          unit=""
          :digits="0"
          :series="presentSeries(air, [['pmVocIdx', 'VOC'], ['pmNoxIdx', 'NOx']])"
        />
      </div>
    </template>

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
