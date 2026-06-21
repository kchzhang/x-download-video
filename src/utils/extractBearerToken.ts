/**
 * 从 X.com 页面主 bundle 中动态提取 authorization Bearer Token
 *
 * 步骤：
 * 1. 扫描页面 <script> 标签，模糊匹配 abs.twimg.com/responsive-web/client-web/main.*.js
 * 2. fetch 该 JS 文件内容
 * 3. 正则匹配 Bearer token
 */

/** 匹配 X.com 主 bundle script URL（hash 为变量） */
const MAIN_BUNDLE_PATTERN = /abs\.twimg\.com\/responsive-web\/client-web\/main\.[a-f0-9]+\.js/;

/** 匹配 Bearer token 字符串 */
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9\-_.%~]+/i;

/** 从页面 script 标签中找到主 bundle URL */
function findMainBundleUrl(): string | null {
  const scripts = document.querySelectorAll('script[src]');
  for (const script of scripts) {
    const src = script.getAttribute('src') ?? '';
    if (MAIN_BUNDLE_PATTERN.test(src)) {
      return src;
    }
  }
  return null;
}

/** 从 JS 文本中提取 Bearer token */
function matchBearerFromText(text: string): string | null {
  const match = text.match(BEARER_PATTERN);
  return match ? match[0] : null;
}

/** 主函数：提取 Bearer token（供 content script 调用） */
export async function extractBearerToken(): Promise<string | null> {
  const bundleUrl = findMainBundleUrl();
  if (!bundleUrl) {
    console.warn('[X-DL] 未找到 X.com 主 bundle script 标签');
    return null;
  }

  try {
    const res = await fetch(bundleUrl);
    const text = await res.text();
    const bearer = matchBearerFromText(text);
    if (bearer) {
      console.log('[X-DL] 动态提取 Bearer token 成功');
      return bearer;
    }
    console.warn('[X-DL] 主 bundle 中未匹配到 Bearer token');
    return null;
  } catch (e) {
    console.warn('[X-DL] fetch 主 bundle 失败:', e);
    return null;
  }
}
