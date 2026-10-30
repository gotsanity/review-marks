// PROTOTYPE (throwaway). Annotate-on-drag: hold the trigger keys (setting), drag-select, release.
// The Annotation is created with an empty Comment and the inline comment box opens under it.
//   Live Preview / Source mode: our own pointer handling (the range is drawn as a decoration), so the editor's native behaviour for the
//     combination (Alt = rectangular selection, Ctrl = extra cursor, Shift = extend) never runs.
//   Live Preview table widget and Reading view: a DOM range, mapped back to source (dom-map.ts).
//     Reading view then switches the leaf to Live Preview, keeping the Target at the same height on screen.
import { App, MarkdownView, Notice, Platform, Plugin } from 'obsidian';
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { DragTrigger, settings } from './settings';
import { isTableLine, lineStarts } from './parse';
import { checkTarget } from './commands';
import { annotateWithBox, commitActiveBox } from './comment-box';
import { Slice, mapSelection, snapRange } from './dom-map';

let app: App;

// While dragging in the editor we only draw the range. Moving the real selection would make Live
// Preview reveal markup (**, ##, link syntax) under the mouse and shift the text mid-drag.
const setDrag = StateEffect.define<{ from: number; to: number } | null>();
const dragMark = Decoration.mark({ class: 'rm-drag-sel' });
const dragField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(v, tr) {
    v = v.map(tr.changes);
    for (const e of tr.effects) if (e.is(setDrag)) v = e.value && e.value.to > e.value.from ? Decoration.set([dragMark.range(e.value.from, e.value.to)]) : Decoration.none;
    return v;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function registerDrag(plugin: Plugin) {
  app = plugin.app;
  plugin.registerEditorExtension(dragField);
  plugin.registerDomEvent(window, 'pointerdown', onDown, { capture: true });
  // If a gesture is running, the compatibility mouse events must not reach the editor either.
  plugin.registerDomEvent(window, 'mousedown', (e) => { if (gesture) swallow(e); }, { capture: true });
}

export function triggerHeld(e: MouseEvent, trig: DragTrigger = settings.dragTrigger): boolean {
  if (trig === 'off') return false;
  const parts = trig.split('-');
  const want = { ctrl: false, meta: false, alt: parts.includes('alt'), shift: parts.includes('shift') };
  if (parts.includes('mod')) { if (Platform.isMacOS) want.meta = true; else want.ctrl = true; }
  if (parts.includes('meta')) want.meta = true;
  return e.ctrlKey === want.ctrl && e.metaKey === want.meta && e.altKey === want.alt && e.shiftKey === want.shift;
}

// @ts-expect-error Obsidian exposes the CM6 EditorView as editor.cm.
const cmOf = (v: MarkdownView): EditorView => v.editor.cm;

function viewOf(t: HTMLElement): MarkdownView | null {
  for (const leaf of app.workspace.getLeavesOfType('markdown')) {
    if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(t)) return leaf.view;
  }
  return null;
}

function swallow(e: Event) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }

let gesture = false;

/** Follows the pointer until it is released. Every pointer and mouse event goes to us, and so does the click after. */
function track(move: (e: PointerEvent) => void, up: (e: PointerEvent) => void) {
  gesture = true;
  const pm = (e: PointerEvent) => { swallow(e); move(e); };
  const mm = (e: MouseEvent) => swallow(e);
  const pu = (e: PointerEvent) => {
    swallow(e);
    window.removeEventListener('pointermove', pm, true);
    window.removeEventListener('pointerup', pu, true);
    window.removeEventListener('pointercancel', pu, true);
    const late = (c: Event) => swallow(c);
    window.addEventListener('mouseup', late, true);
    window.addEventListener('click', late, true);
    window.setTimeout(() => {
      gesture = false;
      window.removeEventListener('mousemove', mm, true);
      window.removeEventListener('mouseup', late, true);
      window.removeEventListener('click', late, true);
    }, 0);
    up(e);
  };
  window.addEventListener('pointermove', pm, true);
  window.addEventListener('mousemove', mm, true);
  window.addEventListener('pointerup', pu, true);
  window.addEventListener('pointercancel', pu, true);
}

function onDown(e: PointerEvent) {
  if (e.button !== 0 || e.pointerType === 'touch' || !triggerHeld(e)) return;
  const t = e.target as HTMLElement | null;
  if (!t?.closest || t.closest('.rm-cbox, .markdown-embed, .rm-badge')) return;
  const view = viewOf(t);
  if (!view?.file) return;
  if (view.getMode() === 'preview') {
    if (!t.closest('.markdown-reading-view .markdown-preview-view')) return;
    swallow(e);
    commitActiveBox();
    domGesture(e, (range) => void readingDone(view, range));
    return;
  }
  const cm = cmOf(view);
  if (!cm || !cm.dom.contains(t) || t.closest('.cm-gutters')) return;
  swallow(e);
  commitActiveBox();
  const widget = t.closest('.cm-table-widget') as HTMLElement | null;
  if (widget) domGesture(e, (range) => tableDone(view, widget, range));
  else editorGesture(e, view, cm);
}

// ---------- Live Preview and Source mode ----------

function editorGesture(e: PointerEvent, view: MarkdownView, cm: EditorView) {
  const at = (ev: PointerEvent) => cm.posAtCoords({ x: ev.clientX, y: ev.clientY }, false);
  const anchor = at(e);
  const show = (head: number | null) => cm.dispatch({ effects: setDrag.of(head === null ? null : { from: Math.min(anchor, head), to: Math.max(anchor, head) }) });
  track(
    (ev) => show(at(ev)),
    (ev) => {
      const head = at(ev);
      show(null);
      if (head === anchor) return;
      const r = snapRange(cm.state.doc.toString(), Math.min(anchor, head), Math.max(anchor, head));
      const ed = view.editor;
      annotateWithBox(ed, ed.offsetToPos(r.from), ed.offsetToPos(r.to), false);
    },
  );
}

// ---------- DOM range (Reading view, Live Preview tables) ----------
// Drawn with the CSS Custom Highlight API rather than the real selection: Obsidian's table widget
// reacts to a selection inside it by opening a cell editor.

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const r = document.caretRangeFromPoint(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const W = window as any;

function domGesture(e: PointerEvent, done: (range: Range) => void) {
  const start = caretAt(e.clientX, e.clientY);
  if (!start) return;
  window.getSelection()?.removeAllRanges();
  const anchor = document.createRange();
  anchor.setStart(start.node, start.offset);
  const range = anchor.cloneRange();
  const draw = () => {
    if (W.CSS?.highlights && W.Highlight) W.CSS.highlights.set('rm-drag', new W.Highlight(range));
    else { const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); }
  };
  const extend = (ev: PointerEvent) => {
    const c = caretAt(ev.clientX, ev.clientY);
    if (!c) return;
    // A Range always runs forwards: put the earlier point first.
    const p = document.createRange();
    p.setStart(c.node, c.offset);
    if (p.compareBoundaryPoints(Range.START_TO_START, anchor) < 0) { range.setStart(c.node, c.offset); range.setEnd(start.node, start.offset); }
    else { range.setStart(start.node, start.offset); range.setEnd(c.node, c.offset); }
    draw();
  };
  track(extend, (ev) => {
    extend(ev);
    W.CSS?.highlights?.delete('rm-drag');
    window.getSelection()?.removeAllRanges();
    if (!range.collapsed) done(range);
  });
}

function tableDone(view: MarkdownView, widget: HTMLElement, range: Range) {
  const cm = cmOf(view);
  let pos: number;
  try { pos = cm.posAtDOM(widget); } catch { return; }
  const doc = cm.state.doc;
  const first = doc.lineAt(pos);
  let last = first;
  while (last.number < doc.lines && isTableLine(doc.line(last.number + 1).text)) last = doc.line(last.number + 1);
  const text = doc.toString();
  const r = mapSelection(text, [{ el: widget, from: first.from, to: last.to }], range);
  if (typeof r === 'string') { new Notice('Review Marks: ' + r); return; }
  const ed = view.editor;
  annotateWithBox(ed, ed.offsetToPos(r.from), ed.offsetToPos(r.to), false);
}

interface PreviewSection { el: HTMLElement; start: { line: number }; end: { line: number } }

async function readingDone(view: MarkdownView, range: Range) {
  const text = view.editor.getValue();
  // Obsidian's preview renderer keeps one entry per rendered block, with its current source lines.
  // @ts-expect-error private API
  const sections = (view.previewMode.renderer?.sections ?? []) as PreviewSection[];
  const starts = lineStarts(text);
  const slices: Slice[] = sections
    .filter((s) => s.el && s.el.isConnected && s.start && !s.el.matches('.mod-header, .mod-footer'))
    .map((s) => ({
      el: s.el,
      from: starts[s.start.line] ?? text.length,
      to: s.end.line + 1 < starts.length ? starts[s.end.line + 1] - 1 : text.length,
    }));
  const r = mapSelection(text, slices, range);
  if (typeof r === 'string') { new Notice('Review Marks: ' + r); return; }
  const ok = checkTarget(text, r.from, r.to);
  if (typeof ok === 'string') { new Notice('Review Marks: ' + ok); return; }

  const y = range.getClientRects()[0]?.top ?? range.getBoundingClientRect().top;
  await view.leaf.setViewState({ type: 'markdown', state: { ...view.getState(), mode: 'source', source: false } });
  const cm = cmOf(view);
  const frame = () => new Promise<void>((res) => window.requestAnimationFrame(() => res()));
  // Put the first line of the Target back where it was on screen. Heights are estimates until drawn,
  // so repeat once the lines are measured.
  for (let i = 0; i < 4; i++) {
    await frame();
    const c = cm.coordsAtPos(ok.from, 1);
    const cur = c ? c.top : cm.documentTop + cm.lineBlockAt(ok.from).top;
    if (Math.abs(cur - y) > 1) cm.scrollDOM.scrollTop += cur - y;
  }
  const ed = view.editor;
  annotateWithBox(ed, ed.offsetToPos(r.from), ed.offsetToPos(r.to), false);
}
