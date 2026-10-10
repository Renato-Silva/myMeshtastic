<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkAreaComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkAreaComponent])

export interface ChartSeries { name: string, data: [string, number | null][] }
/** Shaded time span behind the lines, e.g. a charging session. */
export interface ChartBand { start: string, end: string, color: string }

const props = defineProps<{ title: string, unit: string, series: ChartSeries[], digits?: number, bands?: ChartBand[] }>()

const colorMode = useColorMode()
const THEME = {
  light: { text: '#52514e', grid: '#e4e3df', series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'] },
  dark: { text: '#c3c2b7', grid: '#383835', series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'] }
}

const hasData = computed(() => props.series.some(s => s.data.some(([, v]) => v != null)))

const formatValue = (v: number | null | undefined) => v == null ? '—' : `${Number(v.toFixed(props.digits ?? 1))} ${props.unit}`

const option = computed(() => {
  const { text, grid, series } = THEME[colorMode.value === 'dark' ? 'dark' : 'light']
  const multi = props.series.length > 1
  return {
    color: series,
    textStyle: { color: text },
    grid: { left: 8, right: 16, top: multi ? 36 : 16, bottom: 8, containLabel: true },
    legend: multi ? { top: 0, left: 0, icon: 'roundRect', textStyle: { color: text } } : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: text, type: 'dashed' } },
      // Own formatter so the header time is 24h regardless of ECharts' locale defaults
      formatter: (params: { axisValue: number, marker: string, seriesName: string, value: [string, number | null] }[]) =>
        [formatDateTime(params[0]?.axisValue ?? null)]
          .concat(params.map(p => `${p.marker} ${p.seriesName} <b>${formatValue(p.value[1])}</b>`))
          .join('<br>')
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: grid } },
      axisLabel: {
        color: text,
        hideOverlap: true,
        formatter: { year: '{yyyy}', month: '{MMM}', day: '{d} {MMM}', hour: '{HH}:{mm}', minute: '{HH}:{mm}', second: '{HH}:{mm}:{ss}', millisecond: '{HH}:{mm}:{ss}' }
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: text, formatter: `{value} ${props.unit}` },
      splitLine: { lineStyle: { color: grid } }
    },
    dataZoom: [{ type: 'inside' }],
    series: props.series.map((s, i) => ({
      name: s.name,
      type: 'line',
      data: s.data,
      showSymbol: false,
      symbolSize: 8,
      lineStyle: { width: 2 },
      connectNulls: true,
      markArea: i === 0 && props.bands?.length
        ? { silent: true, data: props.bands.map(b => [{ xAxis: b.start, itemStyle: { color: b.color } }, { xAxis: b.end }]) }
        : undefined
    }))
  }
})
</script>

<template>
  <UCard :ui="{ body: 'p-4 sm:p-4' }">
    <p class="mb-2 text-sm font-medium">{{ title }}</p>
    <ClientOnly>
      <!-- Sized by the wrapper: vue-echarts' unlayered CSS (height: 100%) beats Tailwind utilities on the element -->
      <div v-if="hasData" class="h-56">
        <VChart :option="option" autoresize />
      </div>
      <div v-else class="flex h-56 items-center justify-center text-sm text-muted">No data in this range</div>
    </ClientOnly>
  </UCard>
</template>
