import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
// import sourcemaps from 'rollup-plugin-sourcemaps';
// import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 9527,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "streamup-css": path.resolve(__dirname, "node_modules/@knoxzhang/streamup/dist/streamup.css"),
    },
    dedupe: ["@tanstack/vue-virtual"],
  },
  plugins: [vue(), tailwindcss()],
});
