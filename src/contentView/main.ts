import { isProduction } from "@/config";
import { createApp } from "vue";
import "@/styles/tailwind.css";
import APP from "./App.vue";
import { handleParseVideo, silentDownload } from "@/utils/xVideoApi";

// 向目标页面注入 insert script
try {
  let insertScript = document.createElement("script");
  insertScript.setAttribute("type", "text/javascript");
  if (isProduction) {
    insertScript.src = window.chrome.runtime.getURL("insert.js");
  }
  document.body.appendChild(insertScript);
} catch (err) {}

// 监听来自 Vue 组件的 BG_REQUEST 消息
window.addEventListener("message", async (event) => {
  const msg = event.data;
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

// 创建挂载容器
const crxApp = document.createElement("div");
crxApp.id = "chrome-plugin-container";
document.body.appendChild(crxApp);

const app = createApp(APP);
app.mount("#chrome-plugin-container");
