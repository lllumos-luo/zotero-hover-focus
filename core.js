/* Original Hover Focus analysis. No third-party runtime dependencies. */
var HoverFocusCore = (() => {
  "use strict";
  const normalize = r => [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])];
  const valid = r => r && r.length === 4 && Array.from(r).every(Number.isFinite);

  // ICU handles ordinary sentence boundaries; these conservative repairs avoid
  // common scientific abbreviations followed by a capital or a numbered object.
  function ranges(text) {
    // Equal-length masking retains character offsets while hiding numeric
    // citations from ICU. The final marker stays with the preceding sentence.
    const masked = text.replace(/(?<!\d)([.!?][”’"']?)(\s*)(?:\[\d[\d,;–—\-\s]*\]|[⁰¹²³⁴⁵⁶⁷⁸⁹]+|\d+(?:[,–—-]\d+)*)(?=\s*[A-Z])/g,
      match => match[0] + " ".repeat(match.length-1));
    const chunks = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(masked)];
    const out = [];
    for (const part of chunks) {
      const prev = out[out.length - 1];
      const tail = prev ? text.slice(prev[0], prev[1]).trimEnd() : "";
      const repair = /\b(?:Dr|Prof|Mr|Mrs|Ms|Fig|Figs|Eq|Eqs|Sec|Secs|Ref|Refs|Table|Vol|No|pp|vs|cf|al)\.$/i.test(tail)
        || /\b(?:e\.g|i\.e|U\.S|U\.K)\.$/i.test(tail)
        || /\b[A-Z]\.$/.test(tail);
      if (prev && repair) prev[1] = part.index + part.segment.length;
      else out.push([part.index, part.index + part.segment.length]);
    }
    return out;
  }

  function analyze(chars, mode = "sentence") {
    const sentences = [];
    let text = "", map = [], paragraph = [];
    function flush() {
      for (const [start, end] of mode === "line" ? [[0, text.length]] : ranges(text)) {
        const indexes = [...new Set(map.slice(start, end).filter(i => i != null))];
        const rects = [];
        let box = null, previous = null;
        for (const i of indexes) {
          const ch = paragraph[i];
          if (!valid(ch.rect) || !String(ch.c || ch.u || "").trim()) continue;
          const r = normalize(ch.rect);
          const h = Math.max(1, r[3] - r[1]);
          const sameLine = box && previous && !previous.lineBreakAfter
            && Math.abs((r[1] + r[3]) / 2 - (box[1] + box[3]) / 2) < Math.max(h, box[3] - box[1]) * 0.65
            && r[0] - box[2] < h * 3;
          if (sameLine) {
            box[0] = Math.min(box[0], r[0]); box[1] = Math.min(box[1], r[1]);
            box[2] = Math.max(box[2], r[2]); box[3] = Math.max(box[3], r[3]);
          } else { box = r.slice(); rects.push(box); }
          previous = ch;
        }
        if (rects.length) sentences.push({ text: text.slice(start, end).trim(), rects });
      }
      text = ""; map = []; paragraph = [];
    }
    for (const ch of chars || []) {
      if (ch.ignorable) continue;
      const value = String(ch.c || ch.u || "");
      const index = paragraph.push(ch) - 1;
      text += value;
      for (let j = 0; j < value.length; j++) map.push(index);
      if (ch.paragraphBreakAfter || mode === "line" && ch.lineBreakAfter) flush();
      else if (ch.spaceAfter || ch.lineBreakAfter) { text += " "; map.push(null); }
    }
    flush();
    return sentences;
  }

  function transform(rect, matrix) {
    const [a, b, c, d, e, f] = matrix;
    const points = [[rect[0], rect[1]], [rect[0], rect[3]], [rect[2], rect[1]], [rect[2], rect[3]]]
      .map(([x, y]) => [a*x + c*y + e, b*x + d*y + f]);
    return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
      Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
  }

  function hitTest(sentences, x, y, matrix, tolerance = 2) {
    let best = null, distance = Infinity;
    for (const sentence of sentences) {
      for (const rect of sentence.rects) {
        const r = transform(rect, matrix);
        const dx = Math.max(r[0] - x, 0, x - r[2]);
        const dy = Math.max(r[1] - y, 0, y - r[3]);
        const score = dx*dx + dy*dy;
        if (dx <= tolerance && dy <= tolerance && score < distance) { best = sentence; distance = score; }
      }
    }
    return best;
  }

  return { analyze, ranges, transform, hitTest };
})();
if (typeof module !== "undefined") module.exports = HoverFocusCore;
