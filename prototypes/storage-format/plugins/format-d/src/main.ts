// PROTOTYPE (throwaway) - storage format D: "callout after block".
//
//   In the text:   {Target text}(r1)
//   After block:   > [!review] r1
//                  > Instruction text
//
// Only acts on notes whose frontmatter has `review-format: D`.
// No tests, no error handling beyond what makes it run.

import { Editor, MarkdownView, Modal, Notice, Plugin, TFile, editorLivePreviewField } from "obsidian";
import { EditorState, Range, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";

// ---------- parsing (shared by Live Preview, Reading view and commands) ----------

const MARKER_RE = /\{([^{}]*)\}\((r\d+)\)/g;
const CALLOUT_HEAD_RE = /^\s*>\s*\[!review\][+-]?\s+(r\d+)\s*$/;
const QUOTE_LINE_RE = /^\s*>/;

type Marker = { id: string; open: number; targetFrom: number; targetTo: number; markerTo: number; target: string };
type Callout = { id: string; from: number; to: number; instruction: string };
type Parsed = { isD: boolean; markers: Marker[]; callouts: Map<string, Callout> };

function isFormatD(text: string): boolean {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return !!m && /^review-format:\s*D\s*$/m.test(m[1]);
}

// Offsets of fenced code blocks and inline code; markers inside them are ignored.
function codeRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  const fence = /^ {0,3}(```|~~~)[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text))) out.push([m.index, m.index + m[0].length]);
  const inline = /`[^`\n]+`|<!--[\s\S]*?-->|%%[\s\S]*?%%/g;
  while ((m = inline.exec(text))) out.push([m.index, m.index + m[0].length]);
  return out;
}

function parse(text: string): Parsed {
  const isD = isFormatD(text);
  const callouts = new Map<string, Callout>();
  const markers: Marker[] = [];
  if (!isD) return { isD, markers, callouts };

  const lines = text.split("\n");
  const lineStart: number[] = [];
  let o = 0;
  for (const l of lines) {
    lineStart.push(o);
    o += l.length + 1;
  }
  for (let i = 0; i < lines.length; i++) {
    const head = CALLOUT_HEAD_RE.exec(lines[i]);
    if (!head) continue;
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && QUOTE_LINE_RE.test(lines[j]) && !CALLOUT_HEAD_RE.test(lines[j])) {
      body.push(lines[j].replace(/^\s*> ?/, "").replace(/\r$/, ""));
      j++;
    }
    const last = j - 1;
    callouts.set(head[1], {
      id: head[1],
      from: lineStart[i],
      to: lineStart[last] + lines[last].replace(/\r$/, "").length,
      instruction: body.join("\n").trim(),
    });
    i = last;
  }

  const skip = codeRanges(text);
  for (const c of callouts.values()) skip.push([c.from, c.to]);
  const re = new RegExp(MARKER_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const at = m.index;
    if (skip.some(([a, b]) => at >= a && at < b)) continue;
    if (/\n\s*\n/.test(m[1])) continue; // never cross a blank line
    markers.push({
      id: m[2],
      open: at,
      targetFrom: at + 1,
      targetTo: at + 1 + m[1].length,
      markerTo: at + m[0].length,
      target: m[1],
    });
  }
  return { isD, markers, callouts };
}

function instructionFor(p: Parsed, id: string): string {
  return p.callouts.get(id)?.instruction ?? `(no "> [!review] ${id}" callout found)`;
}

function calloutText(id: string, instruction: string): string {
  const body = instruction.replace(/\r/g, "").trim().split("\n").map((l) => (l ? `> ${l}` : ">"));
  return [`> [!review] ${id}`, ...body].join("\n");
}

function nextId(p: Parsed): string {
  let max = 0;
  for (const m of p.markers) max = Math.max(max, parseInt(m.id.slice(1)));
  for (const id of p.callouts.keys()) max = Math.max(max, parseInt(id.slice(1)));
  return `r${max + 1}`;
}

// "End of the containing block", by line scanning (the metadata cache is stale while typing).
// Returns the index of the last line the new callout must come after.
function findBlockEnd(lines: string[], L: number): number {
  const blank = (s: string) => s.trim() === "";
  const heading = (s: string) => /^#{1,6}\s/.test(s);
  const table = (s: string) => /^\s*\|/.test(s);
  const listItem = (s: string) => /^\s*([-*+]|\d+[.)])\s/.test(s);
  const fence = (s: string) => /^\s*(```|~~~)/.test(s);
  let end = L;

  if (heading(lines[L])) {
    end = L;
  } else if (table(lines[L])) {
    while (end + 1 < lines.length && table(lines[end + 1])) end++;
  } else if (QUOTE_LINE_RE.test(lines[L])) {
    while (end + 1 < lines.length && QUOTE_LINE_RE.test(lines[end + 1])) end++;
  } else {
    // Walk back to the start of the list (lists may contain blank lines).
    let s = L;
    let inList = false;
    while (s >= 0) {
      if (listItem(lines[s])) inList = true;
      if (s > 0 && blank(lines[s - 1])) {
        let k = s - 1;
        while (k >= 0 && blank(lines[k])) k--;
        if (inList && k >= 0 && (listItem(lines[k]) || /^\s{2,}\S/.test(lines[k]))) { s = k; continue; }
        break;
      }
      s--;
    }
    while (end + 1 < lines.length) {
      const n = lines[end + 1];
      if (blank(n)) {
        if (!inList) break;
        let k = end + 1;
        while (k < lines.length && blank(lines[k])) k++;
        if (k < lines.length && (listItem(lines[k]) || /^\s{2,}\S/.test(lines[k]))) { end = k; continue; }
        break;
      }
      if (heading(n) || fence(n) || (QUOTE_LINE_RE.test(n) && !/^\s{2,}/.test(n))) break;
      if (!inList && listItem(n)) break;
      end++;
    }
  }

  // Stack after any review callouts already sitting after this block.
  for (;;) {
    let k = end + 1;
    while (k < lines.length && blank(lines[k])) k++;
    if (k < lines.length && CALLOUT_HEAD_RE.test(lines[k])) {
      end = k;
      while (end + 1 < lines.length && QUOTE_LINE_RE.test(lines[end + 1]) && !CALLOUT_HEAD_RE.test(lines[end + 1])) end++;
    } else break;
  }
  return end;
}

// ---------- popover (hand-rolled, hover + click/tap) ----------

let plugin: ProtoFormatD;
let pop: HTMLElement | null = null;
let hideTimer: number | null = null;
let pinned = false;

function hidePopover() {
  if (hideTimer) window.clearTimeout(hideTimer);
  hideTimer = null;
  pop?.remove();
  pop = null;
  pinned = false;
}

function scheduleHide() {
  if (pinned) return;
  if (hideTimer) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(hidePopover, 250);
}

function showPopover(anchor: HTMLElement, id: string, instruction: string, pin: boolean) {
  if (pop && pop.dataset.id === id && !pin) {
    if (hideTimer) window.clearTimeout(hideTimer);
    return;
  }
  hidePopover();
  pinned = pin;
  pop = document.body.createDiv({ cls: "proto-d-popover" });
  pop.dataset.id = id;
  pop.createDiv({ cls: "proto-d-popover-title", text: `Review ${id}` });
  pop.createDiv({ cls: "proto-d-popover-body", text: instruction });
  const btn = pop.createEl("button", { text: "Edit instruction" });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    hidePopover();
    plugin.editById(id);
  });
  pop.addEventListener("mouseenter", () => hideTimer && window.clearTimeout(hideTimer));
  pop.addEventListener("mouseleave", scheduleHide);
  const r = anchor.getBoundingClientRect();
  pop.setCssStyles({
    top: `${Math.round(r.bottom + 4)}px`,
    left: `${Math.round(Math.max(4, Math.min(r.left, window.innerWidth - 330)))}px`,
  });
}

function wirePopover(el: HTMLElement, id: string, instruction: () => string) {
  el.addEventListener("mouseenter", () => showPopover(el, id, instruction(), false));
  el.addEventListener("mouseleave", scheduleHide);
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showPopover(el, id, instruction(), true);
  });
}

// ---------- Live Preview ----------

class BadgeWidget extends WidgetType {
  constructor(readonly id: string, readonly instruction: string) {
    super();
  }
  eq(o: BadgeWidget) {
    return o.id === this.id && o.instruction === this.instruction;
  }
  toDOM() {
    const el = createSpan({ cls: "proto-d-badge", text: this.id });
    wirePopover(el, this.id, () => this.instruction);
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

const parsedField = StateField.define<Parsed>({
  create: (s) => parse(s.doc.toString()),
  update: (v, tr) => (tr.docChanged ? parse(tr.state.doc.toString()) : v),
});

function buildDecos(state: EditorState): DecorationSet {
  const p = state.field(parsedField);
  if (!p.isD || !state.field(editorLivePreviewField, false)) return Decoration.none;
  const decos: Range<Decoration>[] = [];
  const sel = state.selection.ranges;
  for (const m of p.markers) {
    const touching = sel.some((r) => r.from <= m.markerTo && r.to >= m.open);
    // One mark per line, skipping list bullets / quote markers on continuation lines (case 11).
    for (let n = state.doc.lineAt(m.targetFrom).number; n <= state.doc.lineAt(m.targetTo).number; n++) {
      const line = state.doc.line(n);
      let a = Math.max(line.from, m.targetFrom);
      if (line.from > m.targetFrom) a = line.from + /^\s*(?:[-*+]|\d+[.)]|>)?\s*/.exec(line.text)![0].length;
      const b = Math.min(line.to, m.targetTo);
      if (b > a) decos.push(Decoration.mark({ class: "proto-d-target", attributes: { "data-proto-d-id": m.id } }).range(a, b));
    }
    if (touching) {
      decos.push(Decoration.mark({ class: "proto-d-syntax" }).range(m.open, m.targetFrom));
      decos.push(Decoration.mark({ class: "proto-d-syntax" }).range(m.targetTo, m.markerTo));
    } else {
      decos.push(Decoration.replace({}).range(m.open, m.targetFrom));
      decos.push(Decoration.replace({ widget: new BadgeWidget(m.id, instructionFor(p, m.id)) }).range(m.targetTo, m.markerTo));
    }
  }
  // Raw callout lines (visible when the cursor is in them) are dimmed.
  for (const c of p.callouts.values()) {
    const first = state.doc.lineAt(c.from).number;
    const last = state.doc.lineAt(c.to).number;
    for (let n = first; n <= last; n++) decos.push(Decoration.line({ class: "proto-d-callout-line" }).range(state.doc.line(n).from));
  }
  return Decoration.set(decos, true);
}

const decoField = StateField.define<DecorationSet>({
  create: buildDecos,
  update: (v, tr) => {
    const lpChanged = tr.state.field(editorLivePreviewField, false) !== tr.startState.field(editorLivePreviewField, false);
    return tr.docChanged || tr.selection || lpChanged ? buildDecos(tr.state) : v;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const noteClass = EditorView.editorAttributes.compute([parsedField], (s) =>
  s.field(parsedField).isD ? { class: "proto-d-note" } : ({} as Record<string, string>)
);

const targetHover = EditorView.domEventHandlers({
  mouseover(e, view) {
    const t = (e.target as HTMLElement).closest?.(".proto-d-target") as HTMLElement | null;
    if (!t) return false;
    const id = t.getAttribute("data-proto-d-id") ?? "";
    showPopover(t, id, instructionFor(view.state.field(parsedField), id), false);
    t.addEventListener("mouseleave", scheduleHide, { once: true });
    return false;
  },
});

// ---------- Reading view ----------

function decorateRendered(el: HTMLElement, p: Parsed) {
  // Callouts: mark them, and show which Target they belong to.
  const callouts = Array.from(el.querySelectorAll<HTMLElement>('.callout[data-callout="review"]'));
  if (el.matches('.callout[data-callout="review"]')) callouts.push(el);
  for (const c of callouts) {
    c.addClass("proto-d-callout");
    const titleEl = c.querySelector(".callout-title-inner");
    const id = titleEl?.textContent?.trim() ?? "";
    const m = p.markers.find((x) => x.id === id);
    if (titleEl && m && !titleEl.querySelector(".proto-d-callout-target")) {
      const snip = m.target.replace(/\s+/g, " ");
      titleEl.createSpan({ cls: "proto-d-callout-target", text: `on "${snip.length > 60 ? snip.slice(0, 57) + "..." : snip}"` });
    }
  }

  // Markers: walk text nodes of the section, match across node boundaries
  // (formatting, wikilinks, and list items inside one section).
  const nodes: Text[] = [];
  const starts: number[] = [];
  let full = "";
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest('code, pre, .callout[data-callout="review"], .proto-d-badge')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n as Text);
    starts.push(full.length);
    full += (n as Text).data;
  }
  type Seg = { from: number; to: number; kind: "hide" | "target" | "marker"; id: string };
  const segs: Seg[] = [];
  const re = new RegExp(MARKER_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(full))) {
    const close = m.index + 1 + m[1].length;
    segs.push({ from: m.index, to: m.index + 1, kind: "hide", id: m[2] });
    segs.push({ from: m.index + 1, to: close, kind: "target", id: m[2] });
    segs.push({ from: close, to: m.index + m[0].length, kind: "marker", id: m[2] });
  }
  if (!segs.length) return;

  nodes.forEach((node, i) => {
    const ns = starts[i];
    const ne = ns + node.data.length;
    const mine = segs.filter((s) => s.from < ne && s.to > ns);
    if (!mine.length) return;
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const s of mine) {
      const a = Math.max(s.from, ns) - ns;
      const b = Math.min(s.to, ne) - ns;
      if (a > pos) frag.append(node.data.slice(pos, a));
      const instr = () => instructionFor(p, s.id);
      const between = /^(UL|OL|TABLE|TBODY|THEAD|TR)$/.test(node.parentElement?.tagName ?? "");
      if (s.kind === "target" && between) {
        frag.append(node.data.slice(a, b)); // whitespace between list items / rows
      } else if (s.kind === "target") {
        const span = createSpan({ cls: "proto-d-target", text: node.data.slice(a, b) });
        wirePopover(span, s.id, instr);
        frag.append(span);
      } else if (s.kind === "marker" && s.from >= ns) {
        const badge = createSpan({ cls: "proto-d-badge", text: s.id });
        wirePopover(badge, s.id, instr);
        frag.append(badge);
      }
      pos = b;
    }
    if (pos < node.data.length) frag.append(node.data.slice(pos));
    node.replaceWith(frag);
  });
}

// ---------- modal ----------

class InstructionModal extends Modal {
  constructor(app: any, private heading: string, private initial: string, private onSubmit: (v: string) => void) {
    super(app);
  }
  onOpen() {
    this.titleEl.setText(this.heading);
    const ta = this.contentEl.createEl("textarea", { cls: "proto-d-textarea" });
    ta.value = this.initial;
    const btn = this.contentEl.createEl("button", { text: "Save (Ctrl+Enter)", cls: "mod-cta" });
    btn.addEventListener("click", () => {
      this.close();
      this.onSubmit(ta.value);
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) btn.click();
    });
    window.setTimeout(() => ta.focus(), 0);
  }
  onClose() {
    this.contentEl.empty();
  }
}

// ---------- plugin ----------

export default class ProtoFormatD extends Plugin {
  async onload() {
    plugin = this;
    this.registerEditorExtension([parsedField, decoField, noteClass, targetHover]);

    this.registerMarkdownPostProcessor(async (el, ctx) => {
      const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!(file instanceof TFile)) return;
      if (this.app.metadataCache.getFileCache(file)?.frontmatter?.["review-format"] !== "D") return;
      const text = ctx.getSectionInfo(el)?.text ?? (await this.app.vault.cachedRead(file));
      decorateRendered(el, parse(text));
    });

    this.registerDomEvent(document, "click", (e) => {
      const t = e.target as HTMLElement;
      if (pop && !pop.contains(t) && !t.closest?.(".proto-d-badge, .proto-d-target")) hidePopover();
    });

    this.addCommand({
      id: "annotate-selection",
      name: "Prototype: annotate selection",
      editorCallback: (editor) => this.annotate(editor),
    });
    this.addCommand({
      id: "edit-instruction-at-cursor",
      name: "Prototype: edit instruction at cursor",
      editorCallback: (editor) => this.editAtCursor(editor),
    });
  }

  onunload() {
    hidePopover();
  }

  annotate(editor: Editor) {
    const text = editor.getValue();
    const p = parse(text);
    if (!p.isD) return new Notice("Not a review-format: D note.");
    const from = editor.posToOffset(editor.getCursor("from"));
    const to = editor.posToOffset(editor.getCursor("to"));
    if (from === to) return new Notice("Select the Target text first.");
    const sel = text.slice(from, to);
    if (/[{}]/.test(sel)) return new Notice("PROTOTYPE: a Target may not contain { or }.");
    if (/\n\s*\n/.test(sel)) return new Notice("PROTOTYPE: a Target may not cross a blank line.");
    const lines = text.split("\n");
    const lineOf = (o: number) => editor.offsetToPos(o).line;
    if (/^\s*\|/.test(lines[lineOf(from)]) && sel.includes("|"))
      return new Notice("PROTOTYPE: a Target may not span table cells.");

    const endLine = findBlockEnd(lines, lineOf(to));
    const id = nextId(p);
    new InstructionModal(this.app, `Instruction for ${id}`, "", (instr) => {
      if (!instr.trim()) return;
      const atLineEnd = editor.posToOffset({ line: endLine, ch: lines[endLine].length });
      const next = lines[endLine + 1];
      const tail = next !== undefined && next.trim() !== "" ? "\n" : "";
      // One transaction = one undo step. Positions are all in the pre-edit document.
      editor.transaction({
        changes: [
          { from: editor.offsetToPos(from), text: "{" },
          { from: editor.offsetToPos(to), text: `}(${id})` },
          { from: editor.offsetToPos(atLineEnd), text: "\n\n" + calloutText(id, instr) + tail },
        ],
      });
    }).open();
  }

  editAtCursor(editor: Editor) {
    const p = parse(editor.getValue());
    if (!p.isD) return new Notice("Not a review-format: D note.");
    const off = editor.posToOffset(editor.getCursor());
    const m = p.markers.find((x) => off >= x.open && off <= x.markerTo);
    const c = m ? p.callouts.get(m.id) : Array.from(p.callouts.values()).find((x) => off >= x.from && off <= x.to);
    if (!c) return new Notice(m ? `No callout for ${m.id}.` : "Cursor is not on an Annotation or its callout.");
    this.editInEditor(editor, c);
  }

  editInEditor(editor: Editor, c: Callout) {
    new InstructionModal(this.app, `Edit ${c.id}`, c.instruction, (instr) => {
      if (!instr.trim()) return;
      editor.replaceRange(calloutText(c.id, instr), editor.offsetToPos(c.from), editor.offsetToPos(c.to));
    }).open();
  }

  // From the popover: editor if the note is in editing mode, Vault.process in Reading view.
  async editById(id: string) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) return;
    if (view.getMode() === "source") {
      const c = parse(view.editor.getValue()).callouts.get(id);
      if (!c) return new Notice(`No callout for ${id}.`);
      return this.editInEditor(view.editor, c);
    }
    const file = view.file;
    const c = parse(await this.app.vault.read(file)).callouts.get(id);
    if (!c) return new Notice(`No callout for ${id}.`);
    new InstructionModal(this.app, `Edit ${id}`, c.instruction, (instr) => {
      if (!instr.trim()) return;
      this.app.vault.process(file, (t) => {
        const cc = parse(t).callouts.get(id);
        return cc ? t.slice(0, cc.from) + calloutText(id, instr) + t.slice(cc.to) : t;
      });
    }).open();
  }
}
