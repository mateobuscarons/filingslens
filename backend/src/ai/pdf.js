import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs/promises';

const MIN_PARA_CHARS = 150;
const MAX_PARA_CHARS = 400;
const MIN_CHUNK_CHARS = 60;                 // emit-floor after sentence splitting
const NUMBERED_HEADING = /^\d+(\.\d+)*\.?\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß]/;
const CAPS_HEADING = /^[A-ZÄÖÜ][A-ZÄÖÜ \-&,/]{4,}$/;
const NOTE_HEADING = /^Note\s+\d+/;

// Split a flushed paragraph into single-or-double-sentence chunks. Each
// chunk gets its own embedding downstream, so retrieval sees one focused
// topic per row instead of an averaged multi-topic blob.
function splitIntoChunks(text) {
  const parts = text.split(/(?<=[.!?…])\s+(?=[A-ZÄÖÜ"„«])/);
  const chunks = [];
  let buf = '';
  for (const s of parts) {
    if (!buf) { buf = s; continue; }
    if (buf.length < MIN_CHUNK_CHARS) { buf = `${buf} ${s}`; continue; }
    chunks.push(buf);
    buf = s;
  }
  if (buf) {
    if (buf.length >= MIN_CHUNK_CHARS || !chunks.length) chunks.push(buf);
    else chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${buf}`;
  }
  return chunks;
}

export async function extractPages(filePath) {
  const data = await fs.readFile(filePath);
  const doc = await getDocument({ data: new Uint8Array(data), disableFontFace: true }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const lines = textItemsToLines(content.items);
    pages.push({ pageNumber: n, lines });
  }
  return { pageCount: doc.numPages, pages };
}

function textItemsToLines(items) {
  const rows = new Map();
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5]);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x: it.transform[4], str: it.str });
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function paginateToParagraphs(pages) {
  const paragraphs = [];
  let paraIndex = 0;
  let currentSection = 'Unclassified';

  for (const { pageNumber, lines } of pages) {
    let buf = '';
    const flush = () => {
      const text = buf.trim();
      if (text.length >= MIN_PARA_CHARS) {
        for (const chunk of splitIntoChunks(text)) {
          paragraphs.push({ page: pageNumber, index: paraIndex++, section: currentSection, text: chunk });
        }
      }
      buf = '';
    };

    for (const line of lines) {
      if (looksLikeHeading(line)) {
        flush();
        currentSection = line;
        continue;
      }
      const candidate = buf ? `${buf} ${line}` : line;
      if (candidate.length > MAX_PARA_CHARS) {
        flush();
        buf = line;
      } else {
        buf = candidate;
      }
    }
    flush();
  }
  return paragraphs;
}

function looksLikeHeading(line) {
  if (line.length > 80 || line.length < 4) return false;
  return NUMBERED_HEADING.test(line) || CAPS_HEADING.test(line) || NOTE_HEADING.test(line);
}
