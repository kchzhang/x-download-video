/**
 * Grok 对话 API 层
 *
 * 从 GrokChat.vue 中抽离的 Grok 会话能力，供多个消费方复用：
 * - getCsrfToken / buildXHeaders — 共享认证工具（xUserApi.ts 也从此导入）
 * - createGrokConversation — 创建 Grok 会话，返回 conversationId
 * - sendGrokMessage — 流式发送消息，AsyncGenerator 逐块 yield 文本增量
 */

import { generateTransactionId } from '@/contentView/utils/xClientTransactionAdapter';

const FALLBACK_BEARER =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

let capturedBearer: string | null = null;

/** 存储动态提取到的 Bearer token */
export function setAuthBearer(token: string): void {
  capturedBearer = token;
}

/** 动态获取 Bearer token，优先动态提取，降级 fallback */
export function getAuthBearer(): string {
  return capturedBearer || FALLBACK_BEARER;
}

/** 从 cookie 获取 csrf token */
export function getCsrfToken(): string {
  const match = document.cookie.match(/ct0=([^;]+)/);
  return match ? match[1] : '';
}

/** 构建 X.com 通用请求头（xUserApi 也可复用） */
export function buildXHeaders(csrf: string, transactionId: string): Record<string, string> {
  return {
    accept: '*/*',
    'content-type': 'application/json',
    authorization: getAuthBearer(),
    'x-client-transaction-id': transactionId,
    'x-csrf-token': csrf,
    'x-twitter-active-user': 'yes',
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-client-language': 'en',
  };
}

/** 创建 Grok 会话，返回 conversationId */
export async function createGrokConversation(signal?: AbortSignal): Promise<string> {
  const csrf = getCsrfToken();
  if (!csrf) throw new Error('无法获取 ct0 cookie，请确保在 x.com 页面上');

  const apiPath = '/i/api/graphql/vvC5uy7pWWHXS2aDi1FZeA/CreateGrokConversation';
  const transactionId = await generateTransactionId(apiPath, 'POST');

  const res = await fetch(`https://x.com${apiPath}`, {
    method: 'POST',
    headers: buildXHeaders(csrf, transactionId),
    referrer: 'https://x.com/i/grok',
    body: JSON.stringify({ variables: {}, queryId: 'vvC5uy7pWWHXS2aDi1FZeA' }),
    credentials: 'include',
    signal,
  });

  if (!res.ok) throw new Error(`创建会话失败: ${res.status}`);

  const data = await res.json();
  console.log('[grokApi] CreateGrokConversation 完整响应:', JSON.stringify(data, null, 2));
  const cid = data?.data?.create_grok_conversation?.conversation_id;
  if (!cid) throw new Error('未获取到 conversation_id');
  return cid;
}

export interface GrokSendOptions {
  conversationId: string;
  message: string;
  signal?: AbortSignal;
  modelMode?: string;
  isTemporaryChat?: boolean;
}

/**
 * 流式发送消息到 Grok，逐块 yield 文本增量
 *
 * Grok add_response.json 返回 NDJSON 流（每行一个 JSON 对象），
 * result.message 是增量片段（token 级），本函数跳过 header / 思考阶段后直接 yield。
 */
export async function* sendGrokMessage(
  options: GrokSendOptions,
): AsyncGenerator<string, void, undefined> {
  const { conversationId, message, signal } = options;
  const csrf = getCsrfToken();
  if (!csrf) throw new Error('无法获取 ct0 cookie，请确保在 x.com 页面上');

  const requestId = crypto.randomUUID();
  const transactionId = await generateTransactionId('/2/grok/add_response.json', 'POST');

  const res = await fetch('https://grok.x.com/2/grok/add_response.json', {
    method: 'POST',
    headers: {
      accept: '*/*',
      'content-type': 'text/plain;charset=UTF-8',
      authorization: getAuthBearer(),
      'x-client-transaction-id': transactionId,
      'x-csrf-token': csrf,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': 'en',
      'x-xai-request-id': requestId,
    },
    referrer: 'https://x.com/',
    body: JSON.stringify({
      responses: [{ message, sender: 1, promptSource: '', fileAttachments: [] }],
      systemPromptName: '',
      grokModelOptionId: 'grok-3-latest',
      modelMode: options.modelMode ?? 'MODEL_MODE_FAST',
      conversationId,
      returnSearchResults: true,
      returnCitations: true,
      promptMetadata: { promptSource: 'NATURAL', action: 'INPUT' },
      imageGenerationCount: 4,
      requestFeatures: { eagerTweets: true, serverHistory: true },
      enableSideBySide: true,
      toolOverrides: {},
      modelConfigOverride: {},
      isTemporaryChat: options.isTemporaryChat ?? true,
    }),
    credentials: 'include',
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Grok 请求失败: ${res.status} ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('无法获取响应流');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const data = JSON.parse(trimmed);
        const result = data?.result;
        if (!result?.message) continue;

        // 跳过思考阶段（header / isThinking）
        if (result.messageTag === 'header' || result.isThinking) continue;

        // message 是增量片段，直接 yield
        yield result.message;

        if (result.isDone) return;
      } catch {
        // 跳过非 JSON 行
      }
    }
  }

  // 处理剩余 buffer
  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer.trim());
      const result = data?.result;
      if (result?.message && result.messageTag !== 'header' && !result.isThinking) {
        yield result.message;
      }
    } catch {
      // ignore
    }
  }
}
