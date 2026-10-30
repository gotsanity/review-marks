// PROTOTYPE (throwaway). Live Preview: a StateField of decorations (the syntax can sit far from
// the cursor and Targets cross line breaks, so a ViewPlugin is not enough), plus a scan of
// Obsidian's table widget, whose cells our decorations can't reach.
import { App, MarkdownView, Platform, editorInfoField, editorLivePreviewField } from 'obsidian';
import { EditorState, Prec, Range, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { Annotation, analyze, blockPrefixLength, isTableLine } from './parse';
import { settings, settingsVersion } from './settings';
import { hidePopover, isPopoverPinned, makeBadge, scheduleHide, showPopover } from './ui';
import { decorateRendered } from './render-dom';

/** Dispatch this to force a rebuild (settings changed). */
export const refreshEffect = StateEffect.define<null>();

/** Parsed Annotations of the editor's note. Wave 2 (sidebar) can read this too. */
export const annotationsField = StateField.define<Annotation[]>({
  create: (s) => analyze(s.doc.toString()).anns,
  update: (v, tr) => (tr.docChanged ? analyze(tr.state.doc.toString()).anns : v),
});

// Syntax is revealed only while the editor has focus. Obsidian keeps a table cell's editor
// alive after you click away, with its cursor still inside the Annotation.
const setFocus = StateEffect.define<boolean>();
const focusField = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => { for (const e of tr.effects) if (e.is(setFocus)) v = e.value; return v; },
});
const focusTracker = [
  EditorView.focusChangeEffect.of((_s, focusing) => setFocus.of(focusing)),
  // CodeMirror drops its focus transaction when another one lands first (focus() then setCursor(),
  // as a jump from the sidebar does), and an editor focused before the plugin loaded gets no focus
  // event. So after every update, and on focus and blur, compare the field with the real focus.
  ViewPlugin.define((view) => {
    let pending = false;
    const sync = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (!view.dom.isConnected) return;
        const f = view.hasFocus;
        if (view.state.field(focusField, false) !== f) view.dispatch({ effects: setFocus.of(f) });
      });
    };
    const late = () => window.setTimeout(sync, 0);
    view.contentDOM.addEventListener('focus', late);
    view.contentDOM.addEventListener('blur', late);
    window.requestAnimationFrame(sync);
    return {
      update: (u: ViewUpdate) => { if (u.view.hasFocus !== u.state.field(focusField, false)) sync(); },
      destroy: () => { view.contentDOM.removeEventListener('focus', late); view.contentDOM.removeEventListener('blur', late); },
    };
  }),
];

const sourcePath = (s: EditorState) => s.field(editorInfoField, false)?.file?.path ?? '';

class BadgeWidget extends WidgetType {
  constructor(readonly a: Annotation, readonly path: string, readonly ver: number) { super(); }
  eq(o: BadgeWidget) { return o.a.id === this.a.id && o.a.comment === this.a.comment && o.ver === this.ver; }
  toDOM() { return makeBadge(this.a, this.path); }
  ignoreEvent() { return true; }
}

const hide = Decoration.replace({});
const syntaxMark = Decoration.mark({ class: 'rm-syntax' });

function build(s: EditorState): DecorationSet {
  if (!s.field(editorLivePreviewField, false)) return Decoration.none;
  const doc = s.doc;
  const path = sourcePath(s);
  const out: Range<Decoration>[] = [];
  const table = (pos: number) => isTableLine(doc.lineAt(pos).text);
  for (const a of s.field(annotationsField)) {
    if (a.defFrom >= 0) {
      const l1 = doc.lineAt(a.defFrom).number, l2 = doc.lineAt(a.defTo).number;
      for (let l = l1; l <= l2; l++) out.push(Decoration.line({ class: 'rm-def-line' }).range(doc.line(l).from));
    }
    if (a.open < 0) continue;
    // Revealed while the cursor is inside, from just before '{' up to (not including) just after ']'.
    // A cursor right after the marker leaves the syntax hidden, so typing on after a new annotation is calm.
    const touched = s.field(focusField, false) === true && s.selection.ranges.some((r) => r.from < a.refEnd && r.to >= a.open);
    // Target highlight, split per line; blank lines and table rows (drawn by the widget) skipped.
    const mark = Decoration.mark({ class: 'rm-target' + (touched ? ' rm-revealed' : ''), attributes: { 'data-rm-id': a.id } });
    for (let pos = a.open + 1; pos < a.close;) {
      const line = doc.lineAt(pos);
      const end = Math.min(line.to, a.close);
      if (pos === line.from) pos += blockPrefixLength(line.text); // keep list bullets, quote bars, '#' out
      if (end > pos && !isTableLine(line.text)) out.push(mark.range(pos, end));
      pos = line.to + 1;
    }
    if (!table(a.open)) out.push((touched ? syntaxMark : hide).range(a.open, a.open + 1));
    if (!table(a.close)) {
      if (touched) out.push(syntaxMark.range(a.close, a.refEnd));
      else if (settings.showBadge) out.push(Decoration.replace({ widget: new BadgeWidget(a, path, settingsVersion) }).range(a.close, a.refEnd));
      else out.push(hide.range(a.close, a.refEnd));
    }
  }
  return Decoration.set(out, true);
}

const decoField = StateField.define<DecorationSet>({
  create: build,
  update: (v, tr) => {
    const lp = tr.startState.field(editorLivePreviewField, false) !== tr.state.field(editorLivePreviewField, false);
    if (tr.docChanged || tr.selection || lp || tr.effects.some((e) => e.is(refreshEffect) || e.is(setFocus))) return build(tr.state);
    return v;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const hover = EditorView.domEventHandlers({
  mouseover(e, view) {
    if (!settings.showHover || Platform.isMobile || isPopoverPinned()) return;
    const t = (e.target as HTMLElement).closest?.('.cm-content .rm-target[data-rm-id]') as HTMLElement | null;
    if (!t || t.hasClass('rm-revealed') || t.closest('.cm-table-widget')) return;
    const a = view.state.field(annotationsField).find((x) => x.id === t.dataset.rmId);
    if (a) showPopover(t, a, sourcePath(view.state), false);
  },
  mouseout(e) {
    if ((e.target as HTMLElement).closest?.('.rm-target')) scheduleHide();
  },
  // Clicking or typing into the text puts the cursor in the syntax: drop a hover popover.
  mousedown() { hidePopover(false); },
  keydown() { hidePopover(false); },
  click(e, view) {
    // Mobile has no hover: a tap on the Target opens the popover (and still moves the cursor).
    if (!Platform.isMobile || !settings.showHover) return;
    const t = (e.target as HTMLElement).closest?.('.rm-target[data-rm-id]') as HTMLElement | null;
    const a = t && view.state.field(annotationsField).find((x) => x.id === t.dataset.rmId);
    if (t && a) showPopover(t, a, sourcePath(view.state), true);
  },
});

// Live Preview draws tables as a widget (.cm-table-widget) of rendered HTML. Decorations can't
// reach inside, the footnote ref renders as plain "r8", and post processors don't run there.
// So after each update, map every cell back to its source and decorate the rendered cell.
const tableScan = ViewPlugin.fromClass(class {
  raf = 0;
  constructor(view: EditorView) { this.schedule(view); }
  update(u: ViewUpdate) { this.schedule(u.view); }
  schedule(view: EditorView) {
    window.cancelAnimationFrame(this.raf);
    this.raf = window.requestAnimationFrame(() => scanTables(view));
  }
  destroy() { window.cancelAnimationFrame(this.raf); }
});

function splitCells(line: string, base: number): { from: number; to: number }[] {
  const cells: { from: number; to: number }[] = [];
  let start = 0;
  for (let i = 0; i <= line.length; i++) {
    if (i < line.length && (line[i] !== '|' || line[i - 1] === '\\')) continue;
    cells.push({ from: start, to: i });
    start = i + 1;
  }
  if (/^\s*\|/.test(line)) cells.shift();
  if (/\|\s*$/.test(line)) cells.pop();
  return cells.map((c) => {
    let f = c.from, t = c.to;
    while (f < t && /\s/.test(line[f])) f++;
    while (t > f && /\s/.test(line[t - 1])) t--;
    return { from: base + f, to: base + t };
  });
}

function scanTables(view: EditorView) {
  const s = view.state;
  if (!s.field(editorLivePreviewField, false)) return;
  const anns = s.field(annotationsField).filter((a) => a.open >= 0 && isTableLine(s.doc.lineAt(a.open).text));
  if (!anns.length) return;
  const text = s.doc.toString();
  const path = sourcePath(s);
  view.dom.querySelectorAll('.cm-table-widget').forEach((w) => {
    let pos: number;
    try { pos = view.posAtDOM(w); } catch { return; }
    let line = s.doc.lineAt(pos);
    const rows: { from: number; text: string }[] = [];
    for (let n = line.number; n <= s.doc.lines; n++) {
      line = s.doc.line(n);
      if (!isTableLine(line.text)) break;
      if (n !== s.doc.lineAt(pos).number + 1) rows.push({ from: line.from, text: line.text }); // skip |---|
    }
    const trs = Array.from(w.querySelectorAll('table tr'));
    trs.forEach((tr, r) => {
      const row = rows[r];
      if (!row) return;
      const cells = splitCells(row.text, row.from);
      Array.from(tr.children).forEach((td, c) => {
        const cell = cells[c];
        const wrap = (td.querySelector('.table-cell-wrapper') ?? td) as HTMLElement;
        if (!cell || wrap.querySelector('.cm-editor')) return;
        if (!anns.some((a) => a.open < cell.to && a.refEnd > cell.from)) return;
        const sig = `${settingsVersion}:${text.slice(cell.from, cell.to)}`;
        if (wrap.dataset.rmSig === sig && wrap.querySelector('.rm-hidden')) return;
        wrap.dataset.rmSig = sig;
        decorateRendered(wrap, text, cell.from, cell.to, path);
      });
    });
  });
}

export const livePreviewExtension = [annotationsField, focusField, focusTracker, Prec.highest(decoField), hover, tableScan];

/** Rebuild decorations in every open editor (after a settings change). */
export function refreshLivePreview(app: App) {
  for (const leaf of app.workspace.getLeavesOfType('markdown')) {
    const v = leaf.view;
    if (!(v instanceof MarkdownView)) continue;
    // @ts-expect-error Obsidian exposes the CM6 EditorView as editor.cm.
    const cm = v.editor.cm as EditorView | undefined;
    if (!cm) continue;
    cm.dom.querySelectorAll('.cm-table-widget [data-rm-sig]').forEach((el) => el.removeAttribute('data-rm-sig'));
    cm.dispatch({ effects: refreshEffect.of(null) });
  }
}
