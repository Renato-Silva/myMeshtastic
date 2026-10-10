<script setup lang="ts">
defineProps<{ icon: string, label: string, value: string | number, hint?: string }>()
</script>

<template>
  <div class="min-w-0">
    <p class="flex items-center gap-1 text-xs text-muted">
      <UIcon :name="icon" class="size-3.5 shrink-0" />
      <span class="truncate">{{ label }}</span>
    </p>
    <p class="truncate font-semibold tabular-nums">{{ value }}</p>
    <p v-if="hint" class="truncate text-xs text-muted tabular-nums">{{ hint }}</p>
  </div>
</template>
