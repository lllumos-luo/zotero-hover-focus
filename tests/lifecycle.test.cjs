const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../core.js');

// A deliberately small reader/DOM double. It verifies our integration contract,
// not real Zotero or AI4Paper compatibility.
class Target {
  constructor(tag='') { this.tag=tag; this.listeners=new Map(); this.children=[]; this.attrs={}; this.style={}; this.dataset={}; this.isConnected=true; this.classList={add(){}}; }
  addEventListener(t,f) { if (!this.listeners.has(t)) this.listeners.set(t,new Set()); this.listeners.get(t).add(f); }
  removeEventListener(t,f) { this.listeners.get(t)?.delete(f); }
  emit(t,e={}) { for (const f of [...this.listeners.get(t)||[]]) f(e); }
  append(...nodes) { for (const n of nodes) { if(n.parent)n.parent.children=n.parent.children.filter(c=>c!==n);this.children.push(n);n.parent=this;n.parentElement=this; } }
  remove() { this.isConnected=false; if (this.parent) this.parent.children=this.parent.children.filter(n=>n!==this); }
  setAttribute(k,v) { this.attrs[k]=String(v); }
  getBoundingClientRect() { return {left:0,top:0,width:600,height:800,right:600,bottom:800}; }
  contains(node) { return node===this || this.children.some(c=>c.contains(node)); }
  focus() {}
  querySelector(selector) {
    const match=n=>selector.startsWith('.')?n.className?.split(' ').includes(selector.slice(1))
      :selector==='[data-hf-setting="language"]'?n.dataset.hfSetting==='language':false;
    const find=n=>n.children.map(c=>match(c)?c:find(c)).find(Boolean);
    return find(this);
  }
}
function fixture() {
  const doc=new Target('document'), win=new Target('window'), outer=new Target('outer');
  doc.body=new Target('body'); doc.hidden=false; doc.hasFocus=()=>true; doc.defaultView=win;
  doc.createElementNS=(_,tag)=>new Target(tag);
  doc.createElement=tag=>new Target(tag);
  doc.createTextNode=text=>{const node=new Target('text');node.textContent=text;return node;};
  const find=(node,predicate)=>predicate(node)?node:node.children.map(c=>find(c,predicate)).find(Boolean);
  doc.getElementById=id=>id==='viewerContainer'?new Target('container'):find(doc.body,n=>n.id===id);
  doc.querySelector=()=>null;
  win.innerWidth=1200;
  win.innerHeight=900;
  let selected=false;
  win.document=doc; win.getSelection=()=>({isCollapsed:!selected});
  let next=0; const timers=new Map();
  win.setTimeout=fn=>{timers.set(++next,fn);return next;}; win.clearTimeout=id=>timers.delete(id);
  const page=new Target('page'); page.dataset.pageNumber='1';
  const textTarget={closest(selector) { if (selector==='.page') return page; if (selector.startsWith('.textLayer')) return this; return null; }};
  const eventBus=new Target(); eventBus.on=eventBus.addEventListener; eventBus.off=eventBus.removeEventListener;
  const viewport={width:600,height:800,transform:[1,0,0,-1,0,800]};
  const chars=[...'First sentence. Next sentence.'].map((c,i)=>({c,rect:[20+i*6,750,26+i*6,760]}));
  let resolvePage;
  const dataPromise=new Promise(resolve=>resolvePage=()=>resolve({chars}));
  win.PDFViewerApplication={pdfDocument:{getPageData:()=>dataPromise},pdfViewer:{getPageView:()=>({div:page,viewport})},eventBus};
  const view={_iframeWindow:win,_tool:{type:'pointer'},_selectionRanges:[]};
  const saved=[];
  view._ensureBasicPageData=async()=>{};
  view.getAnnotationMeta=()=>({sortIndex:'00000|000020|000040',pageLabel:'1'});
  view.clearSelection=()=>{selected=false;view._selectionRanges=[];};
  view._onAddAnnotation=annotation=>saved.push(annotation);
  const reader={_internalReader:{_primaryView:view,_annotationManager:{_annotations:saved}},_iframeWindow:{document:outer,alert:message=>{throw new Error(message);}}};
  const prefs=new Map(), errors=[];
  const context=vm.createContext({Intl,console,Components:{utils:{waiveXrays:x=>x,cloneInto:x=>x}},Zotero:{locale:'zh-CN',Prefs:{get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v)},logError:e=>errors.push(e)}});
  vm.runInContext(fs.readFileSync(require.resolve('../locales.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../ui.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(require.resolve('../bootstrap.js'),'utf8'),context);
  context.core=core; context.reader=reader;
  vm.runInContext('hfCore=core; hfStrings=HoverFocusLocales; hfPanelUI=HoverFocusUI; hfStopped=false; hfStart(reader)',context);
  return {doc,win,view,reader,page,eventBus,errors,context,resolvePage,saved,prefs,textTarget,
    selected:v=>selected=v,
    move:()=>doc.emit('pointermove',{target:textTarget,buttons:0,clientX:30,clientY:45}),
    timers:async()=>{for (const [id,fn] of [...timers]) {timers.delete(id);fn();} await new Promise(r=>setImmediate(r));},
    overlay:()=>doc.body.children.find(n=>n.tag==='svg'),
    stop:()=>vm.runInContext('hfStop(reader)',context)};
}
test('hover paints a mouse-transparent overlay and does not create a selection',async()=>{
  const f=fixture(); f.resolvePage(); f.move(); await f.timers();
  const overlay=f.overlay(); assert.ok(overlay); assert.match(overlay.style.cssText,/pointer-events:none/);
  assert.equal(f.view._selectionRanges.length,0); assert.equal(f.errors.length,0);
  f.doc.emit('pointerdown',{}); assert.equal(f.overlay(),undefined);
  f.stop();
});
function clickEvent(f,extra={}) {
  return {target:f.textTarget,button:0,buttons:0,clientX:30,clientY:45,preventDefault(){this.prevented=true;},stopPropagation(){},...extra};
}
async function doubleClick(f) {
  f.doc.emit('pointerdown',clickEvent(f));f.win.emit('pointerup',{});
  f.doc.emit('pointerdown',clickEvent(f));f.win.emit('pointerup',{});
  const e=clickEvent(f);f.doc.emit('dblclick',e);
  await new Promise(r=>setImmediate(r));return e;
}
test('double-click saves the focused sentence via native annotation callback and avoids duplicates',async()=>{
  const f=fixture();f.resolvePage();f.move();await f.timers();
  const e=await doubleClick(f);assert.equal(e.prevented,true);
  assert.equal(f.saved.length,1);assert.equal(f.saved[0].text,'First sentence.');assert.equal(f.saved[0].type,'highlight');
  assert.equal(f.saved[0].pageLabel,'1');assert.equal(f.saved[0].position.pageIndex,0);
  f.move();await f.timers();await doubleClick(f);assert.equal(f.saved.length,1);f.stop();
});
test('double-click can underline, can be disabled, and respects read-only documents',async()=>{
  for(const [setting,readOnly,count] of [['underline',false,1],['off',false,0],['highlight',true,0]]) {
    const f=fixture();f.prefs.set('extensions.zotero.hoverFocus.doubleClick',setting);f.view._readOnly=readOnly;
    f.resolvePage();f.move();await f.timers();await doubleClick(f);
    assert.equal(f.saved.length,count);if(count)assert.equal(f.saved[0].type,'underline');f.stop();
  }
});
test('double-click without prior focus or after scrolling does not create an annotation',async()=>{
  const f=fixture();f.resolvePage();await doubleClick(f);assert.equal(f.saved.length,0);
  f.move();await f.timers();f.doc.emit('pointerdown',clickEvent(f));f.win.emit('pointerup',{});
  f.doc.emit('scroll',{});f.doc.emit('dblclick',clickEvent(f));await new Promise(r=>setImmediate(r));
  assert.equal(f.saved.length,0);f.stop();
});
test('toolbar contains only inline icon and right-click opens settings with line and annotation controls',()=>{
  const f=fixture();f.context.doc=f.doc;
  vm.runInContext('hfAttach(reader,doc,node=>doc.body.append(node))',f.context);
  const root=f.doc.body.children[0],button=root.children[0];
  assert.equal(root.children.length,1);assert.equal(button.children.length,1);assert.equal(button.children[0].tag,'svg');
  assert.match(button.title,/已开启/);
  button.emit('contextmenu',{preventDefault(){},stopPropagation(){}});
  const panel=f.doc.getElementById('hover-focus-settings');assert.ok(panel);
  const walk=node=>[node,...node.children.flatMap(walk)];
  const line=walk(panel).find(n=>n.textContent==='整行');line.emit('click',{});
  assert.equal(f.prefs.get('extensions.zotero.hoverFocus.unit'),'line');
  const underline=walk(panel).find(n=>n.textContent==='下划线');underline.emit('click',{});
  assert.equal(f.prefs.get('extensions.zotero.hoverFocus.doubleClick'),'underline');
  panel.hfClose();assert.equal(f.doc.getElementById('hover-focus-settings'),undefined);f.stop();
});
test('a pending page analysis cannot repaint after selection starts',async()=>{
  const f=fixture(); f.move(); await f.timers();
  f.doc.emit('pointerdown',{}); f.selected(true); f.resolvePage(); await new Promise(r=>setImmediate(r));
  assert.equal(f.overlay(),undefined); f.stop();
});
test('scroll clears focus, selection blocks it, shutdown removes all view listeners',async()=>{
  const f=fixture(); f.resolvePage(); f.move(); await f.timers(); assert.ok(f.overlay());
  f.doc.emit('scroll',{}); assert.equal(f.overlay(),undefined);
  f.selected(true); f.move(); await f.timers(); assert.equal(f.overlay(),undefined);
  f.selected(false); f.move(); await f.timers(); assert.ok(f.overlay());
  f.stop(); assert.equal(f.overlay(),undefined);
  for (const target of [f.doc,f.win,f.eventBus,f.reader._iframeWindow.document]) {
    assert.equal([...target.listeners.values()].reduce((n,set)=>n+set.size,0),0);
  }
});
test('annotation tools, popups and Reading Mode suppress the overlay',async()=>{
  const f=fixture(); f.resolvePage();
  f.view._tool.type='highlight'; f.move(); await f.timers(); assert.equal(f.overlay(),undefined);
  f.view._tool.type='pointer'; f.view._annotationPopup={}; f.move(); await f.timers(); assert.equal(f.overlay(),undefined);
  f.view._annotationPopup=null; f.reader._internalReader._primarySDTView={}; f.move(); await f.timers(); assert.equal(f.overlay(),undefined);
  f.stop();
});
test('automatic locale follows Zotero, explicit language overrides it and persists',()=>{
  const f=fixture();
  assert.equal(vm.runInContext('hfLanguage()',f.context),'zh');
  f.context.Zotero.locale='en-US';assert.equal(vm.runInContext('hfLanguage()',f.context),'en');
  vm.runInContext('hfSet("language","zh")',f.context);assert.equal(vm.runInContext('hfT("done")',f.context),'完成');
  assert.equal(f.prefs.get('extensions.zotero.hoverFocus.language'),'zh');
  f.context.Zotero.locale='fr-FR';vm.runInContext('hfSet("language","auto")',f.context);assert.equal(vm.runInContext('hfLanguage()',f.context),'en');
  f.context.Zotero.locale='zh-TW';assert.equal(vm.runInContext('hfLanguage()',f.context),'zh');f.stop();
});
test('language switch redraws every open panel and updates tooltip without changing reading settings',()=>{
  const f=fixture();f.context.doc=f.doc;
  vm.runInContext('hfAttach(reader,doc,node=>doc.body.append(node));hfSettings(reader,doc)',f.context);
  const button=f.doc.body.children[0].children[0],old=f.doc.getElementById('hover-focus-settings');
  const select=old.querySelector('[data-hf-setting="language"]');select.value='en';select.emit('change');
  const panel=f.doc.getElementById('hover-focus-settings');assert.notEqual(old,panel);assert.equal(old.isConnected,false);
  assert.equal(panel.attrs.lang,'en');assert.match(button.title,/On/);
  const walk=node=>[node,...node.children.flatMap(walk)];assert.ok(walk(panel).some(n=>n.textContent==='Done'));
  assert.equal(f.prefs.has('extensions.zotero.hoverFocus.dim'),false);
  select.value='zh'; // Setting language through the shared preference path refreshes all readers.
  vm.runInContext('hfSet("language","zh")',f.context);
  assert.match(button.title,/已开启/);f.doc.getElementById('hover-focus-settings').hfClose();f.stop();
});
test('toolbar is placed in the middle tools group when it is present',()=>{
  const f=fixture(),center=new Target('center');f.context.doc=f.doc;
  f.doc.querySelector=selector=>selector==='.toolbar .center.tools'?center:null;
  vm.runInContext('hfAttach(reader,doc,()=>{throw new Error("must not use right-hand fallback")})',f.context);
  assert.equal(center.children.length,1);assert.equal(center.children[0].children[0].children[0].tag,'svg');f.stop();
});
test('both languages have the same complete set of strings',()=>{
  const strings=require('../locales.js');assert.deepEqual(Object.keys(strings.zh).sort(),Object.keys(strings.en).sort());
  for(const group of Object.values(strings))for(const value of Object.values(group))assert.ok(typeof value==='string'&&value.length);
});
