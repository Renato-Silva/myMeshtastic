<script setup lang="ts">
import type { Map as LeafletMap } from 'leaflet'

const props = withDefaults(defineProps<{
  nodes: MeshNode[]
  trails?: Record<number, [number, number][]>
  height?: string
}>(), { height: '400px' })

const now = useNow()
const located = computed(() => props.nodes.filter(n => n.lat != null && n.lon != null))
const colors = { success: '#0ca30c', warning: '#fab219', neutral: '#8a8984' }

function fit(map: LeafletMap) {
  const points = located.value.map(n => [n.lat!, n.lon!] as [number, number])
  if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 })
}
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default" :style="{ height }">
    <LMap :zoom="8" :center="[39.5, -8]" :use-global-leaflet="false" @ready="fit">
      <LTileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        layer-type="base"
        name="OpenStreetMap"
      />
      <LPolyline
        v-for="(points, num) in trails"
        :key="`trail-${num}`"
        :lat-lngs="points"
        color="#2a78d6"
        :weight="2"
        :opacity="0.7"
      />
      <LCircleMarker
        v-for="n in located"
        :key="n.num"
        :lat-lng="[n.lat!, n.lon!]"
        :radius="9"
        color="#ffffff"
        :weight="2"
        :fill-color="colors[nodeStatus(n.lastHeard, now).color]"
        :fill-opacity="1"
      >
        <LTooltip :options="{ permanent: true, direction: 'top', offset: [0, -8] }">
          {{ n.shortName || n.id }}
        </LTooltip>
        <LPopup>
          <div class="space-y-1 text-sm">
            <NuxtLink :to="`/nodes/${n.num}`" class="font-semibold">{{ nodeName(n) }}</NuxtLink>
            <div>{{ nodeStatus(n.lastHeard, now).label }} · {{ timeAgo(n.lastHeard, now) }}</div>
            <div>{{ prettyEnum(n.hwModel) ?? "Unknown device" }} · {{ prettyEnum(n.role) ?? "?" }}</div>
            <div>Battery {{ batteryLabel(n.battery) }} · Ch. util {{ fmt(n.chUtil, " %") }}</div>
            <div>Alt {{ n.alt ?? '—' }} m · position {{ timeAgo(n.positionAt, now) }}</div>
          </div>
        </LPopup>
      </LCircleMarker>
    </LMap>
  </div>
</template>
