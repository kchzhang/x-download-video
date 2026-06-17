// Insert script - 注入到页面上下文中执行，可访问页面 JS 变量
// 功能：在 X.com 页面上扫描含视频的推文，注入下载按钮

console.log("[X-DL] Insert script loaded");

// ============ 按钮样式（内联，不依赖外部 CSS） ============

const BTN_CLASS = "x-dl-btn";
const BTN_ATTR = "data-x-dl-tweet-id";

function injectStyles() {
  if (document.getElementById("x-dl-styles")) return;
  const style = document.createElement("style");
  style.id = "x-dl-styles";
  style.textContent = `
    .${BTN_CLASS} {
      position: absolute;
      right: 8px;
      top: 8px;
      z-index: 10;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s, background 0.15s, transform 0.15s;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }
    .${BTN_CLASS}:hover {
      background: rgba(14, 165, 233, 0.85);
      transform: scale(1.1);
    }
    .${BTN_CLASS}:active {
      transform: scale(0.95);
    }
    .${BTN_CLASS}.x-dl-loading {
      pointer-events: none;
      animation: x-dl-spin 0.6s linear infinite;
    }
    @keyframes x-dl-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    [data-testid="videoPlayer"]:hover .${BTN_CLASS},
    [data-testid="videoComponent"]:hover .${BTN_CLASS},
    video:hover ~ .${BTN_CLASS} {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);
}

// 下载图标 SVG
const DOWNLOAD_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

// 加载图标 SVG
const LOADING_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>`;

// ============ 推文 ID 提取 ============

/**
 * 从推文 article 节点中提取 tweet ID
 * 时间戳链接格式：<a href="/username/status/1234567890">
 */
function extractTweetId(article: Element): string | null {
  // 优先从 time 的父链接中提取
  const timeLink = article.querySelector("a[href*=\"/status/\"]");
  if (!timeLink) return null;
  const href = timeLink.getAttribute("href");
  if (!href) return null;
  const match = href.match(/\/status\/(\d+)/);
  return match?.[1] || null;
}

/**
 * 检测推文是否包含视频
 */
function hasVideo(article: Element): boolean {
  return !!article.querySelector(
    'video, [data-testid="videoPlayer"], [data-testid="videoComponent"]'
  );
}

/**
 * 获取视频容器（用于挂载按钮）
 */
function getVideoContainer(article: Element): Element | null {
  return (
    article.querySelector('[data-testid="videoPlayer"]') ||
    article.querySelector('[data-testid="videoComponent"]') ||
    article.querySelector("video")?.parentElement ||
    null
  );
}

// ============ 下载按钮注入 ============

function injectDownloadButton(article: Element, tweetId: string) {
  const container = getVideoContainer(article);
  if (!container) return;

  // 避免重复注入
  if (container.querySelector(`[${BTN_ATTR}]`)) return;

  // 确保容器可以定位子元素
  const pos = getComputedStyle(container).position;
  if (pos === "static") {
    (container as HTMLElement).style.position = "relative";
  }

  const btn = document.createElement("button");
  btn.className = BTN_CLASS;
  btn.setAttribute(BTN_ATTR, tweetId);
  btn.innerHTML = DOWNLOAD_ICON;
  btn.title = "下载视频";

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleDownloadClick(btn, tweetId);
  });

  container.appendChild(btn);
}

// ============ 下载处理 ============

function handleDownloadClick(btn: HTMLElement, tweetId: string) {
  if (btn.classList.contains("x-dl-loading")) return;

  // 显示加载状态
  btn.innerHTML = LOADING_ICON;
  btn.classList.add("x-dl-loading");

  // 通过 postMessage 请求 content script 转发到 background
  // 使用 INSERT_DL_REQUEST 消息类型
  window.postMessage(
    {
      type: "INSERT_DL_REQUEST",
      tweetId,
      // 生成原始 URL 格式，background 可直接处理
      originalUrl: `https://x.com/i/status/${tweetId}/video/1`,
    },
    "*"
  );

  // 3 秒后恢复按钮（无论成功与否）
  setTimeout(() => {
    btn.innerHTML = DOWNLOAD_ICON;
    btn.classList.remove("x-dl-loading");
  }, 3000);
}

// ============ DOM 扫描 ============

function scanAndInject() {
  // X.com 的推文都在 <article> 中
  const articles = document.querySelectorAll("article[data-testid='tweet']");
  for (const article of articles) {
    if (!hasVideo(article)) continue;
    const tweetId = extractTweetId(article);
    if (!tweetId) continue;
    injectDownloadButton(article, tweetId);
  }
}

// ============ MutationObserver ============

let scanTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleScan() {
  if (scanTimer) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    scanAndInject();
  }, 500);
}

function startObserver() {
  injectStyles();

  // 初次扫描
  scanAndInject();

  // 监听 DOM 变化（X.com 是 SPA，推文动态加载）
  const observer = new MutationObserver(() => {
    scheduleScan();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log("[X-DL] Observer started, watching for video tweets...");
}

// ============ 监听来自 content script 的下载结果 ============

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "INSERT_DL_RESPONSE") return;

  const { tweetId, success, error } = data;
  if (!tweetId) return;

  // 找到对应的按钮，显示结果
  const btn = document.querySelector(`[${BTN_ATTR}="${tweetId}"]`) as HTMLElement | null;
  if (!btn) return;

  btn.classList.remove("x-dl-loading");

  if (success) {
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
    btn.style.background = "rgba(34, 197, 94, 0.8)";
    setTimeout(() => {
      btn.innerHTML = DOWNLOAD_ICON;
      btn.style.background = "";
    }, 2000);
  } else {
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    btn.style.background = "rgba(239, 68, 68, 0.8)";
    console.error("[X-DL] Download failed:", error);
    setTimeout(() => {
      btn.innerHTML = DOWNLOAD_ICON;
      btn.style.background = "";
    }, 3000);
  }
});

// ============ 启动 ============

// 等待页面加载完成后启动
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startObserver);
} else {
  startObserver();
}
