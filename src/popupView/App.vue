<script setup lang="ts">
function handleClick() {
  console.log("Button clicked");
}
</script>

<template>
  <div class="p-4 min-w-[200px]">
    <button @click="handleClick">启动</button>
  </div>
</template>
