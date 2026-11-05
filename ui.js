/* Shared by Zotero and the standalone layout preview. No reader dependencies. */
var HoverFocusUI = (() => {
  const css = `
#hover-focus-settings { --hf-blue:#002FA7; --hf-bg:#fff; --hf-text:#202327; --hf-muted:#6c717a; --hf-line:#e6e8ed; --hf-track:#f1f3f7;
  position:fixed;z-index:2147483647;width:322px;max-width:calc(100vw - 16px);display:flex;flex-direction:column;
  padding:0;margin:0;border:1px solid var(--hf-line);border-radius:14px;background:var(--hf-bg);color:var(--hf-text);
  box-shadow:0 12px 38px #0002,0 2px 8px #0001;font:13px/1.45 system-ui,-apple-system,sans-serif;text-align:left;overflow:hidden; }
#hover-focus-settings * { box-sizing:border-box; }
#hover-focus-settings .hf-header { padding:18px 20px 13px;flex:none; }
#hover-focus-settings .hf-name { display:block;font-size:17px;font-weight:750;letter-spacing:-.3px;line-height:1.3;color:var(--hf-blue); }
#hover-focus-settings .hf-subtitle { display:block;font-size:12px;color:var(--hf-muted);margin-top:3px; }
#hover-focus-settings .hf-content { padding:0 20px;overflow-y:auto;min-height:0; }
#hover-focus-settings .hf-group { padding:14px 0;border-top:1px solid var(--hf-line);margin:0; }
#hover-focus-settings .hf-title { display:block;margin:0 0 10px;font-size:12px;font-weight:750;line-height:1.4;letter-spacing:.15px;color:var(--hf-text); }
#hover-focus-settings .hf-segments { display:flex !important;flex-direction:row !important;flex-wrap:nowrap !important;gap:3px;padding:3px;border-radius:9px;background:var(--hf-track);width:100%; }
#hover-focus-settings button { appearance:none !important;-moz-appearance:none !important;box-sizing:border-box;font:inherit;cursor:pointer;text-transform:none;letter-spacing:normal; }
#hover-focus-settings .hf-option { display:inline-flex !important;align-items:center;justify-content:center;flex:1 1 0 !important;min-width:0 !important;width:auto !important;
  height:29px !important;margin:0 !important;padding:4px 5px !important;border:0 !important;border-radius:6px !important;
  font-size:12px !important;font-weight:550;white-space:nowrap;background:transparent !important;color:var(--hf-muted) !important;box-shadow:none !important; }
#hover-focus-settings .hf-option[aria-pressed="true"] { background:var(--hf-blue) !important;color:#fff !important;box-shadow:0 1px 3px #0002 !important; }
#hover-focus-settings .hf-option:hover:not([aria-pressed="true"]) { background:#8881 !important;color:var(--hf-text) !important; }
#hover-focus-settings .hf-row { display:flex !important;align-items:center;justify-content:space-between;gap:12px;margin:0;color:var(--hf-text);font-size:12px; }
#hover-focus-settings .hf-control { display:block;margin:0 0 12px; }
#hover-focus-settings .hf-control:last-child { margin-bottom:0; }
#hover-focus-settings output { font:11px/1.5 system-ui;color:var(--hf-muted);font-variant-numeric:tabular-nums;white-space:nowrap; }
#hover-focus-settings input[type="range"] { display:block;width:100%;height:16px;margin:6px 0 0;padding:0;accent-color:var(--hf-blue);cursor:pointer; }
#hover-focus-settings input[type="color"] { appearance:none;width:30px;height:23px;min-width:30px;border:1px solid var(--hf-line);border-radius:6px;padding:2px;background:var(--hf-bg);cursor:pointer; }
#hover-focus-settings .hf-check { display:flex !important;align-items:flex-start;gap:8px;font-size:12px;margin:9px 0 0;color:var(--hf-text); }
#hover-focus-settings input[type="checkbox"] { flex:none;width:14px;height:14px;margin:2px 0 0;accent-color:var(--hf-blue); }
#hover-focus-settings .hf-note { margin:9px 0 0;color:var(--hf-muted);font-size:11px;line-height:1.5; }
#hover-focus-settings select { display:block;width:100%;height:32px;padding:4px 8px;border:1px solid var(--hf-line);border-radius:7px;background:var(--hf-bg);color:var(--hf-text);font:12px system-ui; }
#hover-focus-settings .hf-footer { display:flex;justify-content:flex-end;padding:11px 20px 13px;border-top:1px solid var(--hf-line);flex:none; }
#hover-focus-settings .hf-done { display:inline-flex !important;align-items:center;justify-content:center;flex:none;width:auto !important;min-width:78px;height:32px;padding:5px 17px !important;margin:0 !important;border:0 !important;border-radius:8px !important;background:var(--hf-blue) !important;color:#fff !important;font-size:12px !important;font-weight:650;box-shadow:0 2px 4px #002fa722; }
#hover-focus-settings :is(button,select,input):focus-visible { outline:2px solid #658cff !important;outline-offset:2px; }
@media (prefers-color-scheme:dark) { #hover-focus-settings { --hf-bg:#25272c;--hf-text:#f1f2f5;--hf-muted:#b4b8c2;--hf-line:#41444d;--hf-track:#32353d; } #hover-focus-settings .hf-name { color:#96b1ff; } }
`;
  function build(doc, {t, pref, set, close, language}) {
    function el(tag, cls, text) {
      const node=doc.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;
    }
    const panel=el("div");panel.id="hover-focus-settings";panel.tabIndex=-1;
    panel.setAttribute("role","dialog");panel.setAttribute("aria-label",`Hover Focus · ${t("settings")}`);panel.setAttribute("lang",language);
    const style=el("style");style.textContent=css;panel.append(style);
    const header=el("div","hf-header");header.append(el("span","hf-name","Hover Focus"),el("span","hf-subtitle",t("settings")));panel.append(header);
    const content=el("div","hf-content");panel.append(content);
    function group(key) {
      const section=el("section","hf-group");section.append(el("h3","hf-title",t(key)));content.append(section);return section;
    }
    function segments(parent,key,items) {
      const wrap=el("div","hf-segments");wrap.setAttribute("role","group");wrap.setAttribute("aria-label",t(key==="unit"?"scope":"annotation"));
      const buttons=[];
      const sync=()=>{for(const [button,value]of buttons)button.setAttribute("aria-pressed",String(pref(key)===value));};
      for(const [value,label]of items){const button=el("button","hf-option",t(label));button.type="button";button.addEventListener("click",()=>{set(key,value);sync();});wrap.append(button);buttons.push([button,value]);}
      sync();parent.append(wrap);
    }
    function range(parent,key,title,max,step,suffix) {
      const label=el("label","hf-control"),row=el("span","hf-row"),output=el("output");
      row.append(el("span",null,t(title)),output);
      const input=el("input");input.type="range";input.min="0";input.max=String(max);input.step=String(step);input.value=String(pref(key));
      input.setAttribute("aria-label",t(title));input.dataset.hfSetting=key;
      const update=()=>{output.textContent=input.value+suffix;};
      input.addEventListener("input",()=>{update();set(key,Number(input.value));});update();label.append(row,input);parent.append(label);
    }
    function color(parent,key,title) {
      const label=el("label","hf-row"),input=el("input");input.type="color";input.value=pref(key);input.setAttribute("aria-label",t(title));
      input.addEventListener("input",()=>set(key,input.value));label.append(el("span",null,t(title)),input);parent.append(label);
    }
    segments(group("scope"),"unit",[["sentence","sentence"],["line","line"]]);
    const appearance=group("appearance");range(appearance,"dim","dim",85,1,"%");range(appearance,"tint","tint",40,1,"%");color(appearance,"color","color");
    const behavior=group("behavior");range(behavior,"delay","delay",800,25," ms");
    const check=el("label","hf-check"),keep=el("input");keep.type="checkbox";keep.checked=!!pref("keep");keep.addEventListener("change",()=>set("keep",keep.checked));check.append(keep,el("span",null,t("keep")));behavior.append(check);
    const annotation=group("annotation");segments(annotation,"doubleClick",[["highlight","highlight"],["underline","underline"],["off","off"]]);
    const colorRow=el("div");colorRow.style.marginTop="11px";color(colorRow,"annotationColor","annotationColor");annotation.append(colorRow,el("p","hf-note",t("note")));
    const languages=group("language"),select=el("select");select.setAttribute("aria-label",t("language"));select.dataset.hfSetting="language";
    for(const [value,label]of [["auto",t("auto")],["zh","简体中文"],["en","English"]]){const option=el("option",null,label);option.value=value;select.append(option);}
    select.value=pref("language");select.addEventListener("change",()=>set("language",select.value));languages.append(select);
    const footer=el("div","hf-footer"),done=el("button","hf-done",t("done"));done.type="button";done.addEventListener("click",close);footer.append(done);panel.append(footer);
    return panel;
  }
  return {css,build};
})();
if(typeof module!=="undefined")module.exports=HoverFocusUI;
