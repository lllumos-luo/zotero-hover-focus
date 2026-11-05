const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');

function charsFor(lines, x = 20, y = 750) {
  const chars = [];
  for (const [lineIndex, line] of lines.entries()) {
    for (const [index, c] of [...line].entries()) chars.push({ c, rect: [x+index*6, y-lineIndex*15, x+index*6+6, y-lineIndex*15+10], lineBreakAfter: index === line.length-1 });
  }
  return chars;
}
test('wrapped sentence produces precise boxes on both lines; next sentence excluded', () => {
  const result = core.analyze(charsFor(['This is a long', 'sentence. Next sentence.']));
  assert.deepEqual(result.map(s => s.text), ['This is a long sentence.', 'Next sentence.']);
  assert.equal(result[0].rects.length, 2);
  assert.equal(result[1].rects.length, 1);
  assert.ok(result[0].rects[1][2] < result[1].rects[0][0]);
});
test('scientific abbreviations, initials and decimals stay attached', () => {
  const result = core.analyze(charsFor(['Dr. Smith measured 3.14 units in Fig. 2. Results agree with J. Smith et al. (2024). Next result.']));
  assert.deepEqual(result.map(s => s.text), ['Dr. Smith measured 3.14 units in Fig. 2.', 'Results agree with J. Smith et al. (2024).', 'Next result.']);
});
test('paragraphs without terminal punctuation remain separate', () => {
  const chars = charsFor(['Introduction', 'A complete sentence.']);
  chars[11].paragraphBreakAfter = true;
  assert.deepEqual(core.analyze(chars).map(s => s.text), ['Introduction', 'A complete sentence.']);
});
test('native reading order may continue into another column without a giant hole', () => {
  const left = charsFor(['The sentence continues'], 20, 750);
  const right = charsFor(['in the other column.'], 330, 750);
  const result = core.analyze([...left, ...right]);
  assert.equal(result.length, 1);
  assert.equal(result[0].rects.length, 2);
  assert.ok(result[0].rects[0][2] < 330);
});
test('coordinate conversion supports zoom, rotated pages and nonzero origin', () => {
  assert.deepEqual(core.transform([10,20,30,40], [2,0,0,-2,0,1600]), [20,1520,60,1560]);
  assert.deepEqual(core.transform([10,20,30,40], [0,2,2,0,5,7]), [45,27,85,67]);
});
test('hover in a gutter does not snap to a remote column', () => {
  const result = core.analyze(charsFor(['A sentence.']));
  assert.equal(core.hitTest(result, 200, 755, [1,0,0,1,0,0]), null);
  assert.equal(core.hitTest(result, 25, 755, [1,0,0,1,0,0]), result[0]);
});
test('empty, ignored and invalid characters do not crash', () => {
  assert.deepEqual(core.analyze([]), []);
  assert.deepEqual(core.analyze([{c:'x',ignorable:true},{c:' ',rect:[0,0,1,1]},{c:'x',rect:[NaN,0,1,1]}]), []);
});
test('sentence-final footnotes stay with their sentence instead of joining the paragraph', () => {
  for(const marker of ['16','¹⁶','[16]','[16, 17]','16–18']) {
    const result=core.analyze(charsFor([`Already known.${marker} Similarly, they assume expertise.17 In situations with rules.18 However, uncertainty remains.`]));
    assert.deepEqual(result.map(s=>s.text),[`Already known.${marker}`,'Similarly, they assume expertise.17','In situations with rules.18','However, uncertainty remains.']);
  }
});
test('citation without extraction space and citation before a stop preserve boundaries',()=>{
  const result=core.analyze(charsFor(['Already known.16Similarly, expertise exists¹⁷. However, uncertainty remains.']));
  assert.deepEqual(result.map(s=>s.text),['Already known.16','Similarly, expertise exists¹⁷.','However, uncertainty remains.']);
});
test('decimal followed by a capitalized unit is not a reference marker',()=>{
  assert.deepEqual(core.analyze(charsFor(['We used 3.14 Units of material. Next result.'])).map(s=>s.text),['We used 3.14 Units of material.','Next result.']);
});
test('line mode groups two sentences on a visual line and separates wrapped text',()=>{
  const result=core.analyze(charsFor(['First sentence. Next sentence', 'continues here.']), 'line');
  assert.deepEqual(result.map(s=>s.text),['First sentence. Next sentence','continues here.']);
});
