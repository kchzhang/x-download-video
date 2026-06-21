import { isProduction } from "@/config";
import { createApp } from "vue";
import "@/styles/tailwind.css";
import APP from "./App.vue";
import { handleParseVideo, silentDownload } from "@/utils/xVideoApi";
import { extractBearerToken } from "@/utils/extractBearerToken";
import { setAuthBearer } from "@/utils/grokApi";

// 向目标页面注入 insert script
try {
  let insertScript = document.createElement("script");
  insertScript.setAttribute("type", "text/javascript");
  if (isProduction) {
    insertScript.src = window.chrome.runtime.getURL("insert.js");
  }
  document.body.appendChild(insertScript);
} catch (err) {}

// 监听来自 Vue 组件的 BG_REQUEST 消息，以及 insert script 的 INSERT_DL_REQUEST 消息
window.addEventListener("message", async (event) => {
  const msg = event.data;

  // 处理 insert script 发来的下载请求
  if (msg?.type === "INSERT_DL_REQUEST") {
    handleInsertDownloadRequest(msg);
    return;
  }

  if (msg?.type !== "BG_REQUEST") return;

  try {
    let response: any;

    if (isProduction && chrome?.runtime) {
      // 生产环境：通过 chrome.runtime 转发给 background script
      response = await chrome.runtime.sendMessage({
        type: msg.bgMessageType,
        ...msg.data,
      });
    } else {
      // 开发环境：直接调用 API（chrome.runtime 不可用）
      response = await handleDevRequest(msg.bgMessageType, msg.data);
    }

    window.postMessage(
      {
        type: "BG_RESPONSE",
        requestId: msg.requestId,
        response,
      },
      "*"
    );
  } catch (err: any) {
    window.postMessage(
      {
        type: "BG_RESPONSE",
        requestId: msg.requestId,
        response: { success: false, error: err.message || "通信失败" },
      },
      "*"
    );
  }
});

/**
 * 开发环境下的请求处理：直接调用 API
 */
async function handleDevRequest(
  bgMessageType: string,
  data: Record<string, any>
) {
  switch (bgMessageType) {
    case "PARSE_VIDEO":
      return handleParseVideo(data.originalUrl);

    case "DOWNLOAD_VIDEO": {
      // 开发环境：优先用直链 blob 下载，失败时回退到重定向 URL 新标签页打开
      const downloadUrl = data.directUrl || data.redirectUrl;
      if (downloadUrl) {
        const ext = data.mediaType === "photo" ? "jpg" : "mp4";
        const filename = `x_${data.mediaType || "video"}_${data.tweetId || "unknown"}.${ext}`;
        await silentDownload(downloadUrl, filename, data.redirectUrl);
        return { success: true, filename };
      }
      return { success: false, error: "未获取到媒体链接" };
    }

    default:
      return { success: false, error: `未知消息类型: ${bgMessageType}` };
  }
}

/**
 * 处理 insert script 发来的页面内下载请求
 * 流程：PARSE_VIDEO → DOWNLOAD_VIDEO → 返回结果给 insert script
 */
async function handleInsertDownloadRequest(msg: any) {
  const { tweetId, originalUrl } = msg;
  try {
    // 1. 解析视频
    const parseResult: any = isProduction && chrome?.runtime
      ? await chrome.runtime.sendMessage({ type: "PARSE_VIDEO", originalUrl })
      : await handleParseVideo(originalUrl);

    if (!parseResult.success || !parseResult.data) {
      window.postMessage({ type: "INSERT_DL_RESPONSE", tweetId, success: false, error: parseResult.error || "解析失败" }, "*");
      return;
    }

    // 2. 下载
    const dlResult: any = isProduction && chrome?.runtime
      ? await chrome.runtime.sendMessage({
          type: "DOWNLOAD_VIDEO",
          redirectUrl: parseResult.data.redirectUrl,
          directUrl: parseResult.data.directUrl,
          tweetId: parseResult.data.tweetId,
          mediaType: parseResult.data.mediaType,
        })
      : await handleDevDownload(parseResult.data);

    window.postMessage({ type: "INSERT_DL_RESPONSE", tweetId, success: dlResult.success, error: dlResult.error }, "*");
  } catch (err: any) {
    window.postMessage({ type: "INSERT_DL_RESPONSE", tweetId, success: false, error: err.message || "下载失败" }, "*");
  }
}

/** 开发环境下载 */
async function handleDevDownload(data: Record<string, any>) {
  const downloadUrl = data.directUrl || data.redirectUrl;
  if (downloadUrl) {
    const ext = data.mediaType === "photo" ? "jpg" : "mp4";
    const filename = `x_${data.mediaType || "video"}_${data.tweetId || "unknown"}.${ext}`;
    await silentDownload(downloadUrl, filename, data.redirectUrl);
    return { success: true, filename };
  }
  return { success: false, error: "未获取到媒体链接" };
}

// 创建 Shadow DOM 容器，实现双向样式隔离
(async () => {
  const container = document.createElement("div");
  container.id = "chrome-plugin-container";
  document.body.appendChild(container);

  const shadowRoot = container.attachShadow({ mode: "open" });

  // 注入重置样式，阻止宿主页面继承属性穿透 Shadow DOM，并重置浏览器默认样式
  // :host 用 !important 防止宿主页面继承属性穿透；其余不用 !important，让 Tailwind 工具类通过优先级自然覆盖
  const resetStyle = document.createElement("style");
  resetStyle.textContent = `
    :host {
      all: initial !important;
      display: block !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 14px !important;
      line-height: 1.5 !important;
      color: #1f2937 !important;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      border-width: 0;
      border-style: solid;
      --tw-border-style: solid !important;
    }
    button, input, select, optgroup, textarea {
      font: inherit;
      color: inherit;
      background: none;
      border-width: 0;
      border-style: solid;
      border-color: var(--color-slate-200, #e2e8f0);
      box-shadow: none;
      -webkit-appearance: none;
      appearance: none;
    }
    p, h1, h2, h3, h4, h5, h6 {
      margin: 0;
    }
    ul, ol {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    img, svg {
      display: block;
      vertical-align: middle;
    }
    a {
      color: inherit;
      text-decoration: none;
    }
  `;
  shadowRoot.appendChild(resetStyle);

  if (isProduction && chrome?.runtime) {
    // 生产环境：将 content.css（含 Tailwind preflight + utilities，均带 !important）注入 Shadow Root
    try {
      const cssUrl = chrome.runtime.getURL("content.css");
      const cssText = await (await fetch(cssUrl)).text();
      const contentStyle = document.createElement("style");
      contentStyle.textContent = cssText;
      shadowRoot.appendChild(contentStyle);
    } catch (e) {
      console.error("[X-DL] Failed to inject content.css into shadow root", e);
    }
  } else {
    // 开发环境：将 Vite 注入 <head> 的样式同步到 Shadow DOM，并监听 HMR 更新
    const styleMap = new WeakMap<HTMLStyleElement, HTMLStyleElement>();

    const syncStyle = (headStyle: HTMLStyleElement) => {
      if (styleMap.has(headStyle)) return;
      const clone = headStyle.cloneNode(true) as HTMLStyleElement;
      clone.setAttribute("data-xdl-synced", "true");
      shadowRoot.appendChild(clone);
      styleMap.set(headStyle, clone);
    };

    // 同步已有样式
    document.head.querySelectorAll("style").forEach((s) =>
      syncStyle(s as HTMLStyleElement)
    );

    // 监听 HMR 新增/移除样式
    const styleObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLStyleElement) syncStyle(node);
        }
        for (const node of mutation.removedNodes) {
          if (node instanceof HTMLStyleElement) {
            const clone = styleMap.get(node);
            if (clone) {
              clone.remove();
              styleMap.delete(node);
            }
          }
        }
      }
    });
    styleObserver.observe(document.head, { childList: true });
  }

  // 在 Shadow Root 内创建挂载点
  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);

  const app = createApp(APP);
  app.mount(mountPoint);

  // 动态提取 Bearer token（异步，不阻塞 UI）
  extractBearerToken().then((bearer) => {
    if (bearer) setAuthBearer(bearer);
  });
})();
