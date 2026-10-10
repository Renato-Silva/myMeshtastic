<script setup lang="ts">
import type { Map as LeafletMap } from 'leaflet'

const props = withDefaults(defineProps<{
  nodes: MeshNode[]
  trails?: Record<number, [number, number][]>
  links?: MeshLink[]
  height?: string
}>(), { height: '400px' })

const now = useNow()
const located = computed(() => props.nodes.filter(n => n.lat != null && n.lon != null))
const colors = { success: '#0ca30c', warning: '#fab219', neutral: '#8a8984' }

const drawnLinks = computed(() => (props.links ?? []).filter(l => l.distanceKm != null))
// Far ends of links that aren't one of the shown nodes (e.g. other people's nodes)
const peers = computed(() => {
  const shown = new Set(located.value.map(n => n.num))
  const out = new Map<number, LinkPeer>()
  for (const l of drawnLinks.value) {
    for (const p of [l.from, l.to]) if (!shown.has(p.num)) out.set(p.num, p)
  }
  return [...out.values()]
})

function fit(map: LeafletMap) {
  const points = [...located.value, ...peers.value].map(n => [n.lat!, n.lon!] as [number, number])
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
      <LPolyline
        v-for="l in drawnLinks"
        :key="`link-${l.fromNum}-${l.toNum}`"
        :lat-lngs="[[l.from.lat!, l.from.lon!], [l.to.lat!, l.to.lon!]]"
        color="#eb6834"
        :weight="2"
        dash-array="6 6"
      >
        <LTooltip :options="{ sticky: true }">
          {{ peerLabel(l.from) }} → {{ peerLabel(l.to) }} · {{ fmtKm(l.distanceKm!) }} · SNR {{ fmt(l.snr, ' dB') }}
        </LTooltip>
      </LPolyline>
      <LCircleMarker
        v-for="p in peers"
        :key="`peer-${p.num}`"
        :lat-lng="[p.lat!, p.lon!]"
        :radius="5"
        color="#ffffff"
        :weight="1"
        fill-color="#8a8984"
        :fill-opacity="1"
      >
        <LTooltip>{{ p.longName ?? p.id }} ({{ peerLabel(p) }})</LTooltip>
      </LCircleMarker>
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
