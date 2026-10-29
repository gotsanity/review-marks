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
  default: () => ProtoFormatB
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
function codeRanges(text) {
  const out = [];
  const re = /^(```|~~~)[^\n]*\n[\s\S]*?(^\1[^\n]*$|$(?![\s\S]))/gm;
  let m;
  while (m = re.exec(text)) out.push([m.index, m.index + m[0].length]);
  return out;
}
function parse(text) {
  const code = codeRanges(text);
  const inCode = (i) => code.some(([a, b]) => i >= a && i < b);
  const byId = /* @__PURE__ */ new Map();
  const get = (id) => {
    let a = byId.get(id);
    if (!a) {
      a = { id, open: -1, close: -1, refEnd: -1, defFrom: -1, defTo: -1, instruction: "" };
      byId.set(id, a);
    }
    return a;
  };
  const lines = text.split("\n");
  const starts = [];
  let off = 0;
  for (const l of lines) {
    starts.push(off);
    off += l.length + 1;
  }
  for (let i = 0; i < lines.length; i++) {
    const m2 = /^\[\^(r\d+)\]:[ \t]?(.*)$/.exec(lines[i]);
    if (!m2 || inCode(starts[i])) continue;
    const parts = [m2[2]];
    let last = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^( {4}|\t)/.test(lines[j])) {
        parts.push(lines[j].replace(/^( {4}|\t)/, ""));
        last = j;
        continue;
      }
      if (lines[j].trim() === "" && j + 1 < lines.length && /^( {4}|\t)/.test(lines[j + 1])) {
        parts.push("");
        continue;
      }
      break;
    }
    const a = get(m2[1]);
    a.defFrom = starts[i];
    a.defTo = starts[last] + lines[last].length;
    a.instruction = parts.join("\n").trimEnd();
    i = last;
  }
  const re = /\}\[\^(r\d+)\](?!:)/g;
  let m;
  while (m = re.exec(text)) {
    if (inCode(m.index)) continue;
    let k = m.index - 1;
    while (k >= 0 && text[k] !== "{" && text[k] !== "}" && !(text[k] === "\n" && text[k - 1] === "\n")) k--;
    if (k < 0 || text[k] !== "{") continue;
    const a = get(m[1]);
    a.open = k;
    a.close = m.index;
    a.refEnd = m.index + m[0].length;
  }
  return [...byId.values()].sort((x, y) => (x.open < 0 ? 1e12 : x.open) - (y.open < 0 ? 1e12 : y.open));
}
function isFormatB(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return !!fm && /^review-format:\s*["']?B["']?\s*$/m.test(fm[1]);
}
function nextId(anns) {
  let max = 0;
  for (const a of anns) max = Math.max(max, parseInt(a.id.slice(1), 10));
  return "r" + (max + 1);
}
function defText(id, instruction) {
  return instruction.split("\n").map((l, i) => i === 0 ? `[^${id}]: ${l}` : l.trim() === "" ? "" : "    " + l).join("\n");
}
function excerpt(s, n = 32) {
  const first = s.split("\n")[0];
  return first.length > n || s.includes("\n") ? first.slice(0, n).trimEnd() + "\u2026" : first;
}
var pop = null;
var pinned = false;
var hideTimer;
function showPopover(anchor, a, pin) {
  window.clearTimeout(hideTimer);
  if (pop && pinned && !pin) return;
  hidePopover(true);
  pinned = pin;
  pop = document.body.createDiv({ cls: "proto-b-popover" });
  pop.createDiv({ cls: "proto-b-popover-head", text: `Instruction [^${a.id}]` + (pin ? "  (tap outside to close)" : "") });
  pop.createDiv({ cls: "proto-b-popover-body", text: a.instruction || "(no definition found at end of note)" });
  pop.addEventListener("mouseenter", () => window.clearTimeout(hideTimer));
  pop.addEventListener("mouseleave", () => scheduleHide());
  const r = anchor.getBoundingClientRect();
  const top = r.bottom + 6 + pop.offsetHeight > window.innerHeight ? r.top - pop.offsetHeight - 6 : r.bottom + 6;
  pop.setCssProps({ "--proto-b-top": `${Math.max(4, top)}px` });
  pop.setCssProps({ "--proto-b-left": `${Math.max(4, Math.min(r.left, window.innerWidth - pop.offsetWidth - 4))}px` });
}
function scheduleHide() {
  if (pinned) return;
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => hidePopover(false), 200);
}
function hidePopover(force) {
  if (!pop || pinned && !force) return;
  pop.remove();
  pop = null;
  pinned = false;
}
function makeIndicator(a) {
  const el = createSpan({ cls: "proto-b-indicator" });
  (0, import_obsidian.setIcon)(el.createSpan({ cls: "proto-b-indicator-icon" }), "message-square");
  el.createSpan({ cls: "proto-b-indicator-text", text: a.instruction ? excerpt(a.instruction) : `[^${a.id}]?` });
  el.addEventListener("mouseenter", () => showPopover(el, a, false));
  el.addEventListener("mouseleave", () => scheduleHide());
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showPopover(el, a, true);
  });
  return el;
}
var IndicatorWidget = class extends import_view.WidgetType {
  constructor(a) {
    super();
    this.a = a;
  }
  eq(o) {
    return o.a.id === this.a.id && o.a.instruction === this.a.instruction;
  }
  toDOM() {
    return makeIndicator(this.a);
  }
  ignoreEvent() {
    return true;
  }
};
var hide = import_view.Decoration.replace({});
var LivePreviewB = class {
  constructor(view) {
    this.decorations = import_view.Decoration.none;
    this.anns = [];
    this.build(view);
  }
  update(u) {
    if (u.docChanged || u.selectionSet || u.viewportChanged || u.state.field(import_obsidian.editorLivePreviewField) !== u.startState.field(import_obsidian.editorLivePreviewField)) this.build(u.view);
  }
  build(view) {
    const state = view.state;
    const text = state.doc.toString();
    if (!state.field(import_obsidian.editorLivePreviewField) || !isFormatB(text)) {
      this.anns = [];
      this.decorations = import_view.Decoration.none;
      return;
    }
    this.anns = parse(text);
    const sel = state.selection.ranges;
    const out = [];
    for (const a of this.anns) {
      const inTable = a.open >= 0 && /^\s*\|/.test(state.doc.lineAt(a.open).text);
      if (a.open >= 0 && !inTable) {
        const touched = sel.some((r) => r.from <= a.refEnd && r.to >= a.open);
        const mark = import_view.Decoration.mark({
          class: "proto-b-target" + (touched ? " proto-b-revealed" : ""),
          attributes: { "data-proto-b-id": a.id }
        });
        if (a.close > a.open + 1) out.push(mark.range(a.open + 1, a.close));
        if (touched) {
          out.push(import_view.Decoration.mark({ class: "proto-b-syntax" }).range(a.open, a.open + 1));
          out.push(import_view.Decoration.mark({ class: "proto-b-syntax" }).range(a.close, a.refEnd));
        } else {
          out.push(hide.range(a.open, a.open + 1));
          out.push(import_view.Decoration.replace({ widget: new IndicatorWidget(a) }).range(a.close, a.refEnd));
        }
      }
      if (a.defFrom >= 0) {
        const l1 = state.doc.lineAt(a.defFrom).number, l2 = state.doc.lineAt(a.defTo).number;
        for (let l = l1; l <= l2; l++) out.push(import_view.Decoration.line({ class: "proto-b-def-line" }).range(state.doc.line(l).from));
      }
    }
    this.decorations = import_view.Decoration.set(out, true);
  }
};
var livePreviewB = import_view.ViewPlugin.fromClass(LivePreviewB, {
  decorations: (v) => v.decorations,
  eventHandlers: {
    mouseover(e) {
      var _a, _b;
      const t = (_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".proto-b-target[data-proto-b-id]");
      if (!t || t.hasClass("proto-b-revealed")) return;
      const a = this.anns.find((x) => x.id === t.dataset.protoBId);
      if (a) showPopover(t, a, false);
    },
    mouseout(e) {
      var _a, _b;
      if ((_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".proto-b-target")) scheduleHide();
    }
  }
});
function textNodes(root, skip) {
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while (n = w.nextNode()) if (!skip(n)) out.push(n);
  return out;
}
function wrapSlice(node, start, end, cls) {
  if (end <= start) return null;
  let mid = node;
  if (start > 0) mid = node.splitText(start);
  if (end - start < mid.length) mid.splitText(end - start);
  const span = createSpan({ cls });
  mid.parentNode.insertBefore(span, mid);
  span.appendChild(mid);
  return span;
}
function locateTarget(el, sup) {
  const nodes = textNodes(el, (n) => {
    var _a;
    return !!((_a = n.parentElement) == null ? void 0 : _a.closest("sup, .proto-b-indicator, .footnotes"));
  });
  let ci = -1;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].compareDocumentPosition(sup) & Node.DOCUMENT_POSITION_FOLLOWING) ci = i;
    else break;
  }
  if (ci < 0) return null;
  const cIdx = nodes[ci].data.lastIndexOf("}");
  if (cIdx < 0 || nodes[ci].data.slice(cIdx + 1).trim() !== "") return null;
  let oi = ci, oIdx = nodes[ci].data.lastIndexOf("{", cIdx);
  while (oIdx < 0 && oi > 0) {
    oi--;
    oIdx = nodes[oi].data.lastIndexOf("{");
  }
  if (oIdx < 0) return null;
  let domText = "";
  for (let k = oi; k <= ci; k++) domText += nodes[k].data.slice(k === oi ? oIdx + 1 : 0, k === ci ? cIdx : void 0);
  return { nodes, oi, oIdx, ci, cIdx, domText };
}
function wrapTarget(loc, a) {
  var _a, _b;
  const { nodes, oi, oIdx, ci, cIdx } = loc;
  const targets = [];
  for (let k = ci; k >= oi; k--) {
    const n = nodes[k];
    if (k === ci) wrapSlice(n, cIdx, cIdx + 1, "proto-b-syntax-hidden");
    const start = k === oi ? oIdx + 1 : 0;
    const end = k === ci ? cIdx : n.length;
    const blank = n.data.slice(start, end).trim() === "" && /^(UL|OL)$/.test((_b = (_a = n.parentElement) == null ? void 0 : _a.tagName) != null ? _b : "");
    if (!blank) {
      const s = wrapSlice(n, start, end, "proto-b-target");
      if (s) {
        s.dataset.protoBId = a.id;
        targets.push(s);
      }
    }
    if (k === oi) wrapSlice(n, oIdx, oIdx + 1, "proto-b-syntax-hidden");
  }
  return targets;
}
var norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
var ProtoFormatB = class extends import_obsidian.Plugin {
  async onload() {
    this.registerEditorExtension(import_state.Prec.highest(livePreviewB));
    this.registerMarkdownPostProcessor((el, ctx) => this.postProcess(el, ctx));
    this.registerDomEvent(document, "click", (e) => {
      if (pop && !pop.contains(e.target)) hidePopover(true);
    });
    this.addCommand({
      id: "annotate-selection",
      name: "Prototype: annotate selection",
      editorCallback: (editor, view) => this.annotate(editor)
    });
    this.addCommand({
      id: "edit-instruction-at-cursor",
      name: "Prototype: edit instruction at cursor",
      editorCallback: (editor) => this.editAtCursor(editor)
    });
  }
  onunload() {
    hidePopover(true);
  }
  async postProcess(el, ctx) {
    var _a, _b, _c;
    const fm = (_b = ctx.frontmatter) != null ? _b : (_a = this.app.metadataCache.getCache(ctx.sourcePath)) == null ? void 0 : _a.frontmatter;
    if (String((_c = fm == null ? void 0 : fm["review-format"]) != null ? _c : "") !== "B") return;
    const info = ctx.getSectionInfo(el);
    let text = info == null ? void 0 : info.text;
    if (text == null) {
      const f = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!(f instanceof import_obsidian.TFile)) return;
      text = await this.app.vault.cachedRead(f);
    }
    text = text.replace(/\r\n/g, "\n");
    const anns = parse(text);
    const byId = new Map(anns.map((a) => [a.id, a]));
    const sups = Array.from(el.querySelectorAll("sup")).filter(
      (s) => s.hasClass("footnote-ref") || s.hasAttribute("data-footnote-id") || !!s.querySelector('a[href*="fn"]')
    );
    let ids = [];
    if (info) {
      const src = text.split("\n").slice(info.lineStart, info.lineEnd + 1).join("\n");
      const re = /\[\^([^\]\s]+)\](?!:)/g;
      let m;
      while (m = re.exec(src)) ids.push(m[1]);
    }
    const used = /* @__PURE__ */ new Set();
    sups.forEach((sup, i) => {
      var _a2;
      const loc = locateTarget(el, sup);
      if (!loc) return;
      let a = info ? byId.get((_a2 = ids[i]) != null ? _a2 : "") : void 0;
      if (!a) {
        const d = norm(loc.domText);
        a = anns.find((x) => x.open >= 0 && !used.has(x.id) && d && norm(text.slice(x.open + 1, x.close)).includes(d));
      }
      if (!a) return;
      used.add(a.id);
      const targets = wrapTarget(loc, a);
      sup.addClass("proto-b-native-ref-hidden");
      const ind = makeIndicator(a);
      sup.after(ind);
      for (const t of targets) {
        t.addEventListener("mouseenter", () => showPopover(t, a, false));
        t.addEventListener("mouseleave", () => scheduleHide());
        t.addEventListener("click", (e) => {
          e.stopPropagation();
          showPopover(t, a, true);
        });
      }
    });
    el.querySelectorAll(".footnotes li").forEach((li) => {
      var _a2;
      const t = norm((_a2 = li.textContent) != null ? _a2 : "");
      const a = anns.find((x) => x.instruction && t.startsWith(norm(x.instruction.split("\n")[0]).slice(0, 40)));
      if (!a || li.hasClass("proto-b-def-item")) return;
      li.addClass("proto-b-def-item");
      li.prepend(createSpan({ cls: "proto-b-def-label", text: `review ${a.id}` }));
    });
  }
  annotate(editor) {
    const text = editor.getValue();
    if (!isFormatB(text)) {
      new import_obsidian.Notice('Prototype B: this note has no "review-format: B".');
      return;
    }
    const sel = editor.getSelection();
    if (!sel) {
      new import_obsidian.Notice("Prototype B: select the Target first.");
      return;
    }
    if (/[{}]/.test(sel)) {
      new import_obsidian.Notice("Prototype B: the selection contains { or }; format B cannot nest or overlap.");
      return;
    }
    if (/\n\s*\n/.test(sel)) {
      new import_obsidian.Notice("Prototype B: the selection crosses a blank line; format B only allows one line break.");
      return;
    }
    const from = editor.getCursor("from"), to = editor.getCursor("to");
    const anns = parse(text);
    const id = nextId(anns);
    new InstructionModal(this.app, `New Instruction [^${id}]`, "", (instr) => {
      const lastDef = anns.filter((a) => a.defFrom >= 0).sort((x, y) => y.defTo - x.defTo)[0];
      let at, ins;
      if (lastDef) {
        at = lastDef.defTo;
        ins = "\n" + defText(id, instr);
      } else {
        at = text.length;
        ins = (text.endsWith("\n") ? "\n" : "\n\n") + defText(id, instr) + "\n";
      }
      const atPos = editor.offsetToPos(at);
      editor.transaction({
        changes: [
          { from, to, text: `{${sel}}[^${id}]` },
          { from: atPos, to: atPos, text: ins }
        ]
      });
    }).open();
  }
  editAtCursor(editor) {
    var _a;
    const text = editor.getValue();
    if (!isFormatB(text)) {
      new import_obsidian.Notice('Prototype B: this note has no "review-format: B".');
      return;
    }
    const off = editor.posToOffset(editor.getCursor());
    const anns = parse(text);
    const a = (_a = anns.find((x) => x.open >= 0 && off >= x.open && off <= x.refEnd)) != null ? _a : anns.find((x) => x.defFrom >= 0 && off >= x.defFrom && off <= x.defTo);
    if (!a) {
      new import_obsidian.Notice("Prototype B: no Annotation at the cursor.");
      return;
    }
    if (a.defFrom < 0) {
      new import_obsidian.Notice(`Prototype B: [^${a.id}] has no definition at the end of the note.`);
      return;
    }
    new InstructionModal(this.app, `Edit Instruction [^${a.id}]`, a.instruction, (instr) => {
      editor.replaceRange(defText(a.id, instr), editor.offsetToPos(a.defFrom), editor.offsetToPos(a.defTo));
    }).open();
  }
};
var InstructionModal = class extends import_obsidian.Modal {
  constructor(app, heading, initial, onSubmit) {
    super(app);
    this.heading = heading;
    this.initial = initial;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    this.titleEl.setText(this.heading);
    const ta = this.contentEl.createEl("textarea", { cls: "proto-b-textarea" });
    ta.value = this.initial;
    this.contentEl.createDiv({ cls: "proto-b-hint", text: "Enter for a new line. Ctrl/Cmd+Enter to save. Extra lines are written indented by 4 spaces." });
    const submit = () => {
      const v = ta.value.trim();
      if (!v) {
        new import_obsidian.Notice("Prototype B: empty Instruction.");
        return;
      }
      this.close();
      this.onSubmit(v);
    };
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submit();
      }
    });
    this.contentEl.createEl("button", { text: "Save", cls: "mod-cta" }).addEventListener("click", submit);
    window.setTimeout(() => ta.focus(), 0);
  }
  onClose() {
    this.contentEl.empty();
  }
};
