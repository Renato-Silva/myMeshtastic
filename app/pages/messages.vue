<script setup lang="ts">
const { data: messages } = await useFetch<MeshMessage[]>('/api/messages', { query: { limit: 300 }, default: () => [] })
useMeshEvent<MeshMessage>('message', m => messages.value.unshift(m))

const now = useNow()
const { nodes } = useMesh()
const mine = computed(() => new Set(nodes.value.map(n => n.num)))
const onlyMine = ref(false)
const shown = computed(() => onlyMine.value
  ? messages.value.filter(m => mine.value.has(m.from) || mine.value.has(m.to))
  : messages.value)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-lg font-semibold">Messages</h1>
        <p class="text-sm text-muted">Text messages sent, received or uplinked by your nodes. Direct messages are end-to-end encrypted and can't be read.</p>
      </div>
      <USwitch v-model="onlyMine" label="Only my nodes" />
    </div>

    <UCard v-if="shown.length" :ui="{ body: 'p-0 sm:p-0' }">
      <ul class="divide-y divide-default">
        <li v-for="m in shown" :key="m.id" class="flex gap-3 px-4 py-3">
          <NuxtLink
            :to="`/nodes/${m.from}`"
            class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-semibold text-primary"
          >
            {{ shortLabel(m.fromName, m.from) }}
          </NuxtLink>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2 text-sm">
              <NuxtLink :to="`/nodes/${m.from}`" class="font-medium hover:underline">{{ longLabel(m.fromName) }}</NuxtLink>
              <span v-if="m.to !== BROADCAST" class="text-muted">→ {{ longLabel(m.toName ?? undefined) }}</span>
              <UBadge v-if="m.channel" variant="soft" color="neutral" size="sm" :label="m.channel" />
              <span class="ml-auto text-xs text-muted" :title="new Date(m.ts).toLocaleString()">{{ timeAgo(m.ts, now) }}</span>
            </div>
            <p class="mt-0.5 whitespace-pre-wrap break-words" :class="m.emoji ? 'text-2xl' : ''">{{ m.text }}</p>
            <p class="mt-1 text-xs text-muted tabular-nums">
              {{ m.hops == null ? '' : m.hops === 0 ? 'direct · ' : `${m.hops} hop${m.hops > 1 ? 's' : ''} · ` }}SNR {{ fmt(m.snr, ' dB') }} · RSSI {{ fmt(m.rssi, ' dBm', 0) }} · via {{ m.gateway ?? '—' }}
            </p>
          </div>
        </li>
      </ul>
    </UCard>
    <UAlert v-else icon="i-lucide-message-square-dashed" title="No messages yet" description="Messages appear here as soon as your gateway uplinks one." />
  </div>
</template>
