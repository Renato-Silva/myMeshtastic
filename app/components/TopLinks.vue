<script setup lang="ts">
const props = withDefaults(defineProps<{ num: number, limit?: number, compact?: boolean }>(), { limit: 5 })
const { links } = useMesh()
const now = useNow()
const top = computed(() => topLinks(links.value, props.num, props.limit))
const max = computed(() => top.value[0]?.distanceKm || 1)
</script>

<template>
  <div>
    <p v-if="compact" class="mb-1.5 flex items-center gap-1 text-xs text-muted">
      <UIcon name="i-lucide-radio-tower" class="size-3.5" />
      Longest direct RF links (0 hops)
    </p>
    <ol v-if="top.length" class="space-y-1">
      <li v-for="(l, i) in top" :key="l.peer.num" class="grid grid-cols-[1rem_1fr_auto] items-center gap-2 text-sm">
        <span class="text-xs text-muted tabular-nums">{{ i + 1 }}</span>
        <div class="min-w-0">
          <div class="flex items-baseline justify-between gap-2">
            <span class="truncate font-medium" :title="l.peer.longName ?? l.peer.id">{{ peerLabel(l.peer) }}</span>
            <span v-if="!compact" class="shrink-0 text-xs text-muted">
              {{ l.source }} · {{ l.count }}× · {{ timeAgo(l.lastSeen, now) }}
            </span>
          </div>
          <div class="mt-0.5 h-1 rounded-full bg-elevated">
            <div class="h-1 rounded-full bg-primary" :style="{ width: `${(l.distanceKm / max) * 100}%` }" />
          </div>
        </div>
        <span class="text-right tabular-nums">
          <span class="font-semibold">{{ fmtKm(l.distanceKm) }}</span>
          <span class="block text-xs text-muted">{{ l.snr == null ? '—' : `${fmt(l.snr)} dB` }}</span>
        </span>
      </li>
    </ol>
    <p v-else class="text-xs text-muted">No direct links with known positions yet</p>
  </div>
</template>
