<script setup lang="ts">
import type { Component } from 'vue';

export interface MenuItem {
  key: string;
  label: string;
  icon: Component;
}

const props = withDefaults(
  defineProps<{
    items: MenuItem[];
    activeKey: string;
  }>(),
  {}
);

const emit = defineEmits<{
  'update:activeKey': [key: string];
}>();

function handleSelect(key: string) {
  if (key !== props.activeKey) {
    emit('update:activeKey', key);
  }
}
</script>

<template>
  <nav class="flex flex-col items-center py-3 w-9 h-full bg-slate-50/80 border-r border-slate-200/60 flex-shrink-0">
    <button
      v-for="item in items"
      :key="item.key"
      class="sidebar-item group relative flex flex-col items-center justify-center w-5 h-5 rounded-md transition-all duration-150 mb-1"
      :class="item.key === activeKey
        ? 'bg-sky-500 text-white shadow-sm'
        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'"
      @click="handleSelect(item.key)"
    >
      <component :is="item.icon" class="w-[12px] h-[12px]" />
      <!-- hover tooltip -->
      <span
        class="pointer-events-none absolute left-full ml-2 px-2 py-1 text-xs font-medium whitespace-nowrap rounded-md opacity-0 transition-opacity duration-150 z-50"
        :class="item.key === activeKey
          ? 'bg-sky-500 text-white'
          : 'bg-slate-700 text-white'"
      >
        {{ item.label }}
      </span>
    </button>
  </nav>
</template>

<style scoped>
.sidebar-item:hover > span {
  opacity: 1;
}
</style>
