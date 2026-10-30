// PROTOTYPE (throwaway). Inline comment box: a small floating editor anchored under a Target.
// Replaces the comment modal. The editor never scrolls for it; the box follows the Target instead.
//   annotateWithBox(editor, from, to, refocus)  create an Annotation with an empty Comment, then open the box
//   editWithBox(editor, id, refocus)            open the box on an existing Comment
// Desktop: Enter saves, Shift+Enter is a new line. Mobile: Enter is a new line, only the Save button saves.
// Esc (or clicking away with nothing typed) cancels.
// A new Annotation is first written outside the undo history. Saving takes it out and writes it again,
// with its Comment, as one undo step; cancelling only takes it out. Either way no stray undo step is left.
import { Editor, EditorPosition, Notice, Platform, editorInfoField } from 'obsidian';
import { ChangeSet, Text, Transaction } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { analyze } from './parse';
import { annotationInserts, createAnnotation, writeComment } from './commands';
import { hidePopover, setPendingBadge } from './ui';

// @ts-expect-error Obsidian exposes the CM6 EditorView as editor.cm.
const cmOf = (editor: Editor): EditorView | undefined => editor.cm;

// ---------- change capture (so save and cancel take out exactly the provisional Annotation) ----------

interface Capture { view: EditorView; created: ChangeSet; startDoc: Text; later: ChangeSet | null }
const captures = new Set<Capture>();

/** Register with registerEditorExtension. Records every change made after a provisional Annotation. */
export const commentBoxExtension = ViewPlugin.define(() => ({
  update(u: ViewUpdate) {
    if (!u.docChanged) return;
    for (const c of captures) if (c.view === u.view) c.later = c.later ? c.later.compose(u.changes) : u.changes;
  },
}));

/** The changes that take the provisional Annotation out of the current doc. */
function revertOf(cap: Capture): ChangeSet {
  const inv = cap.created.invert(cap.startDoc);
  return cap.later ? inv.map(cap.later) : inv;
}

/** The Reviewer never moves: Editor.transaction scrolls the selection into view, so undo that. */
function keepScroll<T>(cm: EditorView | undefined, f: () => T): T {
  if (!cm) return f();
  const snap = cm.scrollSnapshot();
  const out = f();
  cm.dispatch({ effects: snap });
  return out;
}

// ---------- the box ----------

interface Box {
  el: HTMLElement;
  ta: HTMLTextAreaElement;
  editor: Editor;
  cm: EditorView | undefined;
  id: string;
  initial: string;
  isNew: boolean;
  refocus: boolean;
  cap: Capture | null;
  off: (() => void)[];
}
let active: Box | null = null;

export function hasActiveBox() { return !!active; }

/** Saves (if there is text) or cancels the open box. Called before a new drag starts. */
export function commitActiveBox() { if (active) finish(active, 'away'); }

export function annotateWithBox(editor: Editor, from: EditorPosition, to: EditorPosition, refocus: boolean): string | null {
  commitActiveBox();
  const cm = cmOf(editor);
  if (!cm) {
    const id = createAnnotation(editor, from, to, '');
    if (id) open(editor, id, '', true, refocus, null);
    return id;
  }
  const startDoc = cm.state.doc;
  const plan = annotationInserts(startDoc.toString(), editor.posToOffset(from), editor.posToOffset(to), '');
  if (typeof plan === 'string') { new Notice('Review Marks: ' + plan); return null; }
  const created = ChangeSet.of(plan.inserts, startDoc.length);
  // The badge shows "…" while the Comment is being typed.
  setPendingBadge(cm.state.field(editorInfoField, false)?.file?.path ?? '', plan.id);
  keepScroll(cm, () => cm.dispatch({ changes: created, annotations: Transaction.addToHistory.of(false) }));
  const cap: Capture = { view: cm, created, startDoc, later: null };
  captures.add(cap);
  open(editor, plan.id, '', true, refocus, cap);
  return plan.id;
}

export function editWithBox(editor: Editor, id: string, refocus: boolean) {
  commitActiveBox();
  const a = analyze(editor.getValue()).anns.find((x) => x.id === id);
  open(editor, id, a?.comment ?? '', false, refocus, null);
}

function open(editor: Editor, id: string, initial: string, isNew: boolean, refocus: boolean, cap: Capture | null) {
  const el = document.body.createDiv({ cls: 'rm-cbox' + (Platform.isMobile ? ' is-mobile' : '') });
  el.createDiv({ cls: 'rm-cbox-head', text: `Comment [^${id}]` });
  const ta = el.createEl('textarea', { cls: 'rm-cbox-input', attr: { rows: '1', placeholder: 'Write a comment…', spellcheck: 'true' } });
  ta.value = initial;
  const foot = el.createDiv({ cls: 'rm-cbox-foot' });
  foot.createSpan({ cls: 'rm-cbox-hint', text: Platform.isMobile ? '' : 'Enter saves · Shift+Enter new line · Esc cancels' });
  const cancelBtn = foot.createEl('button', { cls: 'rm-cbox-btn', text: 'Cancel' });
  const saveBtn = foot.createEl('button', { cls: 'rm-cbox-btn mod-cta', text: 'Save' });

  // The new Target appears under the mouse: keep the hover popover out of the way while typing.
  hidePopover(true);
  document.body.addClass('rm-cbox-open');
  const b: Box = { el, ta, editor, cm: cmOf(editor), id, initial, isNew, refocus, cap, off: [] };
  active = b;

  ta.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    // Mobile: Enter is a new line (the on-screen keyboard has no Shift+Enter); only Save saves.
    if (e.key === 'Enter' && !e.shiftKey && !Platform.isMobile) { e.preventDefault(); e.stopPropagation(); finish(b, 'save'); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(b, 'cancel'); }
  });
  ta.addEventListener('input', () => { grow(ta); place(b); });
  cancelBtn.addEventListener('click', () => finish(b, 'cancel'));
  saveBtn.addEventListener('click', () => finish(b, 'save'));

  const away = (e: Event) => { if (active === b && !el.contains(e.target as Node)) finish(b, 'away'); };
  const reposition = () => place(b);
  document.addEventListener('pointerdown', away, true);
  document.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('scroll', reposition);
  b.off.push(() => {
    document.removeEventListener('pointerdown', away, true);
    document.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    window.visualViewport?.removeEventListener('resize', reposition);
    window.visualViewport?.removeEventListener('scroll', reposition);
  });

  grow(ta);
  place(b);
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(ta.value.length, ta.value.length);
  // Decorations (and the badge) settle a frame or two after the edit.
  let n = 0;
  const settle = () => { if (active !== b) return; place(b); if (++n < 3) window.requestAnimationFrame(settle); };
  window.requestAnimationFrame(settle);
}

function grow(ta: HTMLTextAreaElement) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight + 2, 220) + 'px';
}

function finish(b: Box, how: 'save' | 'cancel' | 'away') {
  if (active !== b) return;
  const v = b.ta.value.replace(/\s+$/, '').replace(/^\s*\n/, '');
  const alive = !b.cm || b.cm.dom.isConnected;
  if (alive && how === 'save' && !b.isNew && !v.trim()) {
    new Notice('Review Marks: the comment is empty. Use unwrap in the annotations sidebar to remove the annotation.');
    return;
  }
  active = null;
  for (const f of b.off) f();
  b.el.remove();
  document.body.removeClass('rm-cbox-open');
  setPendingBadge('', '');
  let caretAt: number | null = null;
  if (alive) {
    if (how === 'cancel' || !v.trim()) { if (b.isNew) removeNew(b); }
    else if (b.isNew && b.cap) caretAt = keepScroll(b.cm, () => commitNew(b, b.cap!, v));
    else if (b.isNew || v !== b.initial) keepScroll(b.cm, () => void writeComment(b.editor, b.id, v));
  }
  if (b.cap) captures.delete(b.cap);
  if (!alive) return;
  if (how === 'save' && caretAt !== null && b.cm) {
    // Back to the note, just after the marker: the syntax stays hidden and nothing scrolls.
    const cm = b.cm, at = caretAt;
    keepScroll(cm, () => { cm.dispatch({ selection: { anchor: at } }); cm.focus(); });
  } else if (b.refocus) b.cm ? b.cm.focus() : b.editor.focus();
}

/** Takes the just-created Annotation out again, without adding an undo step. */
function removeNew(b: Box) {
  if (b.cap) {
    b.cap.view.dispatch({ changes: revertOf(b.cap), annotations: Transaction.addToHistory.of(false) });
    return;
  }
  b.editor.undo();
}

/**
 * Replaces the provisional Annotation (outside the history) with the same Annotation and its Comment,
 * written as one undo step. Returns the offset just after the marker.
 */
function commitNew(b: Box, cap: Capture, v: string): number | null {
  const cm = cap.view;
  const doc = cm.state.doc;
  const a = analyze(doc.toString()).anns.find((x) => x.id === b.id);
  if (a && a.open >= 0) {
    const revert = revertOf(cap);
    const base = revert.apply(doc);
    const plan = annotationInserts(base.toString(), revert.mapPos(a.open + 1, -1), revert.mapPos(a.close, 1), v);
    if (typeof plan !== 'string') {
      cm.dispatch({ changes: revert, annotations: Transaction.addToHistory.of(false) });
      // A userEvent the history never joins with the typing before it.
      cm.dispatch({ changes: plan.inserts, userEvent: 'input.annotate' });
      return analyze(cm.state.doc.toString()).anns.find((x) => x.id === plan.id)?.refEnd ?? null;
    }
  }
  // The provisional Annotation was changed meanwhile: keep it and just write the Comment.
  void writeComment(b.editor, b.id, v);
  return analyze(cm.state.doc.toString()).anns.find((x) => x.id === b.id)?.refEnd ?? null;
}

// ---------- placement ----------

function anchorRect(b: Box): { left: number; top: number; bottom: number } | null {
  const cm = b.cm;
  if (!cm) return null;
  const rects: DOMRect[] = [];
  cm.dom.querySelectorAll(`.rm-target[data-rm-id="${b.id}"]`).forEach((e) => {
    for (const r of Array.from(e.getClientRects())) if (r.width || r.height) rects.push(r);
  });
  if (rects.length) {
    const top = Math.min(...rects.map((r) => r.top)), bottom = Math.max(...rects.map((r) => r.bottom));
    const oneLine = rects.every((r) => Math.abs(r.top - rects[0].top) < 4);
    return { left: oneLine ? rects[0].left : Math.min(...rects.map((r) => r.left)), top, bottom };
  }
  // Source mode (no decorations) or a definition-only Annotation: ask CodeMirror.
  const a = analyze(cm.state.doc.toString()).anns.find((x) => x.id === b.id);
  if (!a) return null;
  const s = a.open >= 0 ? a.open : a.defFrom, e = a.open >= 0 ? a.refEnd : a.defTo;
  const c1 = cm.coordsAtPos(s, 1), c2 = cm.coordsAtPos(e, -1);
  if (!c1 && !c2) return null;
  const top = (c1 ?? c2)!.top, bottom = (c2 ?? c1)!.bottom;
  const left = c1 && c2 && Math.abs(c1.top - c2.top) < 4 ? c1.left : cm.contentDOM.getBoundingClientRect().left;
  return { left, top, bottom };
}

function place(b: Box) {
  if (b.cm && !b.cm.dom.isConnected) { finish(b, 'away'); return; }
  const vv = window.visualViewport;
  const vTop = vv ? vv.offsetTop : 0;
  const vBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const vRight = vv ? vv.offsetLeft + vv.width : window.innerWidth;
  const h = b.el.offsetHeight, w = b.el.offsetWidth;
  const r = anchorRect(b) ?? (() => {
    const s = (b.cm?.scrollDOM ?? document.body).getBoundingClientRect();
    return { left: s.left + 16, top: s.top + s.height / 3, bottom: s.top + s.height / 3 };
  })();
  let top = r.bottom + 4;
  if (top + h > vBottom - 4) {
    const above = r.top - h - 4;
    top = above >= vTop + 4 ? above : vBottom - h - 4; // keep it above the on-screen keyboard
  }
  top = Math.max(vTop + 4, top);
  const left = Math.max(4, Math.min(r.left, vRight - w - 4));
  b.el.setCssProps({ '--rm-top': `${top}px`, '--rm-left': `${left}px` });
}
