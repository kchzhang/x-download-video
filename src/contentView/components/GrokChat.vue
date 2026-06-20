<script setup lang="ts">
import { ref } from "vue";
import { generateTransactionId } from "../utils/xClientTransactionAdapter";

const AUTH_BEARER =
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const conversationId = ref("");
const messageText = ref("");
const resultLog = ref<string[]>([]);
const loading = ref(false);
const transactionIdInput = ref("");

function getCsrfToken(): string {
  const match = document.cookie.match(/ct0=([^;]+)/);
  return match ? match[1] : "";
}

function addLog(msg: string) {
  resultLog.value.push(msg);
  console.log("[Grok]", msg);
}

async function createConversation() {
  loading.value = true;
  addLog(">>> 创建会话...");
  try {
    const csrf = getCsrfToken();
    if (!csrf) {
      addLog("错误: 无法获取 ct0 cookie，请确保在 x.com 页面上");
      return;
    }
    const transactionId = await generateTransactionId(
      "/i/api/graphql/vvC5uy7pWWHXS2aDi1FZeA/CreateGrokConversation"
    );
    const res = await fetch(
      "https://x.com/i/api/graphql/vvC5uy7pWWHXS2aDi1FZeA/CreateGrokConversation",
      {
        method: "POST",
        headers: {
          accept: "*/*",
          "content-type": "application/json",
          authorization: AUTH_BEARER,
          "x-client-transaction-id": transactionId,
          "x-csrf-token": csrf,
          "x-twitter-active-user": "yes",
          "x-twitter-auth-type": "OAuth2Session",
          "x-twitter-client-language": "en",
        },
        referrer: "https://x.com/i/grok",
        body: JSON.stringify({
          variables: {},
          queryId: "vvC5uy7pWWHXS2aDi1FZeA",
        }),
        credentials: "include",
      }
    );
    const data = await res.json();
    addLog(`响应状态: ${res.status}`);
    addLog(JSON.stringify(data, null, 2));
    const cid =
      data?.data?.create_grok_conversation?.conversation_id;
    if (cid) {
      conversationId.value = cid;
      addLog(`✅ 会话ID: ${cid}`);
    } else {
      addLog("❌ 未获取到 conversation_id");
    }
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
    const csrf = getCsrfToken();
    const requestId = crypto.randomUUID();
    const transactionId = await generateTransactionId(
      "/2/grok/add_response.json"
    );
    transactionIdInput.value = transactionId;
    addLog(`生成 transactionId: ${transactionId}`);
    const res = await fetch(
      "https://grok.x.com/2/grok/add_response.json",
      {
        method: "POST",
        headers: {
          accept: "*/*",
          "content-type": "text/plain;charset=UTF-8",
          authorization: AUTH_BEARER,
          "x-client-transaction-id": transactionId,
          "x-csrf-token": csrf,
          "x-twitter-active-user": "yes",
          "x-twitter-auth-type": "OAuth2Session",
          "x-twitter-client-language": "en",
          "x-xai-request-id": requestId,
        },
        referrer: "https://x.com/",
        body: JSON.stringify({
          responses: [
            {
              message: messageText.value,
              sender: 1,
              promptSource: "",
              fileAttachments: [],
            },
          ],
          systemPromptName: "",
          grokModelOptionId: "grok-3-latest",
          modelMode: "MODEL_MODE_FAST",
          conversationId: conversationId.value,
          returnSearchResults: true,
          returnCitations: true,
          promptMetadata: { promptSource: "NATURAL", action: "INPUT" },
          imageGenerationCount: 4,
          requestFeatures: { eagerTweets: true, serverHistory: true },
          enableSideBySide: true,
          toolOverrides: {},
          modelConfigOverride: {},
          isTemporaryChat: true,
        }),
        credentials: "include",
      }
    );
    addLog(`响应状态: ${res.status}`);

    // 尝试读取流式响应
    const text = await res.text();
    addLog("原始响应 (前2000字符):");
    addLog(text.substring(0, 2000));

    // 尝试解析为 JSON
    try {
      const data = JSON.parse(text);
      addLog("解析 JSON:");
      addLog(JSON.stringify(data, null, 2));
    } catch {
      addLog("⚠️ 非标准 JSON，可能为流式 SSE 数据");
    }
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
