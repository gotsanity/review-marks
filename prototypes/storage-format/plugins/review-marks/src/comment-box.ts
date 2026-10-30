// PROTOTYPE (throwaway). Inline comment box: a small floating editor anchored under a Target.
// Replaces the comment modal. The editor never scrolls for it; the box follows the Target instead.
//   annotateWithBox(editor, from, to, refocus)  create an Annotation with an empty Comment, then open the box
//   editWithBox(editor, id, refocus)            open the box on an existing Comment
// Enter saves, Shift+Enter is a new line. Esc (or clicking away with nothing typed) cancels; for a new
// Annotation, cancelling removes it again, outside the undo history.
import { Editor, EditorPosition, Platform } from 'obsidian';
import { ChangeSet, Text, Transaction } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { analyze } from './parse';
import { createAnnotation, writeComment } from './commands';
import { hidePopover } from './ui';

// @ts-expect-error Obsidian exposes the CM6 EditorView as editor.cm.
const cmOf = (editor: Editor): EditorView | undefined => editor.cm;

// ---------- change capture (so a cancel can undo exactly what createAnnotation did) ----------

interface Capture { view: EditorView; created: ChangeSet | null; startDoc: Text | null; later: ChangeSet | null; recording: boolean }
const captures = new Set<Capture>();

/** Register with registerEditorExtension. Records the creating transaction and every change after it. */
export const commentBoxExtension = ViewPlugin.define(() => ({
  update(u: ViewUpdate) {
    if (!u.docChanged) return;
    for (const c of captures) {
      if (c.view !== u.view) continue;
      if (c.recording) {
        c.created = c.created ? c.created.compose(u.changes) : u.changes;
        if (!c.startDoc) c.startDoc = u.startState.doc;
      } else c.later = c.later ? c.later.compose(u.changes) : u.changes;
    }
  },
}));

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
  const cap: Capture | null = cm ? { view: cm, created: null, startDoc: null, later: null, recording: true } : null;
  if (cap) captures.add(cap);
  const id = keepScroll(cm, () => createAnnotation(editor, from, to, ''));
  if (cap) cap.recording = false;
  if (!id) { if (cap) captures.delete(cap); return null; }
  open(editor, id, '', true, refocus, cap);
  return id;
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
  foot.createSpan({ cls: 'rm-cbox-hint', text: 'Enter saves · Shift+Enter new line · Esc cancels' });
  const cancelBtn = foot.createEl('button', { cls: 'rm-cbox-btn', text: 'Cancel' });
  const saveBtn = foot.createEl('button', { cls: 'rm-cbox-btn mod-cta', text: 'Save' });

  // The new Target appears under the mouse: keep the hover popover out of the way while typing.
  hidePopover(true);
  document.body.addClass('rm-cbox-open');
  const b: Box = { el, ta, editor, cm: cmOf(editor), id, initial, isNew, refocus, cap, off: [] };
  active = b;

  ta.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); finish(b, 'save'); }
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
  active = null;
  for (const f of b.off) f();
  b.el.remove();
  document.body.removeClass('rm-cbox-open');
  const v = b.ta.value.replace(/\s+$/, '').replace(/^\s*\n/, '');
  const alive = !b.cm || b.cm.dom.isConnected;
  if (alive) {
    if (how === 'cancel' || !v.trim()) { if (b.isNew) removeNew(b); }
    else if (b.isNew || v !== b.initial) keepScroll(b.cm, () => void writeComment(b.editor, b.id, v));
  }
  if (b.cap) captures.delete(b.cap);
  if (alive && b.refocus) b.cm ? b.cm.focus() : b.editor.focus();
}

/** Takes the just-created Annotation out again, without adding an undo step. */
function removeNew(b: Box) {
  const cap = b.cap;
  if (cap && cap.created && cap.startDoc) {
    let inv = cap.created.invert(cap.startDoc);
    if (cap.later) inv = inv.map(cap.later);
    cap.view.dispatch({ changes: inv, annotations: Transaction.addToHistory.of(false) });
    return;
  }
  b.editor.undo();
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
