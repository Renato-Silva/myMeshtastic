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

// Refetch only what the latest packet changed: a year of telemetry is too much to reload on every packet.
watch(() => node.value.lastHeard, () => refreshPackets())
watch(() => node.value.positionAt, () => refreshTrack())
watch(() => [node.value.deviceAt, node.value.envAt, node.value.localStats?.ts, node.value.powerMetrics?.ts, node.value.airQuality?.ts].join(), () => refreshTelemetry())

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
// Kept when the range is empty so the charts can say "No data in this range"
const hasPower = computed(() => !!node.value.deviceAt || dev.value.length > 0 || power.value.length > 0)
const sessions = computed(() => [...(telemetry.value?.charging ?? [])].reverse())
const ongoing = computed(() => sessions.value.find(c => c.ongoing))
const chargedMs = computed(() => sessions.value.reduce((t, c) => t + Date.parse(c.end) - Date.parse(c.start), 0))
const CHARGE_COLOR = { external: 'rgba(235, 161, 0, 0.14)', charging: 'rgba(27, 175, 122, 0.14)' }
const bands = computed(() => sessions.value.map(c => ({ start: c.start, end: c.end, color: CHARGE_COLOR[c.kind] })))
const sessionMs = (c: { start: string, end: string }) => Date.parse(c.end) - Date.parse(c.start)
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

    <template v-if="hasPower">
      <div>
        <h3 class="text-sm font-semibold">Power</h3>
        <p class="text-xs text-muted">
          <span class="inline-block size-2 rounded-sm bg-[rgba(27,175,122,0.5)]" /> charging (voltage rising)
          · <span class="inline-block size-2 rounded-sm bg-[rgba(235,161,0,0.5)]" /> on external power
        </p>
      </div>
      <UCard>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricTile
            :icon="ongoing ? 'i-lucide-battery-charging' : 'i-lucide-battery'"
            label="Now"
            :value="ongoing ? (ongoing.kind === 'external' ? 'External power' : 'Charging') : dev.length ? 'On battery' : '—'"
            :hint="ongoing ? `since ${formatDateTime(ongoing.start, true)}` : undefined"
          />
          <MetricTile
            icon="i-lucide-plug-zap"
            label="Last charge"
            :value="ongoing ? 'now' : sessions[0] ? timeAgo(sessions[0].end, now) : 'none in range'"
            :hint="sessions[0] && !ongoing ? `${formatDateTime(sessions[0].start, true)}, ${formatUptime(sessionMs(sessions[0]) / 1000)}` : undefined"
          />
          <MetricTile icon="i-lucide-timer" label="Time charging" :value="sessions.length ? formatUptime(chargedMs / 1000) : '—'" :hint="`in the last ${range}`" />
          <MetricTile icon="i-lucide-list" label="Sessions" :value="sessions.length" />
        </div>
      </UCard>
      <div class="grid gap-4 md:grid-cols-2">
        <MetricChart title="Battery" unit="%" :digits="0" :bands="bands" :series="[{ name: 'Battery', data: dev.map(r => [r.ts, r.battery == null ? null : Math.min(r.battery, 100)] as [string, number | null]) }]" />
        <MetricChart title="Voltage" unit="V" :digits="2" :bands="bands" :series="[series(dev, 'voltage', 'Voltage')]" />
        <MetricChart v-if="powerChannels('Voltage').length" title="Power sensor voltage" unit="V" :digits="2" :bands="bands" :series="powerChannels('Voltage')" />
        <MetricChart v-if="powerChannels('Current').length" title="Power sensor current" unit="mA" :digits="0" :bands="bands" :series="powerChannels('Current')" />
      </div>
      <UCard v-if="sessions.length" :ui="{ body: 'p-0 sm:p-0' }">
        <div class="max-h-72 overflow-auto">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-default text-left text-xs text-muted">
              <tr><th class="px-4 py-2">Started</th><th class="px-4 py-2">Ended</th><th class="px-4 py-2">Duration</th><th class="px-4 py-2">Type</th><th class="px-4 py-2">Voltage</th></tr>
            </thead>
            <tbody class="divide-y divide-default tabular-nums">
              <tr v-for="c in sessions" :key="c.start">
                <td class="px-4 py-2">{{ formatDateTime(c.start, true) }}</td>
                <td class="px-4 py-2">{{ c.ongoing ? 'ongoing' : formatDateTime(c.end, true) }}</td>
                <td class="px-4 py-2">{{ formatUptime(sessionMs(c) / 1000) }}</td>
                <td class="px-4 py-2">{{ c.kind === 'external' ? 'External power' : 'Charging' }}</td>
                <td class="px-4 py-2">{{ c.fromV != null && c.toV != null ? `${fmt(c.fromV, ' V', 2)} → ${fmt(c.toV, ' V', 2)}` : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </template>

    <h3 class="text-sm font-semibold">Environment & radio</h3>
    <div class="grid gap-4 md:grid-cols-2">
      <MetricChart v-if="has(env, 'temperature')" title="Temperature" unit="°C" :series="[series(env, 'temperature', 'Temperature')]" />
      <MetricChart v-if="has(env, 'humidity')" title="Relative humidity" unit="%" :digits="0" :series="[series(env, 'humidity', 'Humidity')]" />
      <MetricChart v-if="has(env, 'pressure')" title="Barometric pressure" unit="hPa" :series="[series(env, 'pressure', 'Pressure')]" />
      <MetricChart v-if="has(env, 'iaq')" title="Air quality (IAQ)" unit="" :digits="0" :series="[series(env, 'iaq', 'IAQ')]" />
      <MetricChart v-if="has(env, 'lux')" title="Light" unit="lx" :series="[series(env, 'lux', 'Lux')]" />
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
