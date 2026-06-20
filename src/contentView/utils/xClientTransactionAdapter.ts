/**
 * x-client-transaction-id 库适配层
 *
 * 使用 x-client-transaction-id 包生成 transaction ID。
 * 该库接受 DOM Document 对象，内部自行处理：
 * 1. 从 meta 标签提取 verification key
 * 2. 从 SVG 提取动画帧数据
 * 3. 从内联 script 中提取 ondemand URL，再 fetch indices
 *
 * 在 content script 中，有两种方式获取 Document：
 * A. 直接用 document（当前页面 DOM）— 数据可能已被 SPA 动态修改
 * B. fetch x.com HTML + DOMParser 解析 — 获取原始页面数据
 *
 * 优先方案 B（更接近库的设计意图），降级方案 A。
 */

import { ClientTransaction } from "x-client-transaction-id";

let cachedCt: ClientTransaction | null = null;
let initPromise: Promise<ClientTransaction> | null = null;

/**
 * fetch x.com HTML 并用 DOMParser 解析为 Document
 * 这样能获取原始页面数据（包含内联 script 和 ondemand 引用）
 */
async function fetchXDocument(): Promise<Document> {
  const res = await fetch("https://x.com", { credentials: "include" });
  const html = await res.text();
  console.log("[xCT] HTML 长度:", html.length);

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc;
}

/**
 * 初始化 ClientTransaction 实例（自动缓存）
 */
export async function initClientTransaction(): Promise<ClientTransaction> {
  if (cachedCt) return cachedCt;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 方案 B: fetch + DOMParser 获取原始 Document
    try {
      const doc = await fetchXDocument();
      const ct = await ClientTransaction.create(doc);
      console.log("[xCT] ✅ ClientTransaction 初始化成功 (fetch + DOMParser)");
      cachedCt = ct;
      initPromise = null;
      return ct;
    } catch (e: any) {
      console.warn("[xCT] fetch+DOMParser 方案失败:", e.message);
    }

    // 方案 A: 直接用当前页面的 document
    try {
      const ct = await ClientTransaction.create(document);
      console.log("[xCT] ✅ ClientTransaction 初始化成功 (当前页面 document)");
      cachedCt = ct;
      initPromise = null;
      return ct;
    } catch (e: any) {
      console.warn("[xCT] 当前页面 document 方案失败:", e.message);
    }

    throw new Error("ClientTransaction 初始化失败，请确保在 x.com 页面上");
  })();

  return initPromise;
}

/**
 * 生成 x-client-transaction-id
 * @param path API 路径
 * @param method HTTP 方法，默认 "POST"
 */
export async function generateTransactionId(
  path: string,
  method: string = "POST"
): Promise<string> {
  const ct = await initClientTransaction();
  const id = await ct.generateTransactionId(method, path);
  console.log("[xCT] transactionId:", id);
  return id;
}

/**
 * 清除缓存（页面导航后数据可能变化）
 */
export function clearClientTransactionCache(): void {
  cachedCt = null;
  initPromise = null;
}
