<script setup lang="ts">
const { status, connected } = useMesh()
const now = useNow()
const STALE_MS = 10 * 60_000

const state = computed(() => {
  const s = status.value
  if (!connected.value || !s) return { color: 'neutral' as const, icon: 'i-lucide-wifi-off', label: 'Offline' }
  if (!s.mqttConnected) return { color: 'error' as const, icon: 'i-lucide-server-off', label: 'Broker down' }
  const age = s.lastMessageAt ? now.value - Date.parse(s.lastMessageAt) : Infinity
  if (age > STALE_MS) return { color: 'warning' as const, icon: 'i-lucide-server', label: 'Broker quiet' }
  return { color: 'success' as const, icon: 'i-lucide-server', label: 'Live' }
})
</script>

<template>
  <UPopover mode="hover" :content="{ align: 'end' }">
    <UBadge :color="state.color" :icon="state.icon" variant="subtle" :label="state.label" class="cursor-default" />
    <template #content>
      <div class="w-72 space-y-2 p-3 text-sm">
        <div class="flex justify-between gap-4">
          <span class="text-muted">Browser ↔ server</span>
          <span>{{ connected ? 'Connected' : 'Disconnected' }}</span>
        </div>
        <div class="flex justify-between gap-4">
          <span class="text-muted">Server ↔ broker</span>
          <span>{{ status?.mqttConnected ? 'Connected' : 'Disconnected' }}</span>
        </div>
        <div class="flex justify-between gap-4">
          <span class="text-muted">Last broker message</span>
          <span>{{ timeAgo(status?.lastMessageAt ?? null, now) }}</span>
        </div>
        <div class="flex justify-between gap-4">
          <span class="text-muted">Last packet from your nodes</span>
          <span>{{ timeAgo(status?.lastNodePacketAt ?? null, now) }}</span>
        </div>
        <p class="truncate border-t border-default pt-2 font-mono text-xs text-muted">{{ status?.broker }}</p>
      </div>
    </template>
  </UPopover>
</template>
