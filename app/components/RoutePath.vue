<script setup lang="ts">
/** A path of node chips with the SNR of each hop between them. */
const props = defineProps<{ path: number[], snrs: (number | null)[], names: Record<number, NodeName> }>()
const complete = computed(() => props.snrs.length === props.path.length - 1)
</script>

<template>
  <div class="flex flex-wrap items-center gap-1">
    <template v-for="(num, i) in path" :key="i">
      <div v-if="i > 0" class="flex flex-col items-center px-1">
        <span class="text-[10px] leading-none text-muted tabular-nums">{{ snrs[i - 1] == null ? '?' : `${fmt(snrs[i - 1])} dB` }}</span>
        <UIcon name="i-lucide-arrow-right" class="size-4 text-muted" />
      </div>
      <NuxtLink v-if="num !== BROADCAST" :to="`/nodes/${num}`" :title="longLabel(names[num])">
        <UBadge variant="outline" color="neutral" :label="shortLabel(names[num], num)" class="font-mono" />
      </NuxtLink>
      <UBadge v-else variant="outline" color="neutral" label="unknown" />
    </template>
    <span v-if="!complete" class="text-xs text-muted">(incomplete)</span>
  </div>
</template>
