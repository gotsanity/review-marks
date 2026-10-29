// PROTOTYPE (throwaway). Storage format B: "footnote at end".
//   inline:   {Target}[^r1]
//   at end:   [^r1]: Instruction
//                 continuation lines are indented 4 spaces
// Acts only on notes whose frontmatter has `review-format: B`.
// No tests, no error handling beyond what makes it run.

import {
  App, Editor, MarkdownPostProcessorContext, MarkdownView, Modal, Notice, Plugin, TFile,
  editorLivePreviewField, setIcon,
} from 'obsidian';
import { Prec, Range } from '@codemirror/state';
import {
  Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType,
} from '@codemirror/view';

// ---------- parser (shared by both renderers and the commands) ----------

interface Ann {
  id: string;
  open: number;   // index of '{' (-1 if marker missing)
  close: number;  // index of '}'
  refEnd: number; // end of '[^rN]'
  defFrom: number; // start of '[^rN]:' line (-1 if definition missing)
  defTo: number;   // end of last continuation line
  instruction: string;
}

function codeRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /^(```|~~~)[^\n]*\n[\s\S]*?(^\1[^\n]*$|$(?![\s\S]))/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length]);
  return out;
}

function parse(text: string): Ann[] {
  const code = codeRanges(text);
  const inCode = (i: number) => code.some(([a, b]) => i >= a && i < b);
  const byId = new Map<string, Ann>();
  const get = (id: string) => {
    let a = byId.get(id);
    if (!a) { a = { id, open: -1, close: -1, refEnd: -1, defFrom: -1, defTo: -1, instruction: '' }; byId.set(id, a); }
    return a;
  };

  // Definitions: "[^rN]: first line" plus indented continuation lines.
  const lines = text.split('\n');
  const starts: number[] = [];
  let off = 0;
  for (const l of lines) { starts.push(off); off += l.length + 1; }
  for (let i = 0; i < lines.length; i++) {
    const m = /^\[\^(r\d+)\]:[ \t]?(.*)$/.exec(lines[i]);
    if (!m || inCode(starts[i])) continue;
    const parts = [m[2]];
    let last = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^( {4}|\t)/.test(lines[j])) { parts.push(lines[j].replace(/^( {4}|\t)/, '')); last = j; continue; }
      if (lines[j].trim() === '' && j + 1 < lines.length && /^( {4}|\t)/.test(lines[j + 1])) { parts.push(''); continue; }
      break;
    }
    const a = get(m[1]);
    a.defFrom = starts[i];
    a.defTo = starts[last] + lines[last].length;
    a.instruction = parts.join('\n').trimEnd();
    i = last;
  }

  // Markers: "}[^rN]" then scan back to the nearest "{" (may cross one line break, not a blank line).
  const re = /\}\[\^(r\d+)\](?!:)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (inCode(m.index)) continue;
    let k = m.index - 1;
    while (k >= 0 && text[k] !== '{' && text[k] !== '}' && !(text[k] === '\n' && text[k - 1] === '\n')) k--;
    if (k < 0 || text[k] !== '{') continue;
    const a = get(m[1]);
    a.open = k; a.close = m.index; a.refEnd = m.index + m[0].length;
  }
  return [...byId.values()].sort((x, y) => (x.open < 0 ? 1e12 : x.open) - (y.open < 0 ? 1e12 : y.open));
}

function isFormatB(text: string): boolean {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return !!fm && /^review-format:\s*["']?B["']?\s*$/m.test(fm[1]);
}

function nextId(anns: Ann[]): string {
  let max = 0;
  for (const a of anns) max = Math.max(max, parseInt(a.id.slice(1), 10));
  return 'r' + (max + 1);
}

function defText(id: string, instruction: string): string {
  return instruction.split('\n')
    .map((l, i) => (i === 0 ? `[^${id}]: ${l}` : l.trim() === '' ? '' : '    ' + l))
    .join('\n');
}

function excerpt(s: string, n = 32): string {
  const first = s.split('\n')[0];
  return first.length > n || s.includes('\n') ? first.slice(0, n).trimEnd() + '…' : first;
}

// ---------- popover (shared) ----------

let pop: HTMLElement | null = null;
let pinned = false;
let hideTimer: number | undefined;

function showPopover(anchor: HTMLElement, a: Ann, pin: boolean) {
  window.clearTimeout(hideTimer);
  if (pop && pinned && !pin) return;
  hidePopover(true);
  pinned = pin;
  pop = document.body.createDiv({ cls: 'proto-b-popover' });
  pop.createDiv({ cls: 'proto-b-popover-head', text: `Instruction [^${a.id}]` + (pin ? '  (tap outside to close)' : '') });
  pop.createDiv({ cls: 'proto-b-popover-body', text: a.instruction || '(no definition found at end of note)' });
  pop.addEventListener('mouseenter', () => window.clearTimeout(hideTimer));
  pop.addEventListener('mouseleave', () => scheduleHide());
  const r = anchor.getBoundingClientRect();
  const top = r.bottom + 6 + pop.offsetHeight > window.innerHeight ? r.top - pop.offsetHeight - 6 : r.bottom + 6;
  pop.setCssProps({ '--proto-b-top': `${Math.max(4, top)}px` });
  pop.setCssProps({ '--proto-b-left': `${Math.max(4, Math.min(r.left, window.innerWidth - pop.offsetWidth - 4))}px` });
}

function scheduleHide() {
  if (pinned) return;
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => hidePopover(false), 200);
}

function hidePopover(force: boolean) {
  if (!pop || (pinned && !force)) return;
  pop.remove();
  pop = null;
  pinned = false;
}

function makeIndicator(a: Ann): HTMLElement {
  const el = createSpan({ cls: 'proto-b-indicator' });
  setIcon(el.createSpan({ cls: 'proto-b-indicator-icon' }), 'message-square');
  el.createSpan({ cls: 'proto-b-indicator-text', text: a.instruction ? excerpt(a.instruction) : `[^${a.id}]?` });
  el.addEventListener('mouseenter', () => showPopover(el, a, false));
  el.addEventListener('mouseleave', () => scheduleHide());
  el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showPopover(el, a, true); });
  return el;
}

// ---------- Live Preview ----------

class IndicatorWidget extends WidgetType {
  constructor(readonly a: Ann) { super(); }
  eq(o: IndicatorWidget) { return o.a.id === this.a.id && o.a.instruction === this.a.instruction; }
  toDOM() { return makeIndicator(this.a); }
  ignoreEvent() { return true; }
}

const hide = Decoration.replace({});

class LivePreviewB {
  decorations: DecorationSet = Decoration.none;
  anns: Ann[] = [];
  constructor(view: EditorView) { this.build(view); }
  update(u: ViewUpdate) {
    if (u.docChanged || u.selectionSet || u.viewportChanged
      || u.state.field(editorLivePreviewField) !== u.startState.field(editorLivePreviewField)) this.build(u.view);
  }
  build(view: EditorView) {
    const state = view.state;
    const text = state.doc.toString();
    if (!state.field(editorLivePreviewField) || !isFormatB(text)) {
      this.anns = []; this.decorations = Decoration.none; return;
    }
    this.anns = parse(text);
    const sel = state.selection.ranges;
    const out: Range<Decoration>[] = [];
    for (const a of this.anns) {
      // Table rows are drawn by Obsidian's own table widget in Live Preview; CM6 decorations
      // can't reach inside it, so leave them alone (the post processor may catch the rendered cell).
      const inTable = a.open >= 0 && /^\s*\|/.test(state.doc.lineAt(a.open).text);
      if (a.open >= 0 && !inTable) {
        const touched = sel.some((r) => r.from <= a.refEnd && r.to >= a.open);
        const mark = Decoration.mark({
          class: 'proto-b-target' + (touched ? ' proto-b-revealed' : ''),
          attributes: { 'data-proto-b-id': a.id },
        });
        if (a.close > a.open + 1) out.push(mark.range(a.open + 1, a.close));
        if (touched) {
          out.push(Decoration.mark({ class: 'proto-b-syntax' }).range(a.open, a.open + 1));
          out.push(Decoration.mark({ class: 'proto-b-syntax' }).range(a.close, a.refEnd));
        } else {
          out.push(hide.range(a.open, a.open + 1));
          out.push(Decoration.replace({ widget: new IndicatorWidget(a) }).range(a.close, a.refEnd));
        }
      }
      if (a.defFrom >= 0) {
        const l1 = state.doc.lineAt(a.defFrom).number, l2 = state.doc.lineAt(a.defTo).number;
        for (let l = l1; l <= l2; l++) out.push(Decoration.line({ class: 'proto-b-def-line' }).range(state.doc.line(l).from));
      }
    }
    this.decorations = Decoration.set(out, true);
  }
}

const livePreviewB = ViewPlugin.fromClass(LivePreviewB, {
  decorations: (v) => v.decorations,
  eventHandlers: {
    mouseover(e: MouseEvent) {
      const t = (e.target as HTMLElement).closest?.('.proto-b-target[data-proto-b-id]') as HTMLElement | null;
      if (!t || t.hasClass('proto-b-revealed')) return;
      const a = this.anns.find((x) => x.id === t.dataset.protoBId);
      if (a) showPopover(t, a, false);
    },
    mouseout(e: MouseEvent) {
      if ((e.target as HTMLElement).closest?.('.proto-b-target')) scheduleHide();
    },
  },
});

// ---------- Reading view ----------

function textNodes(root: HTMLElement, skip: (n: Node) => boolean): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) if (!skip(n)) out.push(n as Text);
  return out;
}

function wrapSlice(node: Text, start: number, end: number, cls: string): HTMLElement | null {
  if (end <= start) return null;
  let mid = node;
  if (start > 0) mid = node.splitText(start);
  if (end - start < mid.length) mid.splitText(end - start);
  const span = createSpan({ cls });
  mid.parentNode!.insertBefore(span, mid);
  span.appendChild(mid);
  return span;
}

// Find "{...}" in the rendered text right before `sup`. Returns positions in the text-node list.
function locateTarget(el: HTMLElement, sup: HTMLElement) {
  const nodes = textNodes(el, (n) => !!n.parentElement?.closest('sup, .proto-b-indicator, .footnotes'));
  let ci = -1;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].compareDocumentPosition(sup) & Node.DOCUMENT_POSITION_FOLLOWING) ci = i; else break;
  }
  if (ci < 0) return null;
  const cIdx = nodes[ci].data.lastIndexOf('}');
  if (cIdx < 0 || nodes[ci].data.slice(cIdx + 1).trim() !== '') return null;
  let oi = ci, oIdx = nodes[ci].data.lastIndexOf('{', cIdx);
  while (oIdx < 0 && oi > 0) { oi--; oIdx = nodes[oi].data.lastIndexOf('{'); }
  if (oIdx < 0) return null;
  let domText = '';
  for (let k = oi; k <= ci; k++) domText += nodes[k].data.slice(k === oi ? oIdx + 1 : 0, k === ci ? cIdx : undefined);
  return { nodes, oi, oIdx, ci, cIdx, domText };
}

function wrapTarget(loc: NonNullable<ReturnType<typeof locateTarget>>, a: Ann): HTMLElement[] {
  const { nodes, oi, oIdx, ci, cIdx } = loc;
  const targets: HTMLElement[] = [];
  for (let k = ci; k >= oi; k--) {
    const n = nodes[k];
    if (k === ci) wrapSlice(n, cIdx, cIdx + 1, 'proto-b-syntax-hidden');
    const start = k === oi ? oIdx + 1 : 0;
    const end = k === ci ? cIdx : n.length;
    const blank = n.data.slice(start, end).trim() === '' && /^(UL|OL)$/.test(n.parentElement?.tagName ?? '');
    if (!blank) {
      const s = wrapSlice(n, start, end, 'proto-b-target');
      if (s) { s.dataset.protoBId = a.id; targets.push(s); }
    }
    if (k === oi) wrapSlice(n, oIdx, oIdx + 1, 'proto-b-syntax-hidden');
  }
  return targets;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export default class ProtoFormatB extends Plugin {
  async onload() {
    this.registerEditorExtension(Prec.highest(livePreviewB));
    this.registerMarkdownPostProcessor((el, ctx) => this.postProcess(el, ctx));
    this.registerDomEvent(document, 'click', (e) => {
      if (pop && !pop.contains(e.target as Node)) hidePopover(true);
    });

    this.addCommand({
      id: 'annotate-selection',
      name: 'Prototype: annotate selection',
      editorCallback: (editor, view) => this.annotate(editor),
    });
    this.addCommand({
      id: 'edit-instruction-at-cursor',
      name: 'Prototype: edit instruction at cursor',
      editorCallback: (editor) => this.editAtCursor(editor),
    });
  }

  onunload() { hidePopover(true); }

  async postProcess(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const fm = ctx.frontmatter ?? this.app.metadataCache.getCache(ctx.sourcePath)?.frontmatter;
    if (String(fm?.['review-format'] ?? '') !== 'B') return;
    const info = ctx.getSectionInfo(el);
    let text = info?.text;
    if (text == null) {
      const f = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!(f instanceof TFile)) return;
      text = await this.app.vault.cachedRead(f);
    }
    text = text.replace(/\r\n/g, '\n');
    const anns = parse(text);
    const byId = new Map(anns.map((a) => [a.id, a]));

    // 1. Footnote references Obsidian rendered in this section.
    const sups = Array.from(el.querySelectorAll('sup')).filter(
      (s) => s.hasClass('footnote-ref') || s.hasAttribute('data-footnote-id') || !!s.querySelector('a[href*="fn"]'),
    ) as HTMLElement[];
    let ids: (string | null)[] = [];
    if (info) {
      // Map the nth rendered <sup> to the nth [^label] in this section's source lines.
      const src = text.split('\n').slice(info.lineStart, info.lineEnd + 1).join('\n');
      const re = /\[\^([^\]\s]+)\](?!:)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) ids.push(m[1]);
    }
    const used = new Set<string>();
    sups.forEach((sup, i) => {
      const loc = locateTarget(el, sup);
      if (!loc) return;
      let a = info ? byId.get(ids[i] ?? '') : undefined;
      if (!a) {
        // Fallback with no source positions (e.g. LP table cells, embeds): match on the target's text.
        const d = norm(loc.domText);
        a = anns.find((x) => x.open >= 0 && !used.has(x.id) && d && norm(text!.slice(x.open + 1, x.close)).includes(d));
      }
      if (!a) return;
      used.add(a.id);
      const targets = wrapTarget(loc, a);
      sup.addClass('proto-b-native-ref-hidden');
      const ind = makeIndicator(a);
      sup.after(ind);
      for (const t of targets) {
        t.addEventListener('mouseenter', () => showPopover(t, a!, false));
        t.addEventListener('mouseleave', () => scheduleHide());
        t.addEventListener('click', (e) => { e.stopPropagation(); showPopover(t, a!, true); });
      }
    });

    // 2. Obsidian's own footnote list at the bottom: tag the r-definitions, don't hide them.
    el.querySelectorAll('.footnotes li').forEach((li) => {
      const t = norm(li.textContent ?? '');
      const a = anns.find((x) => x.instruction && t.startsWith(norm(x.instruction.split('\n')[0]).slice(0, 40)));
      if (!a || li.hasClass('proto-b-def-item')) return;
      li.addClass('proto-b-def-item');
      li.prepend(createSpan({ cls: 'proto-b-def-label', text: `review ${a.id}` }));
    });
  }

  annotate(editor: Editor) {
    const text = editor.getValue();
    if (!isFormatB(text)) { new Notice('Prototype B: this note has no "review-format: B".'); return; }
    const sel = editor.getSelection();
    if (!sel) { new Notice('Prototype B: select the Target first.'); return; }
    if (/[{}]/.test(sel)) { new Notice('Prototype B: the selection contains { or }; format B cannot nest or overlap.'); return; }
    if (/\n\s*\n/.test(sel)) { new Notice('Prototype B: the selection crosses a blank line; format B only allows one line break.'); return; }
    const from = editor.getCursor('from'), to = editor.getCursor('to');
    const anns = parse(text);
    const id = nextId(anns);
    new InstructionModal(this.app, `New Instruction [^${id}]`, '', (instr) => {
      // Definition goes right after the last existing r-definition, else at the very end of the note.
      const lastDef = anns.filter((a) => a.defFrom >= 0).sort((x, y) => y.defTo - x.defTo)[0];
      let at: number, ins: string;
      if (lastDef) { at = lastDef.defTo; ins = '\n' + defText(id, instr); }
      else { at = text.length; ins = (text.endsWith('\n') ? '\n' : '\n\n') + defText(id, instr) + '\n'; }
      const atPos = editor.offsetToPos(at);
      // One transaction = one undo step, even though the two changes are far apart.
      editor.transaction({
        changes: [
          { from, to, text: `{${sel}}[^${id}]` },
          { from: atPos, to: atPos, text: ins },
        ],
      });
    }).open();
  }

  editAtCursor(editor: Editor) {
    const text = editor.getValue();
    if (!isFormatB(text)) { new Notice('Prototype B: this note has no "review-format: B".'); return; }
    const off = editor.posToOffset(editor.getCursor());
    const anns = parse(text);
    const a = anns.find((x) => x.open >= 0 && off >= x.open && off <= x.refEnd)
      ?? anns.find((x) => x.defFrom >= 0 && off >= x.defFrom && off <= x.defTo);
    if (!a) { new Notice('Prototype B: no Annotation at the cursor.'); return; }
    if (a.defFrom < 0) { new Notice(`Prototype B: [^${a.id}] has no definition at the end of the note.`); return; }
    new InstructionModal(this.app, `Edit Instruction [^${a.id}]`, a.instruction, (instr) => {
      editor.replaceRange(defText(a.id, instr), editor.offsetToPos(a.defFrom), editor.offsetToPos(a.defTo));
    }).open();
  }
}

class InstructionModal extends Modal {
  constructor(app: App, private heading: string, private initial: string, private onSubmit: (s: string) => void) {
    super(app);
  }
  onOpen() {
    this.titleEl.setText(this.heading);
    const ta = this.contentEl.createEl('textarea', { cls: 'proto-b-textarea' });
    ta.value = this.initial;
    this.contentEl.createDiv({ cls: 'proto-b-hint', text: 'Enter for a new line. Ctrl/Cmd+Enter to save. Extra lines are written indented by 4 spaces.' });
    const submit = () => {
      const v = ta.value.trim();
      if (!v) { new Notice('Prototype B: empty Instruction.'); return; }
      this.close();
      this.onSubmit(v);
    };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
    this.contentEl.createEl('button', { text: 'Save', cls: 'mod-cta' }).addEventListener('click', submit);
    window.setTimeout(() => ta.focus(), 0);
  }
  onClose() { this.contentEl.empty(); }
}
