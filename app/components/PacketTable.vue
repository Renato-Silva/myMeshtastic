<script setup lang="ts">
defineProps<{ packets: MeshPacket[] }>()
const { nodes } = useMesh()
const now = useNow()
const names = computed(() => new Map(nodes.value.map(n => [n.num, n.shortName || n.id])))
const label = (num: number) => num === 0xffffffff ? 'broadcast' : names.value.get(num) ?? numId(num)
const numId = (num: number) => '!' + num.toString(16).padStart(8, '0')
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-default">
    <table class="w-full text-sm">
      <thead class="bg-elevated/50 text-left text-xs text-muted">
        <tr>
          <th class="px-3 py-2 font-medium">Time</th>
          <th class="px-3 py-2 font-medium">From</th>
          <th class="px-3 py-2 font-medium">To</th>
          <th class="px-3 py-2 font-medium">Type</th>
          <th class="px-3 py-2 font-medium">Gateway</th>
          <th class="px-3 py-2 text-right font-medium">SNR</th>
          <th class="px-3 py-2 text-right font-medium">RSSI</th>
          <th class="px-3 py-2 text-right font-medium">Hops</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-default">
        <tr v-for="p in packets" :key="p.id" class="hover:bg-elevated/40">
          <td class="whitespace-nowrap px-3 py-2 text-muted" :title="new Date(p.ts).toLocaleString()">{{ timeAgo(p.ts, now) }}</td>
          <td class="px-3 py-2"><NuxtLink :to="`/nodes/${p.from}`" class="font-medium hover:underline">{{ label(p.from) }}</NuxtLink></td>
          <td class="px-3 py-2 text-muted">{{ label(p.to) }}</td>
          <td class="px-3 py-2"><UBadge variant="soft" color="neutral" size="sm" :label="p.portnum.replace('_APP', '')" /></td>
          <td class="px-3 py-2 font-mono text-xs text-muted">{{ p.gateway ?? '—' }}</td>
          <td class="px-3 py-2 text-right tabular-nums">{{ fmt(p.snr, ' dB') }}</td>
          <td class="px-3 py-2 text-right tabular-nums">{{ fmt(p.rssi, ' dBm', 0) }}</td>
          <td class="px-3 py-2 text-right tabular-nums">{{ p.hops ?? '—' }}</td>
        </tr>
        <tr v-if="!packets.length">
          <td colspan="8" class="px-3 py-8 text-center text-muted">No packets yet</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
