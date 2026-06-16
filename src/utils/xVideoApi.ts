/**
 * X 视频/图片下载
 *
 * 核心原理：
 *   原始链接  https://x.com/User/status/123456/video/1
 *   替换域名  https://d.fixupx.com/User/status/123456/video/1
 *   重定向后  https://video.twimg.com/...mp4  (真实视频地址)
 *
 * 图片同理：  https://d.fxtwitter.com/User/status/123456/photo/1
 *
 * 注意：d.fixupx.com / d.fxtwitter.com 有 CORS 限制，
 * 只能在 background service worker 中 fetch（无 CORS 限制），
 * 页面上下文（content script / dev localhost）不能直接 fetch。
 */

export type MediaType = "video" | "photo";

export interface ParsedUrl {
  tweetId: string;
  username: string;
  mediaType: MediaType;
  mediaIndex: number;
  originalUrl: string;
}

/**
 * 解析 X 链接，提取关键信息
 */
export function parseXUrl(url: string): ParsedUrl | null {
  const match = url.match(
    /x\.com\/([\w]+)\/status\/(\d+)(?:\/(video|photo)\/(\d+))?/i
  );
  if (!match) return null;

  const username = match[1];
  const tweetId = match[2];
  const mediaType = (match[3] as MediaType) || "video";
  const mediaIndex = match[4] ? parseInt(match[4], 10) : 1;

  return { tweetId, username, mediaType, mediaIndex, originalUrl: url };
}

/**
 * 根据原始 URL 生成下载重定向 URL
 */
export function buildRedirectUrl(parsed: ParsedUrl): string {
  const path = `${parsed.username}/status/${parsed.tweetId}/${parsed.mediaType}/${parsed.mediaIndex}`;

  if (parsed.mediaType === "video") {
    return `https://d.fixupx.com/${path}`;
  }
  return `https://d.fxtwitter.com/${path}`;
}

/**
 * 格式化时长（秒 → mm:ss）
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * 从 fxtwitter API 推文数据中提取最高质量视频直链
 */
function extractVideoUrl(tweetData: any): string | null {
  const videos = tweetData?.tweet?.media?.videos;
  if (!videos || videos.length === 0) return null;

  const video = videos[0];
  if (video.variants && video.variants.length > 0) {
    const sorted = [...video.variants]
      .filter((v: any) => v.content_type === "video/mp4")
      .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    if (sorted.length > 0) return sorted[0].url;
  }

  return video.url || null;
}

/**
 * 从 fxtwitter API 推文数据中提取图片直链
 */
function extractPhotoUrl(tweetData: any): string | null {
  const photos = tweetData?.tweet?.media?.photos;
  if (!photos || photos.length === 0) return null;
  return photos[0].url || null;
}

/**
 * 通过 fxtwitter API 获取推文元信息和媒体直链
 */
async function fetchTweetMeta(tweetId: string) {
  const apis = [
    `https://api.fxtwitter.com/status/${tweetId}`,
    `https://api.vxtwitter.com/status/${tweetId}`,
  ];

  for (const apiUrl of apis) {
    try {
      const response = await fetch(apiUrl, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (data.tweet) return data;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 解析视频信息（预览 + 获取直链）
 * 从 JSON API 获取元信息和媒体直链（无 CORS 问题）
 */
export async function handleParseVideo(originalUrl: string) {
  const parsed = parseXUrl(originalUrl);
  if (!parsed) {
    return { success: false, error: "无效的 X 链接，请检查格式" };
  }

  try {
    const redirectUrl = buildRedirectUrl(parsed);

    // 尝试获取元信息用于预览
    let title = `Tweet ${parsed.tweetId}`;
    let thumbnail = "";
    let duration = "";
    let directUrl = "";

    const meta = await fetchTweetMeta(parsed.tweetId);
    if (meta) {
      const video = meta.tweet?.media?.videos?.[0];
      title = meta.tweet?.author?.name
        ? `${meta.tweet.author.name} 的${parsed.mediaType === "video" ? "视频" : "图片"}`
        : title;
      thumbnail =
        video?.thumbnail_url ||
        meta.tweet?.media?.photos?.[0]?.url ||
        "";
      if (video?.duration) {
        duration = formatDuration(video.duration);
      }

      // 从 API 数据中提取直链
      directUrl =
        parsed.mediaType === "video"
          ? extractVideoUrl(meta) || ""
          : extractPhotoUrl(meta) || "";
    }

    return {
      success: true,
      data: {
        title,
        thumbnail,
        duration,
        redirectUrl, // 给 background 用（走重定向解析）
        directUrl,   // 给 dev 用（直链，无需重定向）
        mediaType: parsed.mediaType,
        tweetId: parsed.tweetId,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "解析失败" };
  }
}

/**
 * 在 background service worker 中解析重定向 URL，获取真实媒体地址
 * service worker 没有 CORS 限制
 */
async function resolveMediaUrl(redirectUrl: string): Promise<string> {
  const resp = await fetch(redirectUrl, {
    method: "GET",
    redirect: "follow",
  });

  if (!resp.ok) {
    throw new Error(`解析媒体地址失败: HTTP ${resp.status}`);
  }

  if (resp.url && resp.url !== redirectUrl) {
    return resp.url;
  }

  return redirectUrl;
}

/**
 * 下载媒体（仅生产环境，在 background service worker 中执行）
 */
export async function handleDownloadMedia(redirectUrl: string, directUrl: string, tweetId: string, mediaType: MediaType) {
  try {
    // 优先使用重定向 URL，让 chrome.downloads 自己跟随 302 获取真实地址
    // directUrl（API 直链）可能因为缺少 Referer 等请求头被 twimg 拒绝导致 0 字节
    let mediaUrl = redirectUrl;
    if (!mediaUrl && directUrl) {
      mediaUrl = await resolveMediaUrl(directUrl);
    }
    if (!mediaUrl) {
      return { success: false, error: "未提供有效的媒体链接" };
    }

    const ext = mediaType === "video" ? "mp4" : "jpg";
    const filename = `x_${mediaType}_${tweetId}.${ext}`;

    // 启动下载
    const downloadId = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("下载启动超时"));
      }, 15000);

      chrome.downloads.download(
        {
          url: mediaUrl,
          filename,
          saveAs: false,
        },
        (id) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (typeof id === "undefined") {
            reject(new Error("下载启动失败，未返回下载 ID"));
          } else {
            resolve(id);
          }
        }
      );
    });

    // 等待下载完成，确保文件非 0 字节
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.downloads.onChanged.removeListener(listener);
        // 超时不视为失败，下载可能仍在进行
        resolve();
      }, 60000);

      function listener(delta: chrome.downloads.DownloadDelta) {
        if (delta.id !== downloadId) return;

        if (delta.state?.current === "complete") {
          clearTimeout(timer);
          chrome.downloads.onChanged.removeListener(listener);
          resolve();
        } else if (delta.state?.current === "interrupted") {
          clearTimeout(timer);
          chrome.downloads.onChanged.removeListener(listener);
          reject(new Error(`下载中断: ${delta.error?.current || "未知错误"}`));
        }
      }

      chrome.downloads.onChanged.addListener(listener);
    });

    return { success: true, filename, downloadId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 静默下载（dev 环境使用，无需 chrome API）
 * 跨域 URL 的 download 属性无效，需要先 fetch 为 blob 再下载
 */
export async function silentDownload(url: string, filename: string, fallbackUrl?: string) {
  try {
    // video.twimg.com 会校验 Referer，浏览器 fetch 默认带 localhost Referer 导致 403
    // 使用 no-referrer 策略，不带 Referer 请求
    const resp = await fetch(url, { referrerPolicy: "no-referrer" });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 延迟释放 blob URL，确保浏览器完成下载（a.click() 是异步的）
    // 大文件下载较慢，30 秒超时更安全
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 30000);
  } catch {
    // fetch 失败（403/CORS）时回退：用重定向 URL 打开新标签页
    // 浏览器导航不受 CORS 限制，会自动跟随 302 到真实地址并下载
    const targetUrl = fallbackUrl || url;
    window.open(targetUrl, "_blank");
  }
}
