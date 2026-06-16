// Chrome 插件 background service worker
import { handleParseVideo, handleDownloadMedia } from "@/utils/xVideoApi";

console.log("Background service worker loaded");

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PARSE_VIDEO") {
    handleParseVideo(message.originalUrl)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // 异步响应
  }

  if (message.type === "DOWNLOAD_VIDEO") {
    handleDownloadMedia(message.redirectUrl, message.directUrl, message.tweetId, message.mediaType)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
