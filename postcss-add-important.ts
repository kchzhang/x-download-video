import type { PluginCreator } from "postcss";

/**
 * PostCSS 插件：为 content script 样式添加 !important
 * Shadow DOM 已提供样式作用域隔离，只需 !important 确保权重
 *
 * 重要：CSS Cascade Layers 中，!important 会反转层优先级——
 * 低优先级层（如 base）的 !important 声明会覆盖高优先级层（如 utilities）的 !important 声明。
 * 因此跳过 base/theme/preflight 重置层，只对 utilities、components 及非层内声明添加 !important。
 */
export const addImportantPlugin: PluginCreator<{}> = () => {
  return {
    postcssPlugin: "postcss-add-important",
    Once(root) {
      root.walkDecls((decl) => {
        if (decl.important) return;

        // 检查声明是否位于重置层内，跳过这些层以避免 !important 层优先级反转
        const layerName = getLayerName(decl);
        if (layerName && isResetLayer(layerName)) return;

        decl.important = true;
      });
    },
  };
};

/** 向上遍历 AST 查找最近的 @layer 名称 */
function getLayerName(node: any): string | null {
  let current = node.parent;
  while (current) {
    if (
      current.type === "atrule" &&
      current.name === "layer" &&
      current.params
    ) {
      return current.params.trim();
    }
    current = current.parent;
  }
  return null;
}

/** 判断是否为重置层（不应添加 !important） */
function isResetLayer(layerName: string): boolean {
  const resetLayers = ["base", "preflight", "theme"];
  return resetLayers.includes(layerName.toLowerCase());
}

addImportantPlugin.postcss = true;
