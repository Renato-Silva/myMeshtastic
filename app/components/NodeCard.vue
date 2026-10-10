<script setup lang="ts">
const props = defineProps<{ node: MeshNode }>()
const now = useNow()
const n = computed(() => props.node)
const status = computed(() => nodeStatus(n.value.lastHeard, now.value))
const hasEnv = computed(() => n.value.temperature != null || n.value.humidity != null || n.value.pressure != null)
</script>

<template>
  <NuxtLink :to="`/nodes/${n.num}`" class="block">
    <UCard class="h-full transition hover:ring-primary/50" :ui="{ body: 'space-y-4' }">
      <div class="flex items-start gap-3">
        <div class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm font-semibold text-primary">
          {{ n.shortName || '?' }}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">{{ nodeName(n) }}</p>
          <p class="truncate text-xs text-muted font-mono">{{ n.id }}</p>
        </div>
        <UBadge :color="status.color" :icon="status.icon" variant="subtle" :label="status.label" size="sm" />
      </div>

      <div class="flex flex-wrap gap-1.5">
        <UBadge variant="outline" color="neutral" size="sm" icon="i-lucide-cpu" :label="prettyEnum(n.hwModel) ?? 'Unknown device'" />
        <UBadge variant="outline" color="neutral" size="sm" icon="i-lucide-tag" :label="prettyEnum(n.role) ?? 'Unknown role'" />
      </div>

      <div class="grid grid-cols-3 gap-3">
        <MetricTile
          :icon="batteryIcon(n.battery)"
          label="Battery"
          :value="batteryLabel(n.battery)"
          :hint="fmt(n.voltage, ' V', 2)"
          :class="isCharging(n.battery) ? 'text-success' : undefined"
        />
        <MetricTile icon="i-lucide-activity" label="Ch. util" :value="fmt(n.chUtil, ' %')" />
        <MetricTile icon="i-lucide-send" label="Air TX" :value="fmt(n.airUtilTx, ' %')" />
        <MetricTile icon="i-lucide-signal" label="SNR / RSSI" :value="fmt(n.snr, ' dB')" :hint="fmt(n.rssi, ' dBm', 0)" />
        <MetricTile icon="i-lucide-route" label="Hops" :value="n.hops ?? '—'" :hint="n.lastGateway ? `via ${n.lastGateway}` : undefined" />
        <MetricTile icon="i-lucide-timer" label="Uptime" :value="formatUptime(n.uptime)" />
        <template v-if="hasEnv">
          <MetricTile icon="i-lucide-thermometer" label="Temp" :value="fmt(n.temperature, ' °C')" />
          <MetricTile icon="i-lucide-droplets" label="Humidity" :value="fmt(n.humidity, ' %', 0)" />
          <MetricTile icon="i-lucide-gauge" label="Pressure" :value="fmt(n.pressure, ' hPa', 0)" />
        </template>
      </div>

      <p class="flex items-center gap-1 text-xs text-muted" :title="n.lastHeard ? new Date(n.lastHeard).toLocaleString() : undefined">
        <UIcon name="i-lucide-eye" class="size-3.5" />
        Last seen {{ timeAgo(n.lastHeard, now) }}
        <span v-if="n.lastHeard">· {{ new Date(n.lastHeard).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) }}</span>
      </p>
    </UCard>
  </NuxtLink>
</template>
