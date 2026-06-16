// Insert script - 注入到页面上下文中执行，可访问页面 JS 变量
import { receiveMessage } from "@/utils/message";

console.log("Insert script loaded");

// 监听来自 content script 的消息
receiveMessage((event) => {
  const data = (event as any).data;
  if (data && data.type) {
    console.log("Insert received message:", data.type, data.data);
  }
});
