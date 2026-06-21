<script setup lang="ts">
import { ref } from "vue";
import { createGrokConversation, sendGrokMessage } from "@/utils/grokApi";

const conversationId = ref("");
const messageText = ref("");
const resultLog = ref<string[]>([]);
const loading = ref(false);
const transactionIdInput = ref("");

function addLog(msg: string) {
  resultLog.value.push(msg);
  console.log("[Grok]", msg);
}

async function createConversation() {
  loading.value = true;
  addLog(">>> 创建会话...");
  try {
    const cid = await createGrokConversation();
    conversationId.value = cid;
    addLog(`✅ 会话ID: ${cid}`);
  } catch (e: any) {
    addLog(`❌ 错误: ${e.message}`);
  } finally {
    loading.value = false;
  }
}

async function sendMessage() {
  if (!conversationId.value) {
    addLog("请先创建会话");
    return;
  }
  if (!messageText.value.trim()) {
    addLog("请输入消息");
    return;
  }
  loading.value = true;
  addLog(`>>> 发送消息: ${messageText.value}`);
  try {
    for await (const chunk of sendGrokMessage({
      conversationId: conversationId.value,
      message: messageText.value,
    })) {
      addLog(chunk);
    }
    addLog("✅ 完成");
  } catch (e: any) {
    addLog(`❌ 错误: ${e.message}`);
  } finally {
    loading.value = false;
  }
}

function clearLog() {
  resultLog.value = [];
}
</script>

<template>
  <div class="flex flex-col gap-3 text-sm">
    <!-- 创建会话 -->
    <div class="flex items-center gap-2">
      <button
        class="px-3 py-1.5 rounded-md bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 transition"
        :disabled="loading"
        @click="createConversation"
      >
        创建会话
      </button>
      <span v-if="conversationId" class="text-slate-500 truncate">
        ID: {{ conversationId }}
      </span>
    </div>

    <!-- 发送消息 -->
    <div class="flex items-center gap-2">
      <input
        v-model="messageText"
        type="text"
        placeholder="输入消息..."
        class="flex-1 px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:border-sky-400"
        :disabled="loading"
      />
      <button
        class="px-3 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition"
        :disabled="loading || !conversationId"
        @click="sendMessage"
      >
        发送
      </button>
    </div>

    <!-- x-client-transaction-id -->
    <div class="flex flex-col gap-1">
      <label class="text-xs text-slate-400">x-client-transaction-id</label>
      <input
        v-model="transactionIdInput"
        type="text"
        placeholder="输入 transaction ID..."
        class="w-full px-2 py-1.5 rounded-md border border-slate-200 text-xs font-mono focus:outline-none focus:border-sky-400"
      />
    </div>

    <!-- iframe 嵌套测试 -->
    <div v-if="conversationId" class="flex flex-col gap-1">
      <label class="text-xs text-slate-400">Grok 对话页面 (iframe)</label>
      <div class="relative rounded-md border border-slate-200 overflow-hidden" style="height: 280px">
        <iframe
          :src="`https://x.com/i/grok?conversation=${conversationId}`"
          class="w-full h-full border-0"
          allow="clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        ></iframe>
      </div>
    </div>

    <!-- 结果日志 -->
    <div class="relative">
      <button
        class="absolute top-1 right-1 text-xs text-slate-400 hover:text-slate-600"
        @click="clearLog"
      >
        清空
      </button>
      <div
        class="bg-slate-900 text-green-400 rounded-md p-3 text-xs font-mono overflow-y-auto max-h-[320px] whitespace-pre-wrap"
      >
        <template v-if="resultLog.length">
          <div v-for="(line, i) in resultLog" :key="i">{{ line }}</div>
        </template>
        <div v-else class="text-slate-500">等待操作...</div>
      </div>
    </div>
  </div>
</template>
