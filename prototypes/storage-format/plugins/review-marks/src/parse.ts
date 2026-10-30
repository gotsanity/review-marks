// PROTOTYPE (throwaway). Review Marks B+: parser and block/section helpers.
//   inline:      {Target}[^r1]        (the Target may cross blocks: one { ... }[^r1] span)
//   definition:  [^r1]: Comment
//                    continuation lines indented 4 spaces
// Pure functions over the note text (LF line endings). No Obsidian imports here.

export interface Annotation {
  id: string;
  open: number; // index of '{' (-1 if there is a definition but no marker)
  close: number; // index of '}'
  refEnd: number; // end of '[^rN]'
  defFrom: number; // start of the '[^rN]:' line (-1 if the definition is missing)
  defTo: number; // end of the last continuation line (no trailing newline)
  comment: string;
}

export type Placement = 'end-of-section' | 'end-of-note';

export const REVIEW_ID = /^r\d+$/;

export function normalize(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') out.push(i + 1);
  return out;
}

/**
 * Mask of characters where braces and markers mean nothing: frontmatter, fenced code,
 * inline code, %% comments and HTML comments. 1 = ignored.
 */
export function ignoredMask(text: string): Uint8Array {
  const m = new Uint8Array(text.length);
  const fill = (a: number, b: number) => m.fill(1, a, b);
  const fm = /^---\n[\s\S]*?\n---(?=\n|$)/.exec(text);
  if (fm) fill(0, fm[0].length);
  // Fenced code, line by line.
  const starts = lineStarts(text);
  let fence: { ch: string; len: number; from: number } | null = null;
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const e = i + 1 < starts.length ? starts[i + 1] - 1 : text.length;
    const line = text.slice(s, e);
    const f = /^\s*(?:>\s*)*(`{3,}|~{3,})/.exec(line);
    if (!fence) {
      if (f && !(f[1][0] === '`' && line.slice(f.index + f[0].length).includes('`'))) {
        fence = { ch: f[1][0], len: f[1].length, from: s };
      }
    } else if (f && f[1][0] === fence.ch && f[1].length >= fence.len && line.trim().replace(/^(?:>\s*)*/, '').replace(/[`~]/g, '') === '') {
      fill(fence.from, e);
      fence = null;
    }
  }
  if (fence) fill(fence.from, text.length);
  // Inline code: a run of n backticks closed by the next run of exactly n, inside one paragraph.
  const tick = /`+/g;
  let t: RegExpExecArray | null;
  while ((t = tick.exec(text))) {
    if (m[t.index]) continue;
    const n = t[0].length;
    const re = new RegExp('(^|[^`])`{' + n + '}(?!`)', 'g');
    re.lastIndex = t.index + n;
    const c = re.exec(text);
    if (!c) continue;
    const end = c.index + c[1].length + n;
    if (/\n[ \t]*\n/.test(text.slice(t.index, end))) continue;
    fill(t.index, end);
    tick.lastIndex = end;
  }
  // Comments.
  for (const re of [/%%[\s\S]*?%%/g, /<!--[\s\S]*?-->/g]) {
    let c: RegExpExecArray | null;
    while ((c = re.exec(text))) if (!m[c.index]) fill(c.index, c.index + c[0].length);
  }
  return m;
}

/** Every Annotation in the note, sorted by the position of its '{' (definition-only ones last). */
export function parse(text: string): Annotation[] {
  const ign = ignoredMask(text);
  const starts = lineStarts(text);
  const lines = text.split('\n');
  const defs = new Map<string, { from: number; to: number; comment: string }>();
  const inDef = new Uint8Array(text.length);

  for (let i = 0; i < lines.length; i++) {
    const m = /^\[\^(r\d+)\]:[ \t]?(.*)$/.exec(lines[i]);
    if (!m || ign[starts[i]]) continue;
    const parts = [m[2]];
    let last = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^( {4}|\t)/.test(lines[j])) { parts.push(lines[j].replace(/^( {4}|\t)/, '')); last = j; continue; }
      if (lines[j].trim() === '' && j + 1 < lines.length && /^( {4}|\t)/.test(lines[j + 1])) { parts.push(''); continue; }
      break;
    }
    const from = starts[i], to = starts[last] + lines[last].length;
    inDef.fill(1, from, to);
    if (!defs.has(m[1])) defs.set(m[1], { from, to, comment: parts.join('\n').trimEnd() });
    i = last;
  }

  // Braces over the whole document: a stack, so plain {pairs} inside a Target stay balanced.
  const out: Annotation[] = [];
  const seen = new Set<string>();
  const stack: number[] = [];
  const marker = /\}\[\^(r\d+)\](?!:)/y;
  for (let i = 0; i < text.length; i++) {
    if (ign[i] || inDef[i]) continue;
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') { stack.push(i); continue; }
    if (c !== '}') continue;
    const open = stack.pop();
    marker.lastIndex = i;
    const m = marker.exec(text);
    if (!m || open === undefined || seen.has(m[1])) continue;
    seen.add(m[1]);
    const d = defs.get(m[1]);
    out.push({
      id: m[1], open, close: i, refEnd: i + m[0].length,
      defFrom: d ? d.from : -1, defTo: d ? d.to : -1, comment: d ? d.comment : '',
    });
    i += m[0].length - 1;
  }
  out.sort((a, b) => a.open - b.open);
  for (const [id, d] of defs) {
    if (!seen.has(id)) out.push({ id, open: -1, close: -1, refEnd: -1, defFrom: d.from, defTo: d.to, comment: d.comment });
  }
  return out;
}

/** parse() + ignoredMask() for the same text, cached for the last text seen (Reading view calls this per section). */
let cache: { text: string; anns: Annotation[]; ign: Uint8Array } | null = null;
export function analyze(text: string): { anns: Annotation[]; ign: Uint8Array } {
  if (!cache || cache.text !== text) cache = { text, anns: parse(text), ign: ignoredMask(text) };
  return cache;
}

export function nextId(anns: Annotation[]): string {
  let max = 0;
  for (const a of anns) max = Math.max(max, parseInt(a.id.slice(1), 10));
  return 'r' + (max + 1);
}

/** The definition block for a Comment: first line after "[^id]: ", the rest indented 4 spaces. */
export function defText(id: string, comment: string): string {
  return comment.split('\n')
    .map((l, i) => (i === 0 ? `[^${id}]: ${l}` : l.trim() === '' ? '' : '    ' + l))
    .join('\n');
}

export function excerpt(s: string, n: number): string {
  const first = s.split('\n')[0];
  return first.length > n || s.includes('\n') ? first.slice(0, n).trimEnd() + '…' : first;
}

/** ATX headings (outside code), as offsets of their line starts. */
export function headingStarts(text: string, ign = ignoredMask(text)): number[] {
  const out: number[] = [];
  const re = /^#{1,6}(?:[ \t]|$)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (!ign[m.index]) out.push(m.index);
  return out;
}

/** The section an offset is in: from its heading line (or 0) to the next heading of any level (or the end). */
export function sectionAt(text: string, offset: number): { from: number; to: number } {
  const hs = headingStarts(text);
  let from = 0, to = text.length;
  for (const h of hs) {
    if (h <= offset) from = h;
    else { to = h; break; }
  }
  return { from, to };
}

/** Leading list/quote/heading markers and indentation of a line (where a '{' must not go). */
export const BLOCK_PREFIX = /^(?:[ \t]*(?:>[ \t]?|[-*+][ \t]+(?:\[.\][ \t]+)?|\d+[.)][ \t]+))*[ \t]*(?:#{1,6}[ \t]+)?/;
export function blockPrefixLength(line: string): number {
  return (BLOCK_PREFIX.exec(line) ?? [''])[0].length;
}

/** Is this line a table row? (Obsidian draws tables as a widget in Live Preview.) */
export function isTableLine(line: string): boolean {
  return /^\s*\|/.test(line);
}

/**
 * Where a new definition goes, as one insertion into the current text.
 * `targetEnd` is the offset where the Target ends (its '}' or the selection end).
 */
export function planDefinition(text: string, anns: Annotation[], targetEnd: number, placement: Placement, def: string): { at: number; insert: string } {
  if (placement === 'end-of-note') {
    const last = anns.filter((a) => a.defFrom >= 0).sort((a, b) => b.defTo - a.defTo)[0];
    if (last) return { at: last.defTo, insert: '\n' + def };
    let ce = text.length;
    while (ce > 0 && /\s/.test(text[ce - 1])) ce--;
    return { at: ce, insert: (ce > 0 ? '\n\n' : '') + def + (text.slice(ce).includes('\n') ? '' : '\n') };
  }
  const { to: next } = sectionAt(text, targetEnd);
  let ce = next;
  while (ce > 0 && /\s/.test(text[ce - 1])) ce--;
  if (ce < targetEnd) ce = targetEnd;
  const afterDef = anns.some((a) => a.defFrom >= 0 && a.defTo === ce);
  let insert = (afterDef ? '\n' : '\n\n') + def;
  const gapNewlines = (text.slice(ce, next).match(/\n/g) ?? []).length;
  if (next < text.length) { if (gapNewlines < 2) insert += '\n'; }
  else if (gapNewlines === 0) insert += '\n';
  return { at: ce, insert };
}

/** Footnote labels in the order Obsidian numbers them (first reference, defined labels only). */
export function footnoteOrder(text: string): string[] {
  const ign = ignoredMask(text);
  const defined = new Set<string>();
  const dre = /^\[\^([^\]\s]+)\]:/gm;
  let m: RegExpExecArray | null;
  while ((m = dre.exec(text))) if (!ign[m.index]) defined.add(m[1]);
  const out: string[] = [];
  const re = /\[\^([^\]\s]+)\](?!:)/g;
  while ((m = re.exec(text))) {
    if (ign[m.index] || !defined.has(m[1]) || out.includes(m[1])) continue;
    out.push(m[1]);
  }
  return out;
}

/** Offsets of '{' and '}' in [from, to) that render as literal text (for DOM alignment). */
export function renderedBraces(text: string, from: number, to: number, anns: Annotation[], ign = ignoredMask(text)): number[] {
  const out: number[] = [];
  const inDef = (i: number) => anns.some((a) => a.defFrom >= 0 && i >= a.defFrom && i < a.defTo);
  for (let i = from; i < to; i++) {
    const c = text[i];
    if ((c === '{' || c === '}') && !ign[i] && !inDef(i)) out.push(i);
  }
  return out;
}
