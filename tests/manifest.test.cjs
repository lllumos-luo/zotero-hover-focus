const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const manifest = require('../manifest.json');

test('Zotero mandatory installation metadata is present, including update_url', () => {
  const settings = manifest.applications.zotero;
  for (const key of ['id', 'update_url', 'strict_max_version']) assert.ok(settings[key], `Missing ${key}`);
  assert.match(settings.id, /^[a-z0-9-._]*@[a-z0-9-._]+$/i);
  assert.equal(manifest.manifest_version, 2);
  assert.equal(settings.strict_min_version, '10.0');
  assert.equal(settings.strict_max_version, '10.*');
});

test('release update endpoint uses the maintainer repository over HTTPS', () => {
  const value = manifest.applications.zotero.update_url;
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'raw.githubusercontent.com');
  assert.equal(url.pathname, '/lllumos-luo/zotero-hover-focus/main/updates.json');
});

test('all declared icons are packaged source assets with requested label and blue', () => {
  for (const file of Object.values(manifest.icons)) {
    const svg = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.match(svg, /#002FA7/);
    assert.match(svg, />Hover<|>Hover Focus</);
    assert.match(svg, />Focus<|>Hover Focus</);
  }
});

// Execute the actual mandatory-field guard from the installed Zotero 10.0.7
// parser when available. This is narrower than a complete live installation.
const parserPath = path.join(__dirname, '../../work/zotero-hover-inspect/Extension.sys.mjs');
test('installed Zotero parser guard rejects old manifest and accepts new metadata', {skip:!fs.existsSync(parserPath)}, () => {
  const source = fs.readFileSync(parserPath,'utf8');
  const start = source.indexOf('if (this.type == "extension") {', source.indexOf('async parseManifest()'));
  const end = source.indexOf('manifest.browser_specific_settings = undefined;', start);
  assert.ok(start >= 0 && end > start);
  const guard = source.slice(start, end) + '}';
  function validate(m) {
    const errors=[];
    vm.runInNewContext(guard, {manifest:m, type:'extension', manifestError:message=>errors.push(message)});
    return errors;
  }
  const old=JSON.parse(JSON.stringify(manifest)); delete old.applications.zotero.update_url;
  assert.deepEqual(validate(old), ['applications.zotero.update_url not provided']);
  assert.deepEqual(validate(manifest), []);
});

const dbPath=path.join(__dirname,'../../work/zotero-hover-inspect/XPIDatabase.sys.mjs');
test('installed Zotero update security getter accepts this endpoint and rejects data URLs', {skip:!fs.existsSync(dbPath)}, () => {
  const source=fs.readFileSync(dbPath,'utf8');
  const getter=source.match(/get providesUpdatesSecurely\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(getter);
  const check=url=>vm.runInNewContext(`(function(){${getter[1]}}).call({updateURL:url})`,{url});
  assert.equal(check(manifest.applications.zotero.update_url),true);
  assert.equal(check('data:application/json,%7B%7D'),false);
});

test('update manifest matches version, owner, install bounds and packaged hash', () => {
  const crypto=require('node:crypto');
  const update=require('../updates.json').addons[manifest.applications.zotero.id].updates[0];
  assert.equal(update.version,manifest.version);
  assert.equal(update.update_link,`${manifest.homepage_url}/releases/download/v${manifest.version}/hover-focus-${manifest.version}.xpi`);
  assert.equal(update.applications.zotero.strict_max_version,manifest.applications.zotero.strict_max_version);
  const xpi=path.join(__dirname,`../dist/hover-focus-${manifest.version}.xpi`);
  if(fs.existsSync(xpi)) assert.equal(update.update_hash,'sha256:'+crypto.createHash('sha256').update(fs.readFileSync(xpi)).digest('hex'));
});
