/** X.com 用户信息 */
export interface XUserInfo {
  screenName: string;
  name: string;
  description: string;
  restId: string;
  followersCount: number;
  followingCount: number;
  statusesCount: number;
  location: string;
  profileImageUrl: string;
  verified: boolean;
}

/** X.com 推文 */
export interface XTweet {
  fullText: string;
  createdAt: string;
}

/** 人设分析结果（流式文本） */
export type PersonaResult = string;
