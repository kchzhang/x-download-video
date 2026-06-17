<script setup lang="ts">
import { onMounted } from "vue";
import FloatingWindow from "./components/FloatingWindow.vue";
import VideoDownloader from "./components/VideoDownloader.vue";

onMounted(() => {
  console.log("Content script app mounted");
});
</script>

<template>
  <FloatingWindow title="X 视频下载器" :width="400" :height="480">
    <VideoDownloader />
  </FloatingWindow>
</template>
