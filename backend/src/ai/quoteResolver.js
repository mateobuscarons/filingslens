// Given a quote string the LLM emitted and a list of candidate paragraphs,
// find which paragraph contains the quote and return its char offsets.
//
// Two passes:
//   1. Exact substring match on a whitespace-normalized version of the text.
//   2. Longest-common-substring fallback for quotes that drift slightly
//      (curly quotes vs straight, ellipsis vs three dots, etc.).
//
// Returns { paragraph, charStart, charEnd, claimText } or null. Callers
// drop the citation if null — we never fabricate a span.

const MIN_FALLBACK_LEN = 40;

export function resolveQuote(quote, paragraphs) {
  if (!quote || !paragraphs?.length) return null;
  const needleNorm = normalize(quote);
  if (needleNorm.length < 10) return null;

  for (const p of paragraphs) {
    const hit = findInParagraph(p, needleNorm);
    if (hit) return hit;
  }

  // Fallback: longest run of needle that occurs anywhere.
  let best = null;
  for (const p of paragraphs) {
    const lcs = longestCommonSubstring(normalize(p.text), needleNorm);
    if (lcs.length >= MIN_FALLBACK_LEN && (!best || lcs.length > best.lcsLen)) {
      const hit = findInParagraph(p, lcs);
      if (hit) best = { ...hit, lcsLen: lcs.length };
    }
  }
  if (best) { delete best.lcsLen; return best; }
  return null;
}

// Substring search that ignores whitespace differences but reports offsets
// back into the original (un-normalized) paragraph text.
function findInParagraph(paragraph, needleNorm) {
  const text = paragraph.text || '';
  const mapped = buildNormMap(text);
  const idx = mapped.norm.indexOf(needleNorm);
  if (idx === -1) return null;
  const charStart = mapped.toOrig[idx];
  const charEnd = mapped.toOrig[idx + needleNorm.length - 1] + 1;
  return {
    paragraph,
    charStart,
    charEnd,
    claimText: text.slice(charStart, charEnd),
  };
}

// normalize: collapse runs of whitespace to one space, lowercase, replace
// curly quotes / ellipsis variants. Used for matching only.
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

// Produce a normalized version of text plus an index that maps each
// position in the normalized string back to the offset in the original.
function buildNormMap(text) {
  let norm = '';
  const toOrig = [];
  let lastWasSpace = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const lower = ch.toLowerCase();
    if (/\s/.test(ch)) {
      if (!lastWasSpace && norm.length > 0) {
        norm += ' ';
        toOrig.push(i);
      }
      lastWasSpace = true;
    } else {
      let replaced = lower;
      if ('‘’‚‛'.includes(ch)) replaced = "'";
      else if ('“”„‟'.includes(ch)) replaced = '"';
      else if (ch === '…') replaced = '...';
      for (const c of replaced) {
        norm += c;
        toOrig.push(i);
      }
      lastWasSpace = false;
    }
    i++;
  }
  return { norm, toOrig };
}

// Plain O(n*m) LCS — paragraphs are short enough that this is fine.
function longestCommonSubstring(a, b) {
  if (!a || !b) return '';
  let best = '';
  const m = a.length, n = b.length;
  let prev = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const curr = new Array(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best.length) best = a.slice(i - curr[j], i);
      }
    }
    prev = curr;
  }
  return best;
}
