// PROTOTYPE (throwaway). Wave 2 slice "convert": move every review definition to the end of the note,
// or to the end of the section its Target ends in. The placement setting only affects new annotations,
// so these two commands are the explicit way to convert an existing note.
//   convertPlacement(text, placement)  pure: the rewritten text plus counts
//   applyPlacement(editor, placement)  one transaction (one undo step), minimal line changes so the
//                                      cursor and scroll position stay put
import { ChangeSet } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Editor, Notice, Plugin } from 'obsidian';
import { Placement, headingStarts, ignoredMask, lineStarts, parse } from './parse';

export function registerConvertCommands(plugin: Plugin) {
  plugin.addCommand({
    id: 'move-comments-to-end-of-note',
    name: 'Move comments to end of note',
    editorCallback: (editor) => applyPlacement(editor, 'end-of-note'),
  });
  plugin.addCommand({
    id: 'move-comments-to-end-of-sections',
    name: 'Move comments to end of sections',
    editorCallback: (editor) => applyPlacement(editor, 'end-of-section'),
  });
}

export interface ConvertResult {
  text: string;
  moved: number; // definitions that have a marker (all of them are rewritten, even if they end up in place)
  orphanDefs: number; // [^rN]: definitions with no marker (or a second definition of an id), left in place
  orphanMarkers: number; // markers with no definition
}

const isBlank = (l: string) => l.trim() === '';

/** Pure: the note text with every review definition that has a marker moved to `placement`. LF text. */
export function convertPlacement(text: string, placement: Placement): ConvertResult | string {
  const anns = parse(text);
  const movable = anns.filter((a) => a.open >= 0 && a.defFrom >= 0).sort((a, b) => a.close - b.close);
  const orphanMarkers = anns.filter((a) => a.open >= 0 && a.defFrom < 0).length;
  let orphanDefs = anns.filter((a) => a.open < 0).length;
  // parse() keeps only the first definition of an id; count the extra ones (they stay where they are).
  const ign = ignoredMask(text);
  let defLines = 0;
  for (let m, re = /^\[\^r\d+\]:/gm; (m = re.exec(text));) if (!ign[m.index]) defLines++;
  orphanDefs += Math.max(0, defLines - movable.length - orphanDefs);
  if (!movable.length) return { text, moved: 0, orphanDefs, orphanMarkers };

  const hadNL = text.endsWith('\n');
  const body = hadNL ? text.slice(0, -1) : text;
  const lines = body.split('\n');
  const starts = lineStarts(body);
  const lineOf = (off: number) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
    return lo;
  };

  // Section of each definition: index into the headings, by where the Target ends ('}'). 0 = before the first heading.
  const heads = headingStarts(text);
  const sectionOf = (off: number) => { let k = 0; for (const h of heads) { if (h <= off) k++; else break; } return k; };

  // 1. Take the definitions out, byte for byte.
  const removed = new Uint8Array(lines.length);
  const blocks = movable.map((a) => {
    const s = lineOf(a.defFrom), e = lineOf(a.defTo);
    removed.fill(1, s, e + 1);
    return { section: sectionOf(a.close), lines: lines.slice(s, e + 1) };
  });

  // 2. Close the gaps: a run of removed and blank lines becomes one blank line between content,
  //    and nothing at the start or end of the note (or if there was no blank line to begin with).
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!removed[i] && !(isBlank(lines[i]) && touchesRemoved(i))) { kept.push(lines[i]); continue; }
    let e = i;
    while (e + 1 < lines.length && (removed[e + 1] || isBlank(lines[e + 1]))) e++;
    const firstBlank = lines.slice(i, e + 1).find((l, j) => !removed[i + j] && isBlank(l));
    if (kept.length && e + 1 < lines.length && firstBlank !== undefined) kept.push(firstBlank);
    i = e;
  }
  function touchesRemoved(i: number): boolean {
    // Is this blank line part of a run of blank lines that touches a removed line?
    for (let j = i; j >= 0 && (removed[j] || isBlank(lines[j])); j--) if (removed[j]) return true;
    for (let j = i; j < lines.length && (removed[j] || isBlank(lines[j])); j++) if (removed[j]) return true;
    return false;
  }

  // 3. Put them back: after the last non-blank line of the note, or of each section.
  const insertAfter = (out: string[], from: number, to: number, defs: string[], beforeHeading: boolean) => {
    let last = to - 1;
    while (last >= from && isBlank(out[last])) last--;
    const gap = out.slice(last + 1, to);
    const add = ['', ...defs, ...(beforeHeading && gap.length === 0 ? [''] : [])];
    out.splice(last + 1, 0, ...add);
    return add.length;
  };

  let out = kept;
  if (placement === 'end-of-note') {
    insertAfter(out, 0, out.length, blocks.flatMap((b) => b.lines), false);
  } else {
    const keptText = out.join('\n') + (hadNL ? '\n' : '');
    const ks = lineStarts(keptText);
    const keptHeads = headingStarts(keptText);
    if (keptHeads.length !== heads.length) return 'the headings changed while moving the comments; nothing was changed.';
    // Line index where each section starts (section 0 starts at line 0).
    const bounds = [0, ...keptHeads.map((h) => ks.indexOf(h)), out.length];
    // Work from the last section back so earlier line indices stay valid.
    for (let k = heads.length; k >= 0; k--) {
      const defs = blocks.filter((b) => b.section === k).flatMap((b) => b.lines);
      if (defs.length) insertAfter(out, bounds[k], bounds[k + 1], defs, k < heads.length);
    }
  }
  return { text: out.join('\n') + (hadNL ? '\n' : ''), moved: movable.length, orphanDefs, orphanMarkers };
}

/** Rewrites the open note in one transaction. Only the lines that change are touched. */
export function applyPlacement(editor: Editor, placement: Placement) {
  const old = editor.getValue();
  const r = convertPlacement(old, placement);
  if (typeof r === 'string') { new Notice('Review Marks: ' + r); return; }
  const orphans: string[] = [];
  if (r.orphanDefs) orphans.push(`${r.orphanDefs} comment${r.orphanDefs === 1 ? '' : 's'} without a marker`);
  if (r.orphanMarkers) orphans.push(`${r.orphanMarkers} marker${r.orphanMarkers === 1 ? '' : 's'} without a comment`);
  const orphanMsg = orphans.length ? ` Left in place: ${orphans.join(' and ')}.` : '';
  const where = placement === 'end-of-note' ? 'the end of the note' : 'the end of their sections';
  if (r.text === old) {
    new Notice(`Review Marks: ${r.moved ? `comments are already at ${where}.` : 'no comments to move.'}${orphanMsg}`);
    return;
  }
  const diff = lineChanges(old, r.text);
  // Obsidian's Editor wraps a CodeMirror EditorView. Dispatch there so the scroll snapshot (top visible
  // line and its offset) rides in the same transaction, mapped through the changes. One undo step.
  const cm = (editor as unknown as { cm?: EditorView }).cm;
  if (cm && typeof cm.scrollSnapshot === 'function') {
    const cs = ChangeSet.of(diff, old.length);
    cm.dispatch({ changes: cs, effects: cm.scrollSnapshot().map(cs), userEvent: 'input.review-marks.convert' });
  } else {
    editor.transaction({ changes: diff.map((c) => ({ from: editor.offsetToPos(c.from), to: editor.offsetToPos(c.to), text: c.insert })) });
  }
  new Notice(`Review Marks: moved ${r.moved} comment${r.moved === 1 ? '' : 's'} to ${where}.${orphanMsg}`);
}

/** Line diff (Myers), as replacements in offsets of `a`. Lines include their '\n'. */
export function lineChanges(a: string, b: string): { from: number; to: number; insert: string }[] {
  const split = (s: string) => s.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const A = split(a), B = split(b);
  const N = A.length, M = B.length, max = N + M, off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let done = false;
  for (let d = 0; d <= max && !done; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && A[x] === B[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= N && y >= M) { done = true; break; }
    }
  }
  // Walk back to get the edit script as (keep | del | ins) steps.
  const ops: ('k' | 'd' | 'i')[] = [];
  let x = N, y = M;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vv = trace[d], k = x - y;
    const prevK = k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1]) ? k + 1 : k - 1;
    const px = d === 0 ? 0 : vv[off + prevK], py = d === 0 ? 0 : px - prevK;
    while (x > px && y > py) { ops.push('k'); x--; y--; }
    if (d > 0) { if (x === px) { ops.push('i'); y--; } else { ops.push('d'); x--; } }
  }
  ops.reverse();
  const starts: number[] = [0];
  for (const l of A) starts.push(starts[starts.length - 1] + l.length);
  const out: { from: number; to: number; insert: string }[] = [];
  let i = 0, j = 0, cur: { from: number; to: number; insert: string } | null = null;
  for (const op of ops) {
    if (op === 'k') { if (cur) { out.push(cur); cur = null; } i++; j++; continue; }
    if (!cur) cur = { from: starts[i], to: starts[i], insert: '' };
    if (op === 'd') { i++; cur.to = starts[i]; } else { cur.insert += B[j]; j++; }
  }
  if (cur) out.push(cur);
  return out;
}
