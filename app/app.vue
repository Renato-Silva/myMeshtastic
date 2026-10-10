<script setup lang="ts">
const { nodes, connected } = useMesh()
await callOnce('mesh-nodes', async () => {
  nodes.value = await $fetch<MeshNode[]>('/api/nodes')
})

const links = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Map', icon: 'i-lucide-map', to: '/map' },
  { label: 'Packets', icon: 'i-lucide-radio-tower', to: '/packets' }
]
</script>

<template>
  <UApp>
    <header class="sticky top-0 z-[1000] border-b border-default bg-default/90 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center gap-4 px-4 h-14">
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold">
          <MeshtasticLogo class="h-5 w-auto text-highlighted" />
          <span class="hidden sm:inline">myMeshtastic</span>
        </NuxtLink>
        <UNavigationMenu :items="links" class="flex-1" />
        <UBadge
          :color="connected ? 'success' : 'neutral'"
          variant="subtle"
          :icon="connected ? 'i-lucide-wifi' : 'i-lucide-wifi-off'"
          :label="connected ? 'Live' : 'Offline'"
        />
        <UColorModeButton />
      </div>
    </header>
    <main class="mx-auto max-w-7xl px-4 py-6">
      <NuxtPage />
    </main>
  </UApp>
</template>
