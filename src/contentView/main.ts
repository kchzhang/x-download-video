import { isProduction } from "@/config";
import { createApp } from "vue";
import "@/styles/tailwind.css";
import APP from "./App.vue";

// 向目标页面注入 insert script
try {
  let insertScript = document.createElement("script");
  insertScript.setAttribute("type", "text/javascript");
  if (isProduction) {
    insertScript.src = window.chrome.runtime.getURL("insert.js");
  }
  document.body.appendChild(insertScript);
} catch (err) {}

// 创建挂载容器
const crxApp = document.createElement("div");
crxApp.id = "chrome-plugin-container";
document.body.appendChild(crxApp);

const app = createApp(APP);
app.mount("#chrome-plugin-container");
