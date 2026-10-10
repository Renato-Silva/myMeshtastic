<script setup lang="ts">
const { nodes, links } = useMesh()
await callOnce('mesh-init', async () => {
  [nodes.value, links.value] = await Promise.all([$fetch<MeshNode[]>('/api/nodes'), $fetch<MeshLink[]>('/api/links')])
})

// Pages with definePageMeta({ bare: true }) (node landing pages) render without the top menu
const route = useRoute()

const navLinks = [
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Map', icon: 'i-lucide-map', to: '/map' },
  { label: 'Messages', icon: 'i-lucide-message-square', to: '/messages' },
  { label: 'Traceroutes', icon: 'i-lucide-waypoints', to: '/traceroutes' },
  { label: 'Packets', icon: 'i-lucide-radio-tower', to: '/packets' }
]
</script>

<template>
  <UApp>
    <header v-if="!route.meta.bare" class="sticky top-0 z-[1000] border-b border-default bg-default/90 backdrop-blur">
      <div class="mx-auto flex max-w-7xl items-center gap-4 px-4 h-14">
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold">
          <MeshtasticLogo class="h-5 w-auto text-highlighted" />
          <span class="hidden sm:inline">myMeshtastic</span>
        </NuxtLink>
        <UNavigationMenu :items="navLinks" class="min-w-0 flex-1" :ui="{ linkLabel: 'hidden lg:inline' }" />
        <BrokerStatus />
        <UColorModeButton />
      </div>
    </header>
    <main class="mx-auto max-w-7xl px-4 py-6">
      <NuxtPage />
    </main>
  </UApp>
</template>
