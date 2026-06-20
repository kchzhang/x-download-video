<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import FloatingWindow from "./components/FloatingWindow.vue";
import AppSidebar from "./components/AppSidebar.vue";
import type { MenuItem } from "./components/AppSidebar.vue";
import VideoDownloader from "./components/VideoDownloader.vue";
import ModelList from "./components/ModelList.vue";
import ModelConfigForm from "./components/ModelConfigForm.vue";
import { IconDownload, IconSettings, IconGrok } from "@/icons";
import GrokChat from "./components/GrokChat.vue";

onMounted(() => {
  console.log("Content script app mounted");
});

const activeTab = ref("video-download");

const menuItems: MenuItem[] = [
  { key: "video-download", label: "视频下载", icon: IconDownload },
  { key: "model-config", label: "模型配置", icon: IconSettings },
  { key: "grok-chat", label: "Grok 对话", icon: IconGrok },
];

const windowTitle = computed(() => {
  const map: Record<string, string> = {
    "video-download": "X 视频下载器",
    "model-config": "模型配置",
    "grok-chat": "Grok 对话测试",
  };
  return map[activeTab.value] ?? "X 视频下载器";
});

// 模型配置子状态
const modelFormMode = ref<"list" | "add" | "edit">("list");
const editingModelId = ref<string | null>(null);

function handleModelAdd() {
  modelFormMode.value = "add";
  editingModelId.value = null;
}

function handleModelEdit(id: string) {
  modelFormMode.value = "edit";
  editingModelId.value = id;
}

function handleModelFormBack() {
  modelFormMode.value = "list";
  editingModelId.value = null;
}
</script>

<template>
  <FloatingWindow :title="windowTitle" :width="420" :height="500">
    <div class="flex h-full -m-4 items-stretch">
      <AppSidebar :items="menuItems" v-model:activeKey="activeTab" class="self-stretch" />
      <div class="flex-1 p-4 overflow-y-auto">
        <!-- 视频下载 -->
        <VideoDownloader v-if="activeTab === 'video-download'" />

        <!-- Grok 对话 -->
        <GrokChat v-else-if="activeTab === 'grok-chat'" />

        <!-- 模型配置 -->
        <template v-else-if="activeTab === 'model-config'">
          <ModelList
            v-if="modelFormMode === 'list'"
            @add="handleModelAdd"
            @edit="handleModelEdit"
          />
          <ModelConfigForm
            v-else
            :editModelId="editingModelId ?? undefined"
            @saved="handleModelFormBack"
            @cancel="handleModelFormBack"
          />
        </template>
      </div>
    </div>
  </FloatingWindow>
</template>
