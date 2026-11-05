/* UI strings only. Product name and document text are never translated here. */
var HoverFocusLocales = {
  zh: {
    settings: "阅读设置", scope: "聚焦范围", sentence: "整句", line: "整行",
    appearance: "视觉效果", dim: "背景暗度", tint: "聚焦底色强度", color: "聚焦颜色",
    behavior: "悬停行为", delay: "悬停延迟", keep: "移到页内空白处时保留聚焦",
    annotation: "双击批注", highlight: "高亮", underline: "下划线", off: "关闭",
    annotationColor: "批注颜色", note: "双击已聚焦文字可保存批注；关闭后恢复双击选词。",
    language: "界面语言 / Language", auto: "跟随 Zotero / Automatic", done: "完成",
    onState: "已开启", offState: "已关闭", tooltip: "单击开关 · 右键设置",
    unavailable: "请在原始 PDF 页面视图中开启 Hover Focus，等待页面加载完成后再试。当前版本不支持重排阅读模式。",
    saveError: "Hover Focus 未能保存批注。请使用 Zotero 原有批注工具，并反馈此问题。"
  },
  en: {
    settings: "Reading settings", scope: "Focus scope", sentence: "Sentence", line: "Line",
    appearance: "Appearance", dim: "Background dimming", tint: "Highlight strength", color: "Focus color",
    behavior: "Hover behavior", delay: "Hover delay", keep: "Keep focus over page whitespace",
    annotation: "Double-click annotation", highlight: "Highlight", underline: "Underline", off: "Off",
    annotationColor: "Annotation color", note: "Double-click focused text to annotate. Turn this off to restore double-click word selection.",
    language: "Language / 界面语言", auto: "Automatic / 跟随 Zotero", done: "Done",
    onState: "On", offState: "Off", tooltip: "Click to toggle · Right-click for settings",
    unavailable: "Open Hover Focus in the original PDF page view after the document loads. Reflowed Reading Mode is not supported yet.",
    saveError: "Hover Focus could not save the annotation. Please use Zotero’s annotation tools and report this issue."
  }
};
if (typeof module !== "undefined") module.exports = HoverFocusLocales;
