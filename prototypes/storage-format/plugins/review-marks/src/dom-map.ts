// PROTOTYPE (throwaway). Maps a DOM selection in rendered markdown (Reading view sections, Live
// Preview's table widget) back to source offsets.
//
// How: mark which source characters render as text (visible), which are markup that may or may
// not render (soft: * _ ~ = ` | # \), and which never render (invisible: list and quote markers,
// link targets, footnote refs, our own { }[^rN], definitions). Then walk the rendered text and
// match each non-space character to the next visible source character, skipping soft markup.
// A selection becomes [first selected char, last selected char + 1], snapped out to whole links.
import { analyze, blockPrefixLength, isTableLine, lineStarts } from './parse';

export interface Slice { el: HTMLElement; from: number; to: number }

const SKIP = 'sup.footnote-ref, .rm-badge, .rm-hidden, .footnotes, section.footnotes, .frontmatter, .metadata-container, '
  + '.internal-embed, .math, .copy-code-button, .table-row-drag-handle, .table-col-drag-handle, .rm-cbox, '
  + '.markdown-preview-pusher, .mod-header, .mod-footer, .embedded-backlinks';

const SOFT = '*_~=`|#\\';

interface Tok { s: number; e: number }

function visibility(text: string, from: number, to: number): { vis: Uint8Array; links: Tok[] } {
  const vis = new Uint8Array(to - from).fill(1);
  const { anns, ign } = analyze(text);
  const set = (a: number, b: number, val: number) => { for (let i = Math.max(a, from); i < Math.min(b, to); i++) vis[i - from] = val; };
  for (let i = from; i < to; i++) if (SOFT.includes(text[i])) vis[i - from] = 2;

  // Lines: block prefixes, table separator rows, fence lines, non-review footnote definitions.
  const starts = lineStarts(text);
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k];
    const e = k + 1 < starts.length ? starts[k + 1] - 1 : text.length;
    if (e < from || s > to) continue;
    const line = text.slice(s, e);
    if (isTableLine(line) && /^[\s|:-]+$/.test(line) && line.includes('-')) set(s, e, 0);
    else if (/^\s*(?:>\s*)*(`{3,}|~{3,})/.test(line)) set(s, e, 0);
    else if (/^\[\^[^\]\s]+\]:/.test(line) && !ign[s]) set(s, e, 0);
    else if (!ign[s]) set(s, s + blockPrefixLength(line), 0);
  }
  const fm = /^---\n[\s\S]*?\n---(?=\n|$)/.exec(text);
  if (fm) set(0, fm[0].length, 0);

  // Our own syntax and definitions.
  for (const a of anns) {
    if (a.open >= 0) { set(a.open, a.open + 1, 0); set(a.close, a.refEnd, 0); }
    if (a.defFrom >= 0) set(a.defFrom, a.defTo, 0);
  }

  const each = (re: RegExp, f: (m: RegExpExecArray) => void) => {
    let m: RegExpExecArray | null;
    re.lastIndex = Math.max(0, from - 2000);
    while ((m = re.exec(text)) && m.index < to) if (!ign[m.index] && m.index + m[0].length > from) f(m);
  };
  const links: Tok[] = [];
  each(/%%[\s\S]*?%%|<!--[\s\S]*?-->/g, (m) => set(m.index, m.index + m[0].length, 0));
  each(/\[\^[^\]\s]+\](?!:)/g, (m) => set(m.index, m.index + m[0].length, 0));
  each(/!\[\[[^\]\n]*\]\]|!\[[^\]\n]*\]\([^)\n]*\)/g, (m) => { set(m.index, m.index + m[0].length, 0); links.push({ s: m.index, e: m.index + m[0].length }); });
  each(/(?<!!)\[\[([^\]\n]*)\]\]/g, (m) => {
    const s = m.index, e = s + m[0].length;
    const bar = /\\?\|/.exec(m[1]);
    set(s, bar ? s + 2 + bar.index + bar[0].length : s + 2, 0);
    set(e - 2, e, 0);
    links.push({ s, e });
  });
  each(/(?<![!\]])\[([^\]\n]*)\]\(([^)\n]*)\)/g, (m) => {
    const s = m.index, e = s + m[0].length;
    set(s, s + 1, 0);
    set(s + 1 + m[1].length, e, 0);
    links.push({ s, e });
  });
  return { vis, links };
}

interface Hit { node: Text; idx: number; off: number }

function textNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      for (let p = n.parentElement; p && p !== root.parentElement; p = p.parentElement) if (p.matches(SKIP)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = w.nextNode())) out.push(n as Text);
  return out;
}

/** Every non-space rendered character in the slice that could be matched to a source offset. */
export function mapSlice(text: string, sl: Slice): Hit[] {
  const { vis } = visibility(text, sl.from, sl.to);
  const chars: { node: Text; idx: number; ch: string }[] = [];
  for (const node of textNodes(sl.el)) for (let i = 0; i < node.data.length; i++) if (!/\s/.test(node.data[i])) chars.push({ node, idx: i, ch: node.data[i] });
  const V = (q: number) => vis[q - sl.from];
  // The next source offset >= q that can show character c, or -1. hard = visible chars skipped on the way.
  const seek = (q: number, c: string, maxHard: number): { at: number; hard: number } => {
    let hard = 0;
    for (; q < sl.to; q++) {
      const m = V(q), sc = text[q];
      if (m === 0 || /\s/.test(sc)) continue;
      if (sc === c) return { at: q, hard };
      if (m === 2) continue;
      if (++hard > maxHard) break;
    }
    return { at: -1, hard };
  };
  const out: Hit[] = [];
  let p = sl.from;
  for (let k = 0; k < chars.length; k++) {
    const r = seek(p, chars[k].ch, 12);
    if (r.at < 0) continue;
    if (r.hard > 0) {
      // Skipping visible source text: only if the next two rendered characters agree.
      let q = r.at + 1, ok = true;
      for (let j = k + 1; j < Math.min(chars.length, k + 3); j++) {
        const n = seek(q, chars[j].ch, 0);
        if (n.at < 0) { ok = false; break; }
        q = n.at + 1;
      }
      if (!ok) continue;
    }
    out.push({ node: chars[k].node, idx: chars[k].idx, off: r.at });
    p = r.at + 1;
  }
  return out;
}

function selected(range: Range, h: Hit): boolean {
  try { return range.comparePoint(h.node, h.idx) === 0 && range.comparePoint(h.node, h.idx + 1) === 0; } catch { return false; }
}

/**
 * Source range of a DOM selection over one or more rendered slices (in document order).
 * Returns a message if nothing selected could be found in the source.
 */
export function mapSelection(text: string, slices: Slice[], range: Range): { from: number; to: number } | string {
  const hit = slices.filter((s) => range.intersectsNode(s.el));
  if (!hit.length) return 'the selection is not in the note text.';
  let from = -1, to = -1;
  for (const sl of hit) {
    const first = mapSlice(text, sl).find((h) => selected(range, h));
    if (first) { from = first.off; break; }
  }
  for (let i = hit.length - 1; i >= 0; i--) {
    const all = mapSlice(text, hit[i]);
    for (let j = all.length - 1; j >= 0; j--) if (selected(range, all[j])) { to = all[j].off + 1; break; }
    if (to >= 0) break;
  }
  if (from < 0 || to <= from) return 'could not find the selected text in the note.';

  return snapRange(text, from, to);
}

/** Moves the ends of a range out of links, and over the backticks of a fully selected code span. */
export function snapRange(text: string, from: number, to: number): { from: number; to: number } {
  const { links } = visibility(text, Math.max(0, from - 1), Math.min(text.length, to + 1));
  for (const l of links) {
    if (from > l.s && from < l.e) from = l.s;
    if (to > l.s && to < l.e) to = l.e;
  }
  const { ign } = analyze(text);
  if (ign[from] && from > 0 && text[from - 1] === '`' && ign[from - 1]) while (from > 0 && text[from - 1] === '`') from--;
  if (to > 0 && ign[to - 1] && text[to] === '`' && ign[to]) while (to < text.length && text[to] === '`') to++;
  return { from, to };
}
