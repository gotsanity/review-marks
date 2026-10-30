// PROTOTYPE (throwaway). Commands, and the two write helpers Wave 2 builds on:
//   createAnnotation(editor, from, to, comment)  wraps the Target and writes the definition, one undo step
//   writeComment(editor | file, id, comment)     replaces (or adds) the definition of one Annotation
import { App, Editor, EditorPosition, Notice, Plugin, TFile } from 'obsidian';
import { Annotation, analyze, blockPrefixLength, defText, isTableLine, nextId, normalize, planDefinition } from './parse';
import { settings } from './settings';
import { annotateWithBox, editWithBox } from './comment-box';

let app: App;

export function registerCommands(plugin: Plugin) {
  app = plugin.app;
  plugin.addCommand({
    id: 'annotate-selection',
    name: 'Annotate selection',
    editorCallback: (editor) => {
      const from = editor.getCursor('from'), to = editor.getCursor('to');
      const err = checkTarget(editor.getValue(), editor.posToOffset(from), editor.posToOffset(to));
      if (typeof err === 'string') { new Notice('Review Marks: ' + err); return; }
      annotateWithBox(editor, from, to, true);
    },
  });
  plugin.addCommand({
    id: 'edit-comment-at-cursor',
    name: 'Edit comment at cursor',
    editorCallback: (editor) => {
      const a = annotationAt(editor.getValue(), editor.posToOffset(editor.getCursor('head')));
      if (!a) { new Notice('Review Marks: no annotation at the cursor.'); return; }
      editWithBox(editor, a.id, true);
    },
  });
}

/** The innermost Annotation whose Target, marker or definition contains the offset. */
export function annotationAt(text: string, off: number): Annotation | undefined {
  const { anns } = analyze(text);
  return anns.filter((a) => a.open >= 0 && off >= a.open && off <= a.refEnd).sort((x, y) => (x.refEnd - x.open) - (y.refEnd - y.open))[0]
    ?? anns.find((a) => a.defFrom >= 0 && off >= a.defFrom && off <= a.defTo);
}

/**
 * Adjusts a selection to a valid Target span, or returns why it can't be one.
 * Trims whitespace, keeps '{' after list/quote/heading markers, and refuses spans that start or
 * end in code, cross another Annotation's syntax, include a definition, or leave a table cell.
 */
export function checkTarget(text: string, f: number, t: number): { from: number; to: number } | string {
  if (f > t) [f, t] = [t, f];
  const trim = () => {
    while (f < t && /\s/.test(text[f])) f++;
    while (t > f && /\s/.test(text[t - 1])) t--;
  };
  trim();
  const lineStart = (o: number) => text.lastIndexOf('\n', o - 1) + 1;
  const lineText = (o: number) => { const s = lineStart(o); const e = text.indexOf('\n', s); return text.slice(s, e < 0 ? text.length : e); };
  const pf = blockPrefixLength(lineText(f));
  if (f - lineStart(f) < pf) { f = lineStart(f) + pf; trim(); }
  const lt = lineStart(t);
  if (lt > f && t - lt <= blockPrefixLength(lineText(t))) { t = lt - 1; trim(); }
  if (f >= t) return 'select the text to annotate first.';

  const { anns, ign } = analyze(text);
  if (ign[f] || ign[t - 1]) return 'a Target cannot start or end inside code or a comment.';
  for (const a of anns) {
    if (a.defFrom >= 0 && f < a.defTo && t > a.defFrom) return `the selection includes the comment of [^${a.id}].`;
    if (a.open < 0) continue;
    if ((f > a.close && f < a.refEnd) || (t > a.close && t < a.refEnd)) return `the selection starts or ends inside the marker [^${a.id}].`;
    if ((a.open < f && f < a.refEnd && t > a.refEnd) || (f < a.open && t > a.open && t < a.refEnd)) return `the selection overlaps annotation [^${a.id}].`;
  }
  let depth = 0;
  for (let i = f; i < t; i++) {
    if (ign[i]) continue;
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth < 0) break;
  }
  if (depth !== 0) return 'the selection has an unmatched { or }.';
  if (isTableLine(lineText(f)) || isTableLine(lineText(t))) {
    if (lineStart(f) !== lineStart(t) || /(^|[^\\])\|/.test(text.slice(f, t))) return 'in a table, a Target must stay inside one cell.';
  }
  return { from: f, to: t };
}

/** Wraps the Target and writes the definition in one transaction (one undo step). Returns the new id. */
export function createAnnotation(editor: Editor, from: EditorPosition, to: EditorPosition, comment: string): string | null {
  const text = editor.getValue();
  const r = checkTarget(text, editor.posToOffset(from), editor.posToOffset(to));
  if (typeof r === 'string') { new Notice('Review Marks: ' + r); return null; }
  const { anns } = analyze(text);
  const id = nextId(anns);
  const plan = planDefinition(text, anns, r.to, settings.placement, defText(id, comment));
  // All positions refer to the text before the edit. Same-position inserts are merged in order.
  const ins = new Map<number, string>();
  const put = (at: number, s: string, before = false) => ins.set(at, before ? s + (ins.get(at) ?? '') : (ins.get(at) ?? '') + s);
  put(r.from, '{');
  put(r.to, `}[^${id}]`);
  put(plan.at, plan.insert, plan.at === r.from);
  const changes = [...ins].sort((a, b) => a[0] - b[0]).map(([at, s]) => {
    const p = editor.offsetToPos(at);
    return { from: p, to: p, text: s };
  });
  editor.transaction({ changes });
  return id;
}

function commentChange(text: string, id: string, comment: string): { from: number; to: number; insert: string } | null {
  const { anns } = analyze(text);
  const a = anns.find((x) => x.id === id);
  if (!a) return null;
  if (a.defFrom >= 0) return { from: a.defFrom, to: a.defTo, insert: defText(id, comment) };
  const p = planDefinition(text, anns, a.refEnd, settings.placement, defText(id, comment));
  return { from: p.at, to: p.at, insert: p.insert };
}

/** Replaces the Comment of one Annotation (or adds its missing definition). Editor: one undo step. File: Vault.process. */
export async function writeComment(target: Editor | TFile, id: string, comment: string): Promise<boolean> {
  if (target instanceof TFile) {
    let ok = false;
    await app.vault.process(target, (data) => {
      const crlf = data.includes('\r\n');
      const text = normalize(data);
      const c = commentChange(text, id, comment);
      if (!c) return data;
      ok = true;
      const out = text.slice(0, c.from) + c.insert + text.slice(c.to);
      return crlf ? out.replace(/\n/g, '\r\n') : out;
    });
    return ok;
  }
  const c = commentChange(target.getValue(), id, comment);
  if (!c) return false;
  target.transaction({ changes: [{ from: target.offsetToPos(c.from), to: target.offsetToPos(c.to), text: c.insert }] });
  return true;
}
