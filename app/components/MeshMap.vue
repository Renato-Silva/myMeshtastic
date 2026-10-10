<script setup lang="ts">
import type { Map as LeafletMap } from 'leaflet'
import { destination, rangeOutline, rangeRings } from '#shared/utils/geo'

const props = withDefaults(defineProps<{
  nodes: MeshNode[]
  trails?: Record<number, [number, number][]>
  links?: MeshLink[]
  height?: string
  /** Range plot around the first node: outline of its farthest direct links per direction, plus distance rings. */
  rangePlot?: boolean
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

const center = computed(() => located.value[0] && [located.value[0].lat!, located.value[0].lon!] as [number, number])
const outline = computed(() => props.rangePlot && center.value
  ? rangeOutline(center.value, drawnLinks.value.flatMap(l => [l.from, l.to]).filter(p => p.num !== located.value[0]!.num).map(p => [p.lat!, p.lon!] as [number, number]))
  : [])
const rings = computed(() => {
  if (!props.rangePlot || !center.value) return []
  const c = center.value
  const max = Math.max(0, ...drawnLinks.value.map(l => l.distanceKm!))
  return max ? rangeRings(max).map(km => ({ km, label: destination(c[0], c[1], 0, km) })) : []
})

const points = computed(() => [
  ...[...located.value, ...peers.value].map(n => [n.lat!, n.lon!] as [number, number]),
  ...Object.values(props.trails ?? {}).flat()
])
// Changes when a node gains or moves its position, or trails load; not on every telemetry update
const pointsKey = computed(() => {
  const ends = [...located.value, ...peers.value].map(n => `${n.num}:${n.lat},${n.lon}`)
  const trails = Object.entries(props.trails ?? {}).map(([num, t]) => `${num}:${t.length}`)
  return [...ends, ...trails].join('|')
})

let map: LeafletMap | undefined
/** Once the user pans or zooms, leave the view alone. */
let userMoved = false
let fitting = false

function fit() {
  if (!map || userMoved || !points.value.length) return
  fitting = true
  map.fitBounds(points.value, { padding: [40, 40], maxZoom: 15 })
}

function onReady(m: LeafletMap) {
  map = m
  m.on('zoomstart dragstart', () => {
    if (!fitting) userMoved = true
  })
  m.on('moveend', () => (fitting = false))
  fit()
}

watch(pointsKey, fit)
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default" :style="{ height }">
    <LMap :zoom="8" :center="[39.5, -8]" :use-global-leaflet="false" @ready="onReady">
      <LTileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        layer-type="base"
        name="OpenStreetMap"
      />
      <template v-for="r in rings" :key="`ring-${r.km}`">
        <LCircle :lat-lng="center!" :radius="r.km * 1000" color="#57534e" :weight="1" :opacity="0.6" :fill="false" :interactive="false" />
        <LCircleMarker :lat-lng="r.label" :radius="0" :opacity="0">
          <LTooltip :options="{ permanent: true, direction: 'center', className: 'range-ring-label' }">{{ fmtKm(r.km) }}</LTooltip>
        </LCircleMarker>
      </template>
      <LPolygon
        v-if="outline.length"
        :lat-lngs="outline"
        color="#2a78d6"
        :weight="2"
        fill-color="#2a78d6"
        :fill-opacity="0.15"
        :interactive="false"
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
