<script setup lang="ts">
const { data: traces } = await useFetch<MeshTraceroute[]>('/api/traceroutes', { default: () => [] })
useMeshEvent<MeshTraceroute>('traceroute', t => traces.value.unshift(t))
const now = useNow()

// The request went requester (to) → traced node (from); the reply came back.
const forward = (t: MeshTraceroute) => [t.to, ...t.route, t.from]
const back = (t: MeshTraceroute) => [t.from, ...t.routeBack, t.to]
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-lg font-semibold">Traceroutes</h1>
      <p class="text-sm text-muted">Traceroute replies involving your nodes, with the SNR of each hop. Every hop also counts as a direct RF link.</p>
    </div>

    <UCard v-for="t in traces" :key="t.id">
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p class="font-medium">
          {{ longLabel(t.names[t.to]) }} <span class="text-muted">traced</span> {{ longLabel(t.names[t.from]) }}
          <span class="text-sm text-muted">· {{ t.route.length }} hop{{ t.route.length === 1 ? '' : 's' }} out, {{ t.routeBack.length }} back</span>
        </p>
        <span class="text-xs text-muted" :title="formatDateTime(t.ts)">{{ timeAgo(t.ts, now) }} · via {{ t.gateway ?? '—' }}</span>
      </div>
      <div class="space-y-3">
        <div>
          <p class="mb-1 text-xs text-muted">Towards</p>
          <RoutePath :path="forward(t)" :snrs="t.snrTowards" :names="t.names" />
        </div>
        <div v-if="t.snrBack.length || t.routeBack.length">
          <p class="mb-1 text-xs text-muted">Back</p>
          <RoutePath :path="back(t)" :snrs="t.snrBack" :names="t.names" />
        </div>
      </div>
    </UCard>
    <UAlert
      v-if="!traces.length"
      icon="i-lucide-waypoints"
      title="No traceroutes yet"
      description="Run a traceroute from the Meshtastic app to or from one of your nodes and the reply shows up here."
    />
  </div>
</template>
