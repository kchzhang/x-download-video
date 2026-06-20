<script setup lang="ts">
import { ref } from "vue";

const videoUrl = ref("");
const status = ref<"idle" | "parsing" | "downloading" | "success" | "error">("idle");
const errorMsg = ref("");
const videoInfo = ref<{
  title: string;
  thumbnail: string;
  duration: string;
  redirectUrl: string;
  directUrl: string;
  mediaType: string;
  tweetId: string;
} | null>(null);
const downloadHistory = ref<{ filename: string; time: string }[]>([]);

function isValidXUrl(url: string): boolean {
  return /x\.com\/\w+\/status\/\d+/.test(url);
}

/**
 * 通过 window.postMessage 与 content script 通信，
 * 由 content script 转发到 background (chrome.runtime.sendMessage)
 */
function sendToBackground<T = any>(type: string, data: Record<string, any>): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === "BG_RESPONSE" && msg?.requestId === requestId) {
        window.removeEventListener("message", handler);
        resolve(msg.response);
      }
    };

    window.addEventListener("message", handler);

    // 超时 30 秒
    setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("请求超时"));
    }, 30000);

    window.postMessage({
      type: "BG_REQUEST",
      requestId,
      bgMessageType: type,
      data,
    }, "*");
  });
}

async function parseVideo() {
  const url = videoUrl.value.trim();
  if (!url) return;

  if (!isValidXUrl(url)) {
    status.value = "error";
    errorMsg.value = "无效的 X 链接，请检查格式（如 https://x.com/user/status/123）";
    return;
  }

  status.value = "parsing";
  errorMsg.value = "";
  videoInfo.value = null;

  try {
    const response: { success: boolean; data?: any; error?: string } =
      await sendToBackground("PARSE_VIDEO", { originalUrl: url });

    if (response.success && response.data) {
      videoInfo.value = {
        title: response.data.title || `Tweet ${response.data.tweetId}`,
        thumbnail: response.data.thumbnail || "",
        duration: response.data.duration || "",
        redirectUrl: response.data.redirectUrl || "",
        directUrl: response.data.directUrl || "",
        mediaType: response.data.mediaType || "video",
        tweetId: response.data.tweetId || "",
      };
      status.value = "success";
    } else {
      status.value = "error";
      errorMsg.value = response.error || "解析失败，请稍后重试";
    }
  } catch (err: any) {
    status.value = "error";
    errorMsg.value = err.message || "网络错误，请稍后重试";
  }
}

async function downloadVideo() {
  const url = videoUrl.value.trim();
  if (!url) return;

  status.value = "downloading";

  try {
    const response: { success: boolean; filename?: string; error?: string } =
      await sendToBackground("DOWNLOAD_VIDEO", {
        redirectUrl: videoInfo.value?.redirectUrl,
        directUrl: videoInfo.value?.directUrl,
        tweetId: videoInfo.value?.tweetId,
        mediaType: videoInfo.value?.mediaType,
      });

    if (response.success) {
      status.value = "success";
      downloadHistory.value.unshift({
        filename: response.filename || `x_video_${videoInfo.value?.tweetId || "unknown"}.mp4`,
        time: new Date().toLocaleTimeString(),
      });
    } else {
      status.value = "error";
      errorMsg.value = response.error || "下载失败，请稍后重试";
    }
  } catch (err: any) {
    status.value = "error";
    errorMsg.value = err.message || "下载出错";
  }
}

function handlePaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData("text");
  if (text) {
    videoUrl.value = text;
    setTimeout(() => parseVideo(), 100);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    parseVideo();
  }
}

function reset() {
  videoUrl.value = "";
  status.value = "idle";
  errorMsg.value = "";
  videoInfo.value = null;
}
</script>

<template>
  <div class="block font-[inherit]">
    <!-- 标题 -->
    <div class="flex items-center gap-2 mb-4">
      <!-- <div class="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center flex-shrink-0">
        <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </div> -->
      <div>
        <p class="text-base font-semibold text-gray-800">X 媒体下载器</p>
        <p class="text-xs text-gray-400">粘贴链接，一键下载视频/图片</p>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="flex gap-2 mb-3">
      <div class="flex-1 relative">
        <input
          v-model="videoUrl"
          type="text"
          placeholder="粘贴 X 链接 (视频/图片)..."
          class="w-full h-9 px-3 pr-8 text-sm rounded-lg border border-slate-200 bg-white placeholder:text-slate-300 focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100 transition-colors"
          @paste="handlePaste"
          @keydown="handleKeydown"
        />
        <button
          v-if="videoUrl"
          @click="reset"
          class="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-slate-300 hover:text-slate-500 transition-colors"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button
        @click="parseVideo"
        :disabled="!videoUrl.trim() || status === 'parsing'"
        class="h-9 px-4 text-sm font-medium rounded-lg bg-sky-500 text-white hover:bg-sky-600 active:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
      >
        {{ status === 'parsing' ? '解析中...' : '解析' }}
      </button>
    </div>

    <!-- 状态提示 -->
    <div v-if="status === 'error'" class="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
      <p class="text-xs text-red-500">{{ errorMsg }}</p>
    </div>

    <!-- 媒体预览卡片 -->
    <div v-if="videoInfo && (status === 'success' || status === 'downloading')" class="mb-3 rounded-lg border border-slate-200 overflow-hidden">
      <!-- 缩略图 -->
      <div v-if="videoInfo.thumbnail" class="relative w-full h-36 bg-slate-100 overflow-hidden">
        <img :src="videoInfo.thumbnail" class="w-full h-full object-cover" alt="" />
        <span v-if="videoInfo.duration" class="absolute right-2 bottom-2 px-1.5 py-0.5 text-[10px] font-medium bg-black/70 text-white rounded">
          {{ videoInfo.duration }}
        </span>
        <span class="absolute left-2 top-2 px-1.5 py-0.5 text-[10px] font-medium bg-sky-500/80 text-white rounded">
          {{ videoInfo.mediaType === 'video' ? '视频' : '图片' }}
        </span>
      </div>
      <!-- 信息 -->
      <div class="px-3 py-2">
        <p class="text-xs text-gray-600 line-clamp-2">{{ videoInfo.title }}</p>
      </div>
    </div>

    <!-- 下载按钮 -->
    <button
      v-if="status === 'success' && videoInfo"
      @click="downloadVideo"
      class="w-full h-10 mb-3 text-sm font-medium rounded-lg bg-sky-500 text-white hover:bg-sky-600 active:bg-sky-700 transition-colors flex items-center justify-center gap-2"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      下载{{ videoInfo.mediaType === 'video' ? '视频' : '图片' }}
    </button>

    <!-- 下载中状态 -->
    <div v-if="status === 'downloading'" class="mb-3 flex items-center justify-center gap-2 h-10 rounded-lg bg-sky-50">
      <svg class="w-4 h-4 animate-spin text-sky-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span class="text-sm text-sky-600">下载中...</span>
    </div>

    <!-- 下载历史 -->
    <div v-if="downloadHistory.length > 0" class="mt-4">
      <p class="text-xs font-medium text-gray-500 mb-2">下载历史</p>
      <div class="space-y-1.5 max-h-32 overflow-y-auto">
        <div
          v-for="(item, i) in downloadHistory"
          :key="i"
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-50"
        >
          <svg class="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span class="text-xs text-gray-600 truncate flex-1">{{ item.filename }}</span>
          <span class="text-[10px] text-gray-400 flex-shrink-0">{{ item.time }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
