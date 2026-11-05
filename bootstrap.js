/* Hover Focus: a small, local-only Zotero 10 PDF reader extension. */
"use strict";
const HF_PREFIX = "extensions.zotero.hoverFocus.";
const HF_DEFAULTS = { dim: 35, tint: 12, color: "#ffd54a", delay: 200, keep: true, unit: "sentence", doubleClick: "highlight", annotationColor: "#ffd400", language: "auto" };
const HF_SVG = "http://www.w3.org/2000/svg";
const HF_SESSIONS = new Map();
const HF_UI = new Map();
let hfCore, hfStrings, hfPanelUI, hfID, hfRootURI, hfStopped = true, hfToolbar, hfSelection;

function hfLanguage() {
  const choice=hfPref("language");
  if (choice === "zh" || choice === "en") return choice;
  const locale=Zotero.locale || (typeof Services!=="undefined" && Services.locale?.appLocaleAsBCP47) || "en";
  return /^zh(?:[-_]|$)/i.test(locale) ? "zh" : "en";
}
function hfT(key) { return hfStrings?.[hfLanguage()]?.[key] || hfStrings?.en?.[key] || key; }

function hfError(e) { Zotero.logError(e); }
function hfPref(key) {
  const v = Zotero.Prefs.get(HF_PREFIX + key, true);
  return v === undefined || v === null ? HF_DEFAULTS[key] : v;
}
function hfSet(key, value) {
  Zotero.Prefs.set(HF_PREFIX + key, value, true);
  for (const s of HF_SESSIONS.values()) {
    if (key === "unit") { s.cache.clear(); hfSuspend(s); }
    else if (s.current) hfPaint(s);
  }
  for (const reader of HF_UI.keys()) hfSync(reader);
  if (key === "language") {
    for (const [reader,ui] of [...HF_UI]) if (ui.panel) hfSettings(reader,ui.doc,true);
  }
}
function hfView(reader) {
  const internal = reader?._internalReader;
  if (!internal || internal._primarySDTView) return null; // reflow is outside v0.1 scope
  const view = internal._primaryView;
  const win = view?._iframeWindow;
  const app = win?.PDFViewerApplication;
  if (!app?.pdfDocument) return null;
  return { view, win, app, doc: win.document };
}
function hfAlive(s) { return !hfStopped && HF_SESSIONS.get(s.reader) === s; }
function hfCancel(s) {
  if (s.timer != null) s.win.clearTimeout(s.timer);
  s.timer = null;
  s.token++;
}
function hfClear(s) {
  if (s.overlay) s.overlay.remove();
  s.overlay = null; s.current = null;
}
function hfSuspend(s, preserveClick = false) {
  hfCancel(s); hfClear(s);
  if (!preserveClick) s.markCandidate = null;
}
function hfBusy(s) {
  const v = hfView(s.reader);
  if (!v || v.win !== s.win || s.dragging || s.doc.hidden || !s.doc.hasFocus()) return true;
  const selection = s.win.getSelection();
  if (selection && !selection.isCollapsed) return true;
  const view = v.view;
  if (view._selectionPopup || view._annotationPopup || view._selectionRanges?.some(r => !r.collapsed)) return true;
  // Only operate with Zotero's ordinary pointer tool, leaving annotation tools alone.
  if (view._tool?.type && view._tool.type !== "pointer") return true;
  return false;
}
function hfListen(s, target, type, fn, options = false) {
  target.addEventListener(type, fn, options);
  s.cleanups.push(() => target.removeEventListener(type, fn, options));
}
function hfSVG(doc, tag, attrs) {
  const el = doc.createElementNS(HF_SVG, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

function hfPaint(s) {
  if (!hfAlive(s) || !s.current || hfBusy(s)) { hfClear(s); return; }
  const { pageIndex, sentence } = s.current;
  const v = hfView(s.reader);
  const page = Components.utils.waiveXrays(v.app.pdfViewer.getPageView(pageIndex));
  const container = s.doc.getElementById("viewerContainer");
  if (!page?.div?.isConnected || !container) { hfClear(s); return; }
  const area = container.getBoundingClientRect();
  const pb = page.div.getBoundingClientRect();
  if (pb.bottom <= area.top || pb.top >= area.bottom) { hfClear(s); return; }
  const vp = page.viewport;
  const sx = pb.width / vp.width, sy = pb.height / vp.height;
  const rects = sentence.rects.map(r => hfCore.transform(r, Array.from(vp.transform)))
    .map(r => [pb.left - area.left + r[0]*sx - 1.5, pb.top - area.top + r[1]*sy - 1.5,
      (r[2]-r[0])*sx + 3, (r[3]-r[1])*sy + 3]);
  if (s.overlay) s.overlay.remove();
  const svg = hfSVG(s.doc, "svg", { width: area.width, height: area.height, "aria-hidden": "true" });
  svg.classList.add("hover-focus-overlay");
  svg.style.cssText = `position:fixed;left:${area.left}px;top:${area.top}px;width:${area.width}px;height:${area.height}px;pointer-events:none;z-index:20;overflow:hidden;`;
  const defs = hfSVG(s.doc, "defs", {});
  const mask = hfSVG(s.doc, "mask", { id: "hover-focus-mask", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: area.width, height: area.height });
  mask.append(hfSVG(s.doc, "rect", { x: 0, y: 0, width: area.width, height: area.height, fill: "white" }));
  for (const [x,y,width,height] of rects) mask.append(hfSVG(s.doc, "rect", { x,y,width,height,fill:"black" }));
  defs.append(mask); svg.append(defs);
  svg.append(hfSVG(s.doc, "rect", { x:0,y:0,width:area.width,height:area.height,fill:"black",opacity:Number(hfPref("dim"))/100,mask:"url(#hover-focus-mask)" }));
  for (const [x,y,width,height] of rects) svg.append(hfSVG(s.doc, "rect", { x,y,width,height,fill:hfPref("color"),opacity:Number(hfPref("tint"))/100 }));
  s.doc.body.append(svg); s.overlay = svg;
}

async function hfPage(s, pageIndex) {
  const unit = hfPref("unit"), key = `${pageIndex}:${unit}`;
  let promise = s.cache.get(key);
  if (!promise) {
    promise = (async () => {
      const v = hfView(s.reader);
      if (!v) return [];
      const options = Components.utils.cloneInto({ pageIndex }, s.win);
      const data = Components.utils.waiveXrays(await v.app.pdfDocument.getPageData(options));
      return hfCore.analyze(data?.chars || [], unit);
    })();
    s.cache.set(key, promise);
    // Bounded per-reader cache. A rejected request can be retried.
    promise.catch(() => { if (s.cache.get(key) === promise) s.cache.delete(key); });
    if (s.cache.size > 16) s.cache.delete(s.cache.keys().next().value);
  }
  return promise;
}
async function hfFocus(s, pageEl, x, y, token) {
  try {
    const pageIndex = Number(pageEl.dataset.pageNumber) - 1;
    if (!Number.isInteger(pageIndex) || pageIndex < 0) return;
    const sentences = await hfPage(s, pageIndex);
    if (!hfAlive(s) || token !== s.token || hfBusy(s) || !pageEl.isConnected) return;
    const v = hfView(s.reader);
    const pv = Components.utils.waiveXrays(v.app.pdfViewer.getPageView(pageIndex));
    if (!pv?.viewport) return;
    const box = pageEl.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const sentence = hfCore.hitTest(sentences, (x-box.left)*pv.viewport.width/box.width,
      (y-box.top)*pv.viewport.height/box.height, Array.from(pv.viewport.transform));
    if (!sentence) {
      if (!hfPref("keep")) hfClear(s);
      return;
    }
    if (s.current?.sentence === sentence && s.current.pageIndex === pageIndex && s.overlay) return;
    s.current = { pageIndex, sentence }; hfPaint(s);
  } catch (e) { if (hfAlive(s)) { hfClear(s); hfError(e); } }
}

function hfCandidateAt(s, event) {
  const mark = s.markCandidate;
  if (!mark || Date.now() - mark.time > 800 || event.button !== 0
    || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const pageEl = event.target?.closest?.(".page");
  if (!pageEl || Number(pageEl.dataset.pageNumber)-1 !== mark.focus.pageIndex) return null;
  const pv = Components.utils.waiveXrays(s.app.pdfViewer.getPageView(mark.focus.pageIndex));
  const box = pageEl.getBoundingClientRect();
  if (!pv?.viewport || !box.width || !box.height) return null;
  const hit = hfCore.hitTest([mark.focus.sentence], (event.clientX-box.left)*pv.viewport.width/box.width,
    (event.clientY-box.top)*pv.viewport.height/box.height, Array.from(pv.viewport.transform));
  return hit ? mark : null;
}

async function hfAnnotate(s, focus, action) {
  if (!hfAlive(s) || s.marking || !["highlight", "underline"].includes(action)) return;
  const v = hfView(s.reader);
  if (!v || s.reader._internalReader._state?.readOnly || v.view._readOnly) return;
  s.marking = true;
  try {
    await v.view._ensureBasicPageData(focus.pageIndex);
    if (!hfAlive(s)) return;
    const position = { pageIndex: focus.pageIndex, rects: focus.sentence.rects.map(r => Array.from(r)) };
    const clone = data => Components.utils.cloneInto(data, s.reader._iframeWindow);
    const meta = v.view.getAnnotationMeta(clone(position));
    if (!meta?.sortIndex || typeof v.view._onAddAnnotation !== "function") throw new Error("Hover Focus: annotation API unavailable");
    const existing = s.reader._internalReader._annotationManager?._annotations || [];
    const duplicate = existing.some(a => a.type === action && a.position?.pageIndex === focus.pageIndex
      && a.position.rects?.length === position.rects.length
      && a.position.rects.every((r,i)=>r.every((n,j)=>Math.abs(n-position.rects[i][j])<0.1)));
    if (duplicate) return;
    v.view._onAddAnnotation(clone({ type: action, color: hfPref("annotationColor"), text: focus.sentence.text,
      position, sortIndex: meta.sortIndex, pageLabel: meta.pageLabel }), false);
  } catch (e) {
    hfError(e);
    s.reader._iframeWindow.alert(hfT("saveError"));
  } finally { s.marking = false; }
}

function hfStart(reader) {
  const v = hfView(reader);
  if (!v) return false;
  const s = { reader, ...v, cleanups: [], cache: new Map(), token: 0, timer: null, dragging: false, overlay: null, current: null };
  HF_SESSIONS.set(reader, s);
  hfListen(s, v.doc, "pointermove", e => {
    hfCancel(s);
    if (s.markCandidate && e.buttons && Math.hypot(e.clientX-s.markCandidate.x,e.clientY-s.markCandidate.y)>6) s.markCandidate=null;
    if (e.buttons || hfBusy(s)) { hfClear(s); return; }
    const page = e.target?.closest?.(".page");
    const surface = e.target?.closest?.(".textLayer, .canvasWrapper, canvas, .page");
    const interactive = e.target?.closest?.("a,button,input,textarea,[contenteditable=true],[role=dialog],.popup,.annotation");
    if (!page || !surface || interactive) { hfClear(s); return; }
    const token = s.token, x = e.clientX, y = e.clientY;
    s.timer = v.win.setTimeout(() => { s.timer = null; hfFocus(s, page, x, y, token); }, Number(hfPref("delay")));
  }, { passive: true });
  hfListen(s, v.doc, "pointerdown", e => {
    if (s.current && e.button === 0 && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
      && hfPref("doubleClick") !== "off") {
      s.markCandidate = { focus:s.current, time:Date.now(), x:e.clientX, y:e.clientY };
      if (!hfCandidateAt(s,e)) s.markCandidate=null;
    } else if (!hfCandidateAt(s,e)) s.markCandidate=null;
    s.dragging = true; hfSuspend(s,true);
  }, true);
  hfListen(s, v.doc, "dblclick", e => {
    const action=hfPref("doubleClick"), mark=hfCandidateAt(s,e);
    if (!mark || action === "off") return;
    e.preventDefault(); e.stopPropagation();
    s.markCandidate=null;
    v.view.clearSelection?.();
    hfAnnotate(s,mark.focus,action);
  }, true);
  hfListen(s, v.win, "pointerup", () => { s.dragging = false; }, true);
  hfListen(s, v.doc, "selectionchange", () => { if (hfBusy(s)) hfSuspend(s,true); });
  hfListen(s, v.doc, "scroll", () => hfSuspend(s), { capture: true, passive: true });
  hfListen(s, v.doc, "wheel", () => hfSuspend(s), { passive: true });
  hfListen(s, v.win, "resize", () => hfSuspend(s));
  hfListen(s, v.win, "blur", () => { s.dragging = false; hfSuspend(s); });
  hfListen(s, v.doc, "visibilitychange", () => { if (v.doc.hidden) hfSuspend(s); });
  hfListen(s, v.doc, "pointerleave", () => hfSuspend(s));
  hfListen(s, v.doc, "keydown", e => { if (e.key === "Escape") hfSuspend(s); }, true);
  hfListen(s, v.win, "unload", () => hfStop(reader), { once: true });
  // Reader-level popups can live outside the nested PDF frame.
  const outer = reader._iframeWindow?.document;
  if (outer && outer !== v.doc) {
    hfListen(s, outer, "pointermove", () => hfSuspend(s), { passive: true });
    hfListen(s, outer, "pointerdown", () => hfSuspend(s), true);
  }
  const repaint = () => hfSuspend(s);
  for (const name of ["scalechanging", "rotationchanging", "pagerendered"]) {
    v.app.eventBus.on(name, repaint);
    s.cleanups.push(() => v.app.eventBus.off(name, repaint));
  }
  hfSync(reader);
  return true;
}
function hfStop(reader) {
  const s = HF_SESSIONS.get(reader);
  if (s) {
    HF_SESSIONS.delete(reader);
    hfSuspend(s);
    for (const off of s.cleanups) { try { off(); } catch (_) {} }
    s.cache.clear();
  }
  hfSync(reader);
}
function hfSync(reader) {
  const ui = HF_UI.get(reader);
  if (!ui) return;
  const on = HF_SESSIONS.has(reader);
  ui.toggle.setAttribute("aria-pressed", String(on));
  ui.toggle.title = `Hover Focus · ${hfT(on ? "onState" : "offState")} · ${hfT(hfPref("unit"))}\n${hfT("tooltip")}`;
  ui.toggle.setAttribute("aria-label",ui.toggle.title);
  ui.toggle.style.boxShadow = on ? "0 0 0 2px #002FA7" : "none";
}

function hfSettings(reader, doc, refresh = false) {
  const ui=HF_UI.get(reader);
  if (!ui) return;
  const old=ui.panel;
  const scrollTop=old?.el.querySelector?.(".hf-content")?.scrollTop || 0;
  if (old) { old.close(); if (!refresh) return; }
  const session=HF_SESSIONS.get(reader);
  if (session) hfSuspend(session);
  let panel;
  const close=()=>{
    doc.removeEventListener("pointerdown",outside,true);
    doc.removeEventListener("keydown",escape,true);
    doc.defaultView.removeEventListener("resize",place);
    panel.remove();
    if(ui.panel?.el===panel) ui.panel=null;
  };
  const outside=e=>{if(!panel.contains(e.target) && !ui.toggle.contains(e.target))close();};
  const escape=e=>{if(e.key==="Escape"){e.stopPropagation();close();ui.toggle.focus();}};
  const place=()=>{
    const anchor=ui.toggle.getBoundingClientRect();
    panel.style.left=`${Math.max(8,Math.min(anchor.left,doc.defaultView.innerWidth-330))}px`;
    panel.style.top=`${anchor.bottom+8}px`;
    panel.style.maxHeight=`${Math.max(120,doc.defaultView.innerHeight-anchor.bottom-24)}px`;
  };
  panel=hfPanelUI.build(doc,{t:hfT,pref:hfPref,set:hfSet,close,language:hfLanguage()});
  // Kept for test tooling and a standalone preview, not for cross-frame calls.
  panel.hfClose=close;
  ui.panel={el:panel,close};
  doc.body.append(panel);place();
  doc.addEventListener("pointerdown",outside,true);
  doc.addEventListener("keydown",escape,true);
  doc.defaultView.addEventListener("resize",place);
  if(refresh){
    const content=panel.querySelector?.(".hf-content");if(content)content.scrollTop=scrollTop;
    panel.querySelector?.('[data-hf-setting="language"]')?.focus();
  } else panel.focus();
}
function hfPlace(ui) {
  const center=ui.doc.querySelector(".toolbar .center.tools") || ui.doc.querySelector(".toolbar .center");
  if(center && ui.root.parentElement!==center) center.append(ui.root);
  return !!center;
}
function hfAttach(reader, doc, append) {
  if (hfStopped || reader.type && reader.type !== "pdf") return;
  const existing = doc.querySelector("[data-hover-focus-toolbar]");
  if (existing) return;
  const previous = HF_UI.get(reader);
  if (previous) { previous.cleanup?.(); previous.root.remove(); }
  const root = doc.createElement("span"); root.dataset.hoverFocusToolbar = "true";
  root.style.cssText = "display:inline-flex;flex:none;align-items:center;margin-left:8px;padding-left:8px;border-left:1px solid #8884;";
  const toggle = doc.createElement("button"); toggle.className = "toolbar-button";
  toggle.style.cssText = "width:28px;min-width:28px;height:28px;padding:3px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;";
  // Draw directly in the toolbar: no jar: image URL for the reader to reject.
  const icon=hfSVG(doc,"svg",{viewBox:"0 0 512 512",width:22,height:22,"aria-hidden":"true"});
  icon.style.cssText="display:block;width:22px;height:22px;flex:none;opacity:1;";
  const bg=hfSVG(doc,"rect",{width:512,height:512,rx:96});bg.style.cssText="fill:#002FA7 !important;";icon.append(bg);
  for(const [word,y] of [["Hover",238],["Focus",342]]){
    const text=hfSVG(doc,"text",{x:256,y,"text-anchor":"middle"});text.textContent=word;
    text.style.cssText="fill:#fff !important;font-family:Arial,Helvetica,sans-serif;font-size:94px;font-weight:700;";icon.append(text);
  }
  toggle.append(icon);
  toggle.addEventListener("click", e => {
    if (e.altKey || e.ctrlKey || e.metaKey) { hfSettings(reader,doc);return; }
    if (HF_SESSIONS.has(reader)) hfStop(reader);
    else if (!hfStart(reader)) reader._iframeWindow.alert(hfT("unavailable"));
  });
  toggle.addEventListener("contextmenu",e=>{e.preventDefault();e.stopPropagation();hfSettings(reader,doc);});
  root.append(toggle);
  const ui={root,toggle,doc,panel:null};HF_UI.set(reader,ui);
  if(!hfPlace(ui)) append(root);
  // The render hook may fire before the surrounding toolbar mounts.
  const timer=doc.defaultView.setTimeout(()=>{if(!hfStopped && HF_UI.get(reader)===ui)hfPlace(ui);},0);
  hfSync(reader);
  const onUnload = () => {
    ui.panel?.close();hfStop(reader);
    if (HF_UI.get(reader)?.root === root) HF_UI.delete(reader);
  };
  doc.defaultView.addEventListener("unload", onUnload, { once: true });
  ui.cleanup = () => {
    doc.defaultView.clearTimeout(timer);
    doc.defaultView.removeEventListener("unload",onUnload);
    ui.panel?.close();
  };
}

async function startup({ id, rootURI }) {
  hfID = id;
  hfRootURI = rootURI;
  const scope = { Intl };
  Services.scriptloader.loadSubScript(rootURI + "core.js", scope);
  hfCore = scope.HoverFocusCore;
  Services.scriptloader.loadSubScript(rootURI + "locales.js", scope);
  Services.scriptloader.loadSubScript(rootURI + "ui.js", scope);
  hfStrings=scope.HoverFocusLocales;hfPanelUI=scope.HoverFocusUI;
  hfStopped = false;
  hfToolbar = event => { try { hfAttach(event.reader, event.doc, event.append); } catch (e) { hfError(e); } };
  hfSelection = event => { const s = HF_SESSIONS.get(event.reader); if (s) hfSuspend(s,true); };
  await Zotero.uiReadyPromise;
  if (hfStopped) return;
  Zotero.Reader.registerEventListener("renderToolbar", hfToolbar, hfID);
  Zotero.Reader.registerEventListener("renderTextSelectionPopup", hfSelection, hfID);
  for (const reader of Zotero.Reader._readers) {
    try {
      await reader._initPromise;
      if (hfStopped) return;
      const doc = reader._iframeWindow?.document;
      const toolbar = doc?.querySelector(".toolbar .center, .toolbar .end, .toolbar");
      if (toolbar) hfAttach(reader, doc, node => toolbar.append(node));
    } catch (e) { hfError(e); }
  }
}
function shutdown() {
  hfStopped = true;
  for (const reader of [...HF_SESSIONS.keys()]) hfStop(reader);
  for (const ui of HF_UI.values()) {
    ui.cleanup?.(); ui.root.remove();
    ui.panel?.close();
  }
  HF_UI.clear();
  if (hfToolbar) Zotero.Reader.unregisterEventListener("renderToolbar", hfToolbar);
  if (hfSelection) Zotero.Reader.unregisterEventListener("renderTextSelectionPopup", hfSelection);
}
function install() {}
function uninstall() {}
