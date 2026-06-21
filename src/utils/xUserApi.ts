/**
 * X.com 用户信息 & 推文 API 层
 *
 * 认证工具（getCsrfToken / buildXHeaders）从 grokApi.ts 导入，避免重复。
 */

import { generateTransactionId } from '@/contentView/utils/xClientTransactionAdapter';
import { getCsrfToken, buildXHeaders } from '@/utils/grokApi';
import type { XUserInfo, XTweet } from '@/types/persona';

const USER_BY_SCREEN_NAME_QUERY_ID = '681MIj51w00Aj6dY0GXnHw';
const USER_TWEETS_QUERY_ID = 'RyDU3I9VJtPF-Pnl6vrRlw';

const USER_BY_SCREEN_NAME_FEATURES = {
  hidden_profile_subscriptions_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  subscriptions_feature_can_gift_premium: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
};

const USER_TWEETS_FEATURES = {
  rweb_video_screen_enabled: false,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

/**
 * 从输入文本中提取 screen_name（支持 @username、纯用户名、URL）
 */
export function extractScreenName(input: string): string {
  const trimmed = input.trim();
  // @username
  const atMatch = trimmed.match(/@([A-Za-z0-9_]+)/);
  if (atMatch) return atMatch[1];
  // URL: x.com/username
  const urlMatch = trimmed.match(/x\.com\/([A-Za-z0-9_]+)/);
  if (urlMatch) return urlMatch[1];
  // 纯用户名
  if (/^[A-Za-z0-9_]+$/.test(trimmed)) return trimmed;
  return trimmed.replace(/[^A-Za-z0-9_]/g, '');
}

/**
 * 通过 screen_name 获取用户信息
 */
export async function fetchUserByScreenName(screenName: string): Promise<XUserInfo> {
  const csrf = getCsrfToken();
  if (!csrf) {
    throw new Error('无法获取 ct0 cookie，请确保在 x.com 页面上');
  }

  const apiPath = `/i/api/graphql/${USER_BY_SCREEN_NAME_QUERY_ID}/UserByScreenName`;
  const transactionId = await generateTransactionId(apiPath, 'GET');

  const variables = JSON.stringify({ screen_name: screenName, withGrokTranslatedBio: true });
  const features = JSON.stringify(USER_BY_SCREEN_NAME_FEATURES);
  const fieldToggles = JSON.stringify({ withPayments: false, withAuxiliaryUserLabels: true });

  const url = `https://x.com${apiPath}?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(features)}&fieldToggles=${encodeURIComponent(fieldToggles)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: buildXHeaders(csrf, transactionId),
    referrer: `https://x.com/${screenName}`,
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`UserByScreenName 请求失败: ${res.status}`);
  }

  const data = await res.json();
  const result = data?.data?.user?.result;

  if (!result || result.__typename === 'UserUnavailable') {
    throw new Error(`用户 @${screenName} 不存在或不可用`);
  }

  const legacy = result.legacy || {};
  const core = result.core || {};
  const location = result.location?.location || '';

  return {
    screenName: core.screen_name || screenName,
    name: core.name || '',
    description: legacy.description || '',
    restId: result.rest_id || '',
    followersCount: legacy.followers_count || 0,
    followingCount: legacy.friends_count || 0,
    statusesCount: legacy.statuses_count || 0,
    location,
    profileImageUrl: result.avatar?.image_url || legacy.profile_image_url_https || '',
    verified: result.is_blue_verified || false,
  };
}

/**
 * 递归提取 JSON 结构中所有 full_text 字段
 */
function extractFullText(obj: any, results: XTweet[]): void {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractFullText(item, results);
    }
    return;
  }

  // 如果对象有 full_text 属性，提取
  if (typeof obj.full_text === 'string') {
    results.push({
      fullText: obj.full_text,
      createdAt: obj.created_at || '',
    });
  }

  // 递归遍历所有属性
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object') {
      extractFullText(obj[key], results);
    }
  }
}

/**
 * 通过 userId 获取推文
 */
export async function fetchUserTweets(userId: string, count: number = 20): Promise<XTweet[]> {
  const csrf = getCsrfToken();
  if (!csrf) {
    throw new Error('无法获取 ct0 cookie，请确保在 x.com 页面上');
  }

  const apiPath = `/i/api/graphql/${USER_TWEETS_QUERY_ID}/UserTweets`;
  const transactionId = await generateTransactionId(apiPath, 'GET');

  const variables = JSON.stringify({
    userId,
    count,
    includePromotedContent: true,
    withQuickPromoteEligibilityTweetFields: true,
    withVoice: true,
  });
  const features = JSON.stringify(USER_TWEETS_FEATURES);
  const fieldToggles = JSON.stringify({ withArticlePlainText: false });

  const url = `https://x.com${apiPath}?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(features)}&fieldToggles=${encodeURIComponent(fieldToggles)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: buildXHeaders(csrf, transactionId),
    referrer: `https://x.com`,
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`UserTweets 请求失败: ${res.status}`);
  }

  const data = await res.json();
  const tweets: XTweet[] = [];
  extractFullText(data, tweets);

  // 过滤掉 RT 开头的纯转发（可选，保留原文本）
  return tweets;
}
