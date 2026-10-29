"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ProtoFormatD
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var MARKER_RE = /\{([^{}]*)\}\((r\d+)\)/g;
var CALLOUT_HEAD_RE = /^\s*>\s*\[!review\][+-]?\s+(r\d+)\s*$/;
var QUOTE_LINE_RE = /^\s*>/;
function isFormatD(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return !!m && /^review-format:\s*D\s*$/m.test(m[1]);
}
function codeRanges(text) {
  const out = [];
  const fence = /^ {0,3}(```|~~~)[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm;
  let m;
  while (m = fence.exec(text)) out.push([m.index, m.index + m[0].length]);
  const inline = /`[^`\n]+`|<!--[\s\S]*?-->|%%[\s\S]*?%%/g;
  while (m = inline.exec(text)) out.push([m.index, m.index + m[0].length]);
  return out;
}
function parse(text) {
  const isD = isFormatD(text);
  const callouts = /* @__PURE__ */ new Map();
  const markers = [];
  if (!isD) return { isD, markers, callouts };
  const lines = text.split("\n");
  const lineStart = [];
  let o = 0;
  for (const l of lines) {
    lineStart.push(o);
    o += l.length + 1;
  }
  for (let i = 0; i < lines.length; i++) {
    const head = CALLOUT_HEAD_RE.exec(lines[i]);
    if (!head) continue;
    const body = [];
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
      instruction: body.join("\n").trim()
    });
    i = last;
  }
  const skip = codeRanges(text);
  for (const c of callouts.values()) skip.push([c.from, c.to]);
  const re = new RegExp(MARKER_RE.source, "g");
  let m;
  while (m = re.exec(text)) {
    const at = m.index;
    if (skip.some(([a, b]) => at >= a && at < b)) continue;
    if (/\n\s*\n/.test(m[1])) continue;
    markers.push({
      id: m[2],
      open: at,
      targetFrom: at + 1,
      targetTo: at + 1 + m[1].length,
      markerTo: at + m[0].length,
      target: m[1]
    });
  }
  return { isD, markers, callouts };
}
function instructionFor(p, id) {
  var _a, _b;
  return (_b = (_a = p.callouts.get(id)) == null ? void 0 : _a.instruction) != null ? _b : `(no "> [!review] ${id}" callout found)`;
}
function calloutText(id, instruction) {
  const body = instruction.replace(/\r/g, "").trim().split("\n").map((l) => l ? `> ${l}` : ">");
  return [`> [!review] ${id}`, ...body].join("\n");
}
function nextId(p) {
  let max = 0;
  for (const m of p.markers) max = Math.max(max, parseInt(m.id.slice(1)));
  for (const id of p.callouts.keys()) max = Math.max(max, parseInt(id.slice(1)));
  return `r${max + 1}`;
}
function findBlockEnd(lines, L) {
  const blank = (s) => s.trim() === "";
  const heading = (s) => /^#{1,6}\s/.test(s);
  const table = (s) => /^\s*\|/.test(s);
  const listItem = (s) => /^\s*([-*+]|\d+[.)])\s/.test(s);
  const fence = (s) => /^\s*(```|~~~)/.test(s);
  let end = L;
  if (heading(lines[L])) {
    end = L;
  } else if (table(lines[L])) {
    while (end + 1 < lines.length && table(lines[end + 1])) end++;
  } else if (QUOTE_LINE_RE.test(lines[L])) {
    while (end + 1 < lines.length && QUOTE_LINE_RE.test(lines[end + 1])) end++;
  } else {
    let s = L;
    let inList = false;
    while (s >= 0) {
      if (listItem(lines[s])) inList = true;
      if (s > 0 && blank(lines[s - 1])) {
        let k = s - 1;
        while (k >= 0 && blank(lines[k])) k--;
        if (inList && k >= 0 && (listItem(lines[k]) || /^\s{2,}\S/.test(lines[k]))) {
          s = k;
          continue;
        }
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
        if (k < lines.length && (listItem(lines[k]) || /^\s{2,}\S/.test(lines[k]))) {
          end = k;
          continue;
        }
        break;
      }
      if (heading(n) || fence(n) || QUOTE_LINE_RE.test(n) && !/^\s{2,}/.test(n)) break;
      if (!inList && listItem(n)) break;
      end++;
    }
  }
  for (; ; ) {
    let k = end + 1;
    while (k < lines.length && blank(lines[k])) k++;
    if (k < lines.length && CALLOUT_HEAD_RE.test(lines[k])) {
      end = k;
      while (end + 1 < lines.length && QUOTE_LINE_RE.test(lines[end + 1]) && !CALLOUT_HEAD_RE.test(lines[end + 1])) end++;
    } else break;
  }
  return end;
}
var plugin;
var pop = null;
var hideTimer = null;
var pinned = false;
function hidePopover() {
  if (hideTimer) window.clearTimeout(hideTimer);
  hideTimer = null;
  pop == null ? void 0 : pop.remove();
  pop = null;
  pinned = false;
}
function scheduleHide() {
  if (pinned) return;
  if (hideTimer) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(hidePopover, 250);
}
function showPopover(anchor, id, instruction, pin) {
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
    left: `${Math.round(Math.max(4, Math.min(r.left, window.innerWidth - 330)))}px`
  });
}
function wirePopover(el, id, instruction) {
  el.addEventListener("mouseenter", () => showPopover(el, id, instruction(), false));
  el.addEventListener("mouseleave", scheduleHide);
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showPopover(el, id, instruction(), true);
  });
}
var BadgeWidget = class extends import_view.WidgetType {
  constructor(id, instruction) {
    super();
    this.id = id;
    this.instruction = instruction;
  }
  eq(o) {
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
};
var parsedField = import_state.StateField.define({
  create: (s) => parse(s.doc.toString()),
  update: (v, tr) => tr.docChanged ? parse(tr.state.doc.toString()) : v
});
function buildDecos(state) {
  const p = state.field(parsedField);
  if (!p.isD || !state.field(import_obsidian.editorLivePreviewField, false)) return import_view.Decoration.none;
  const decos = [];
  const sel = state.selection.ranges;
  for (const m of p.markers) {
    const touching = sel.some((r) => r.from <= m.markerTo && r.to >= m.open);
    for (let n = state.doc.lineAt(m.targetFrom).number; n <= state.doc.lineAt(m.targetTo).number; n++) {
      const line = state.doc.line(n);
      let a = Math.max(line.from, m.targetFrom);
      if (line.from > m.targetFrom) a = line.from + /^\s*(?:[-*+]|\d+[.)]|>)?\s*/.exec(line.text)[0].length;
      const b = Math.min(line.to, m.targetTo);
      if (b > a) decos.push(import_view.Decoration.mark({ class: "proto-d-target", attributes: { "data-proto-d-id": m.id } }).range(a, b));
    }
    if (touching) {
      decos.push(import_view.Decoration.mark({ class: "proto-d-syntax" }).range(m.open, m.targetFrom));
      decos.push(import_view.Decoration.mark({ class: "proto-d-syntax" }).range(m.targetTo, m.markerTo));
    } else {
      decos.push(import_view.Decoration.replace({}).range(m.open, m.targetFrom));
      decos.push(import_view.Decoration.replace({ widget: new BadgeWidget(m.id, instructionFor(p, m.id)) }).range(m.targetTo, m.markerTo));
    }
  }
  for (const c of p.callouts.values()) {
    const first = state.doc.lineAt(c.from).number;
    const last = state.doc.lineAt(c.to).number;
    for (let n = first; n <= last; n++) decos.push(import_view.Decoration.line({ class: "proto-d-callout-line" }).range(state.doc.line(n).from));
  }
  return import_view.Decoration.set(decos, true);
}
var decoField = import_state.StateField.define({
  create: buildDecos,
  update: (v, tr) => {
    const lpChanged = tr.state.field(import_obsidian.editorLivePreviewField, false) !== tr.startState.field(import_obsidian.editorLivePreviewField, false);
    return tr.docChanged || tr.selection || lpChanged ? buildDecos(tr.state) : v;
  },
  provide: (f) => import_view.EditorView.decorations.from(f)
});
var noteClass = import_view.EditorView.editorAttributes.compute(
  [parsedField],
  (s) => s.field(parsedField).isD ? { class: "proto-d-note" } : {}
);
var targetHover = import_view.EditorView.domEventHandlers({
  mouseover(e, view) {
    var _a, _b, _c;
    const t = (_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".proto-d-target");
    if (!t) return false;
    const id = (_c = t.getAttribute("data-proto-d-id")) != null ? _c : "";
    showPopover(t, id, instructionFor(view.state.field(parsedField), id), false);
    t.addEventListener("mouseleave", scheduleHide, { once: true });
    return false;
  }
});
function decorateRendered(el, p) {
  var _a, _b;
  const callouts = Array.from(el.querySelectorAll('.callout[data-callout="review"]'));
  if (el.matches('.callout[data-callout="review"]')) callouts.push(el);
  for (const c of callouts) {
    c.addClass("proto-d-callout");
    const titleEl = c.querySelector(".callout-title-inner");
    const id = (_b = (_a = titleEl == null ? void 0 : titleEl.textContent) == null ? void 0 : _a.trim()) != null ? _b : "";
    const m2 = p.markers.find((x) => x.id === id);
    if (titleEl && m2 && !titleEl.querySelector(".proto-d-callout-target")) {
      const snip = m2.target.replace(/\s+/g, " ");
      titleEl.createSpan({ cls: "proto-d-callout-target", text: `on "${snip.length > 60 ? snip.slice(0, 57) + "..." : snip}"` });
    }
  }
  const nodes = [];
  const starts = [];
  let full = "";
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      var _a2;
      return ((_a2 = n.parentElement) == null ? void 0 : _a2.closest('code, pre, .callout[data-callout="review"], .proto-d-badge')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n);
    starts.push(full.length);
    full += n.data;
  }
  const segs = [];
  const re = new RegExp(MARKER_RE.source, "g");
  let m;
  while (m = re.exec(full)) {
    const close = m.index + 1 + m[1].length;
    segs.push({ from: m.index, to: m.index + 1, kind: "hide", id: m[2] });
    segs.push({ from: m.index + 1, to: close, kind: "target", id: m[2] });
    segs.push({ from: close, to: m.index + m[0].length, kind: "marker", id: m[2] });
  }
  if (!segs.length) return;
  nodes.forEach((node, i) => {
    var _a2, _b2;
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
      const between = /^(UL|OL|TABLE|TBODY|THEAD|TR)$/.test((_b2 = (_a2 = node.parentElement) == null ? void 0 : _a2.tagName) != null ? _b2 : "");
      if (s.kind === "target" && between) {
        frag.append(node.data.slice(a, b));
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
var InstructionModal = class extends import_obsidian.Modal {
  constructor(app, heading, initial, onSubmit) {
    super(app);
    this.heading = heading;
    this.initial = initial;
    this.onSubmit = onSubmit;
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
};
var ProtoFormatD = class extends import_obsidian.Plugin {
  async onload() {
    plugin = this;
    this.registerEditorExtension([parsedField, decoField, noteClass, targetHover]);
    this.registerMarkdownPostProcessor(async (el, ctx) => {
      var _a, _b, _c, _d;
      const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!(file instanceof import_obsidian.TFile)) return;
      if (((_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) == null ? void 0 : _b["review-format"]) !== "D") return;
      const text = (_d = (_c = ctx.getSectionInfo(el)) == null ? void 0 : _c.text) != null ? _d : await this.app.vault.cachedRead(file);
      decorateRendered(el, parse(text));
    });
    this.registerDomEvent(document, "click", (e) => {
      var _a;
      const t = e.target;
      if (pop && !pop.contains(t) && !((_a = t.closest) == null ? void 0 : _a.call(t, ".proto-d-badge, .proto-d-target"))) hidePopover();
    });
    this.addCommand({
      id: "annotate-selection",
      name: "Prototype: annotate selection",
      editorCallback: (editor) => this.annotate(editor)
    });
    this.addCommand({
      id: "edit-instruction-at-cursor",
      name: "Prototype: edit instruction at cursor",
      editorCallback: (editor) => this.editAtCursor(editor)
    });
  }
  onunload() {
    hidePopover();
  }
  annotate(editor) {
    const text = editor.getValue();
    const p = parse(text);
    if (!p.isD) return new import_obsidian.Notice("Not a review-format: D note.");
    const from = editor.posToOffset(editor.getCursor("from"));
    const to = editor.posToOffset(editor.getCursor("to"));
    if (from === to) return new import_obsidian.Notice("Select the Target text first.");
    const sel = text.slice(from, to);
    if (/[{}]/.test(sel)) return new import_obsidian.Notice("PROTOTYPE: a Target may not contain { or }.");
    if (/\n\s*\n/.test(sel)) return new import_obsidian.Notice("PROTOTYPE: a Target may not cross a blank line.");
    const lines = text.split("\n");
    const lineOf = (o) => editor.offsetToPos(o).line;
    if (/^\s*\|/.test(lines[lineOf(from)]) && sel.includes("|"))
      return new import_obsidian.Notice("PROTOTYPE: a Target may not span table cells.");
    const endLine = findBlockEnd(lines, lineOf(to));
    const id = nextId(p);
    new InstructionModal(this.app, `Instruction for ${id}`, "", (instr) => {
      if (!instr.trim()) return;
      const atLineEnd = editor.posToOffset({ line: endLine, ch: lines[endLine].length });
      const next = lines[endLine + 1];
      const tail = next !== void 0 && next.trim() !== "" ? "\n" : "";
      editor.transaction({
        changes: [
          { from: editor.offsetToPos(from), text: "{" },
          { from: editor.offsetToPos(to), text: `}(${id})` },
          { from: editor.offsetToPos(atLineEnd), text: "\n\n" + calloutText(id, instr) + tail }
        ]
      });
    }).open();
  }
  editAtCursor(editor) {
    const p = parse(editor.getValue());
    if (!p.isD) return new import_obsidian.Notice("Not a review-format: D note.");
    const off = editor.posToOffset(editor.getCursor());
    const m = p.markers.find((x) => off >= x.open && off <= x.markerTo);
    const c = m ? p.callouts.get(m.id) : Array.from(p.callouts.values()).find((x) => off >= x.from && off <= x.to);
    if (!c) return new import_obsidian.Notice(m ? `No callout for ${m.id}.` : "Cursor is not on an Annotation or its callout.");
    this.editInEditor(editor, c);
  }
  editInEditor(editor, c) {
    new InstructionModal(this.app, `Edit ${c.id}`, c.instruction, (instr) => {
      if (!instr.trim()) return;
      editor.replaceRange(calloutText(c.id, instr), editor.offsetToPos(c.from), editor.offsetToPos(c.to));
    }).open();
  }
  // From the popover: editor if the note is in editing mode, Vault.process in Reading view.
  async editById(id) {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!(view == null ? void 0 : view.file)) return;
    if (view.getMode() === "source") {
      const c2 = parse(view.editor.getValue()).callouts.get(id);
      if (!c2) return new import_obsidian.Notice(`No callout for ${id}.`);
      return this.editInEditor(view.editor, c2);
    }
    const file = view.file;
    const c = parse(await this.app.vault.read(file)).callouts.get(id);
    if (!c) return new import_obsidian.Notice(`No callout for ${id}.`);
    new InstructionModal(this.app, `Edit ${id}`, c.instruction, (instr) => {
      if (!instr.trim()) return;
      this.app.vault.process(file, (t) => {
        const cc = parse(t).callouts.get(id);
        return cc ? t.slice(0, cc.from) + calloutText(id, instr) + t.slice(cc.to) : t;
      });
    }).open();
  }
};
