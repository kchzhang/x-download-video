<script setup lang="ts">
import { ref, computed } from 'vue';
import { extractScreenName, fetchUserByScreenName, fetchUserTweets } from '@/utils/xUserApi';
import { analyzePersona } from '@/utils/personaAnalyzer';
import type { XUserInfo } from '@/types/persona';

type Phase = 'idle' | 'fetching-user' | 'fetching-tweets' | 'analyzing' | 'done' | 'error';

const inputText = ref('');
const phase = ref<Phase>('idle');
const errorMsg = ref('');
const resultText = ref('');
const userInfo = ref<XUserInfo | null>(null);
const tweetCount = ref(0);

let abortController: AbortController | null = null;

const phaseLabel: Record<Phase, string> = {
  idle: '',
  'fetching-user': '正在获取用户资料...',
  'fetching-tweets': '正在拉取推文...',
  analyzing: 'AI 分析中...',
  done: '',
  error: '',
};

const isBusy = ref(false);
const showMd = computed(() => resultText.value.length > 0);


async function handleAnalyze() {
  const screenName = extractScreenName(inputText.value);
  if (!screenName) {
    errorMsg.value = '请输入用户名';
    phase.value = 'error';
    return;
  }

  // 重置状态
  abortController?.abort();
  abortController = new AbortController();
  isBusy.value = true;
  errorMsg.value = '';
  resultText.value = '';
  userInfo.value = null;
  tweetCount.value = 0;

  try {
    // 1. 获取用户资料
    phase.value = 'fetching-user';
    userInfo.value = await fetchUserByScreenName(screenName);

    // 2. 获取推文
    phase.value = 'fetching-tweets';
    const tweets = await fetchUserTweets(userInfo.value.restId, 20);
    tweetCount.value = tweets.length;

    // 3. AI 分析（流式）
    phase.value = 'analyzing';
    for await (const chunk of analyzePersona(userInfo.value, tweets, abortController.signal)) {
      resultText.value += chunk;
    }

    phase.value = 'done';
  } catch (e: any) {
    if (e.name === 'AbortError') {
      phase.value = 'idle';
    } else {
      console.error('[Persona]', e);
      errorMsg.value = e.message || '分析失败';
      phase.value = 'error';
    }
  } finally {
    isBusy.value = false;
  }
}

function handleStop() {
  abortController?.abort();
  isBusy.value = false;
  phase.value = 'idle';
}

function handleReset() {
  abortController?.abort();
  inputText.value = '';
  resultText.value = '';
  errorMsg.value = '';
  userInfo.value = null;
  tweetCount.value = 0;
  phase.value = 'idle';
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
</script>

<template>
  <div class="flex flex-col gap-3 text-sm">
    <!-- 输入区 -->
    <div class="flex items-center gap-2">
      <input
        v-model="inputText"
        type="text"
        placeholder="@username 或用户名"
        class="flex-1 px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:border-sky-400"
        :disabled="isBusy"
        @keydown.enter="handleAnalyze"
      />
      <button
        v-if="!isBusy"
        class="px-3 py-1.5 rounded-md bg-violet-500 text-white hover:bg-violet-600 transition whitespace-nowrap"
        @click="handleAnalyze"
      >
        分析
      </button>
      <button
        v-else
        class="px-3 py-1.5 rounded-md bg-red-400 text-white hover:bg-red-500 transition whitespace-nowrap"
        @click="handleStop"
      >
        停止
      </button>
    </div>

    <!-- 状态提示 -->
    <div v-if="phaseLabel[phase]" class="flex items-center gap-2 text-xs text-slate-500">
      <span class="inline-block w-3 h-3 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></span>
      {{ phaseLabel[phase] }}
    </div>

    <!-- 错误 -->
    <div v-if="phase === 'error'" class="text-xs text-red-500 bg-red-50 rounded-md p-2">
      {{ errorMsg }}
    </div>

    <!-- 用户信息卡片 -->
    <div v-if="userInfo" class="flex items-center gap-2 p-2 rounded-md bg-slate-50 border border-slate-100">
      <img
        v-if="userInfo.profileImageUrl"
        :src="userInfo.profileImageUrl"
        :alt="userInfo.name"
        class="w-8 h-8 rounded-full object-cover flex-shrink-0"
      />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1">
          <span class="font-medium text-slate-700 truncate">{{ userInfo.name }}</span>
          <span v-if="userInfo.verified" class="text-sky-500 text-xs">✓</span>
        </div>
        <div class="text-xs text-slate-400 truncate">@{{ userInfo.screenName }}</div>
      </div>
      <div class="flex gap-3 text-xs text-slate-400 flex-shrink-0">
        <span>{{ formatCount(userInfo.followersCount) }} 粉丝</span>
        <span>{{ tweetCount }} 推文</span>
      </div>
    </div>

    <!-- 分析结果 -->
    <div v-if="resultText" class="relative">
      <button
        class="absolute top-1 right-1 text-xs text-slate-400 hover:text-slate-600 z-10"
        @click="handleReset"
      >
        清除
      </button>
      <pre
        v-if="showMd"
        class="persona-result whitespace-pre-wrap break-words text-sm text-slate-700 bg-slate-50 rounded-md p-3 max-h-[320px] overflow-y-auto"
      >{{ resultText }}</pre>
    </div>

    <!-- 空状态 -->
    <div
      v-if="phase === 'idle' && !resultText"
      class="text-center text-xs text-slate-400 py-8"
    >
      输入 X 用户名，AI 将分析其人设画像
    </div>
  </div>
</template>

<style>
.persona-result {
  height: 320px;
  overflow-y: auto;
  border-radius: 0.375rem;
  padding: 0.75rem;
}
</style>
