/**
 * 人设分析层
 *
 * 构建 system prompt + user prompt，调用 Grok 原生 API 流式输出人设画像。
 */

import { createGrokConversation, sendGrokMessage } from '@/utils/grokApi';
import type { XUserInfo, XTweet } from '@/types/persona';

const SYSTEM_PROMPT = `你是一个社交媒体人设分析师。你擅长通过分析用户的公开信息和推文内容，精准地洞察一个人的性格特征、行为模式和真实意图。

你的分析风格：
- 犀利但不过分攻击
- 有洞察力，能看到表面之下的东西
- 用概率和量化数据表达不确定性
- 幽默感与深度并存

请严格按照以下格式输出人设画像（使用 emoji 标签）：

🎭 角色类型：（用 2-3 个关键词描述其人格面具，如"技术狂人 + 段子手混合体"）
🔥 核心叙事：（一句话概括其自我故事的内核，带引号）
🪞 自我认知 vs 外界认知：（自认为 X / 被视为 Y）
📈 情绪曲线：（用百分比描述其推文的情绪分布，如"85% 亢奋 → 10% 暴怒 → 5% 突然感性"）
🎯 真实意图概率：（用百分比拆分其发推的真实动机）
💡 一句话总结：（一句精炼的总结，揭示其行为本质）

注意：分析要基于实际推文内容，不要泛泛而谈。如果推文内容不足，可以基于已有信息做合理推断。`;

/**
 * 构建 user prompt
 */
function buildUserPrompt(userInfo: XUserInfo, tweets: XTweet[]): string {
  const tweetTexts = tweets
    .map((t, i) => `${i + 1}. ${t.fullText}`)
    .join('\n');

  return `请分析以下 X.com 用户的人设画像：

【用户资料】
- 用户名：@${userInfo.screenName}
- 昵称：${userInfo.name}
- 简介：${userInfo.description}
- 地区：${userInfo.location || '未知'}
- 粉丝数：${userInfo.followersCount.toLocaleString()}
- 关注数：${userInfo.followingCount.toLocaleString()}
- 推文数：${userInfo.statusesCount.toLocaleString()}
- 认证：${userInfo.verified ? '是' : '否'}

【最近推文】（共 ${tweets.length} 条）
${tweetTexts}

请根据以上信息，生成该用户的人设画像。`;
}

/**
 * 流式分析人设
 *
 * 1. 创建 Grok 会话
 * 2. 将 system prompt 和 user prompt 合并为单条消息（Grok 不支持 system role）
 * 3. 流式发送，逐块 yield
 *
 * @returns AsyncGenerator，yield 的是 content 文本片段
 */
export async function* analyzePersona(
  userInfo: XUserInfo,
  tweets: XTweet[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, undefined> {
  console.log('[personaAnalyzer] 开始分析，用户:', userInfo.screenName, '推文数:', tweets.length);

  const conversationId = await createGrokConversation(signal);
  console.log('[personaAnalyzer] conversationId:', conversationId);

  const fullPrompt = `${SYSTEM_PROMPT}\n\n${buildUserPrompt(userInfo, tweets)}`;
  console.log('[personaAnalyzer] fullPrompt 长度:', fullPrompt.length);

  for await (const chunk of sendGrokMessage({ conversationId, message: fullPrompt, signal })) {
    yield chunk;
  }
  console.log('[personaAnalyzer] 流式输出结束');
}
