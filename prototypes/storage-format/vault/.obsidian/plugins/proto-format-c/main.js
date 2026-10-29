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
  default: () => ProtoFormatC
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var COLORS = {
  "\u{1F534}": "red",
  "\u{1F7E5}": "red",
  "\u{1F7E0}": "orange",
  "\u{1F7E7}": "orange",
  "\u{1F7E1}": "yellow",
  "\u{1F7E8}": "yellow",
  "\u{1F7E2}": "green",
  "\u{1F7E9}": "green",
  "\u{1F535}": "blue",
  "\u{1F7E6}": "blue",
  "\u{1F7E3}": "purple",
  "\u{1F7EA}": "purple"
};
function mask(text) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/, blank).replace(/^([ \t]*)(```|~~~)[\s\S]*?^\1\2[^\n]*$/gm, blank).replace(/`[^`\n]+`/g, blank).replace(/<!--[\s\S]*?-->/g, blank);
}
function parseHighlights(text, base = 0) {
  var _a;
  const m = mask(text);
  const out = [];
  const re = /==(?!=)((?:(?!==)[\s\S])+?)==/g;
  let r;
  while (r = re.exec(m)) {
    const inner = r[1];
    const lineStart = m.lastIndexOf("\n", r.index) + 1;
    const inTable = /^\s*\|/.test(m.slice(lineStart, r.index + 1));
    if (/^\s/.test(inner) || /\s$/.test(inner) || /\n[ \t\r]*\n/.test(inner) || // blank line = new block
    /\n[ \t]*([-*+] |\d+[.)] |#|>|\|)/.test(inner) || // new list item / heading / quote / table row
    inTable && /(^|[^\\])\|/.test(inner)) {
      re.lastIndex = r.index + 2;
      continue;
    }
    const from = r.index;
    const targetTo = from + 2 + inner.length;
    const cp = String.fromCodePoint(inner.codePointAt(0));
    const color = (_a = COLORS[cp]) != null ? _a : "";
    const targetFrom = from + 2 + (color ? cp.length : 0);
    let end = targetTo + 2;
    const h = {
      from: base + from,
      to: base + end,
      targetFrom: base + targetFrom,
      targetTo: base + targetTo,
      color,
      annotated: false,
      instrFrom: -1,
      instrTo: -1,
      target: text.slice(targetFrom, targetTo),
      instruction: ""
    };
    if (m.startsWith("%%", end)) {
      const close = m.indexOf("%%", end + 2);
      if (close >= 0 && !/\n[ \t\r]*\n/.test(m.slice(end + 2, close))) {
        h.annotated = true;
        h.instrFrom = base + end + 2;
        h.instrTo = base + close;
        h.instruction = text.slice(end + 2, close);
        h.to = base + close + 2;
        re.lastIndex = close + 2;
      }
    }
    out.push(h);
  }
  return out;
}
var parseAnnotations = (text) => parseHighlights(text).filter((h) => h.annotated);
function isGated(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return !!fm && /^review-format:\s*["']?C["']?\s*$/m.test(fm[1]);
}
var popEl = null;
var popAnchor = null;
var popPinned = false;
function showPopover(anchor, instruction, pin = false) {
  hidePopover(true);
  popAnchor = anchor;
  popPinned = pin;
  popEl = document.body.createDiv({ cls: "pfc-popover" });
  popEl.createDiv({ cls: "pfc-popover-label", text: "Instruction" });
  popEl.createDiv({ cls: "pfc-popover-body", text: instruction });
  const r = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, window.innerWidth - 380));
  popEl.setCssProps({ "--pfc-top": `${r.bottom + 6}px`, "--pfc-left": `${left}px` });
}
function hidePopover(force = false) {
  if (popPinned && !force) return;
  popEl == null ? void 0 : popEl.remove();
  popEl = null;
  popAnchor = null;
  popPinned = false;
}
function togglePinned(anchor, instruction) {
  if (popEl && popAnchor === anchor && popPinned) hidePopover(true);
  else showPopover(anchor, instruction, true);
}
function wireHover(el, instruction) {
  el.addEventListener("mouseenter", () => {
    if (!popPinned) showPopover(el, instruction);
  });
  el.addEventListener("mouseleave", () => hidePopover());
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePinned(el, instruction);
  });
}
function makeIndicator(instruction) {
  const s = createSpan({ cls: "pfc-indicator", attr: { "aria-label": "Instruction" } });
  (0, import_obsidian.setIcon)(s, "message-square");
  wireHover(s, instruction);
  return s;
}
var IndicatorWidget = class extends import_view.WidgetType {
  constructor(instruction, pos) {
    super();
    this.instruction = instruction;
    this.pos = pos;
  }
  eq(o) {
    return o.instruction === this.instruction && o.pos === this.pos;
  }
  toDOM() {
    return makeIndicator(this.instruction);
  }
  ignoreEvent() {
    return true;
  }
  // clicks open the popover; they must not move the cursor into the syntax
};
var annField = import_state.StateField.define({
  create: (s) => isGated(s.doc.toString()) ? parseAnnotations(s.doc.toString()) : [],
  update: (v, tr) => {
    if (!tr.docChanged) return v;
    const t = tr.state.doc.toString();
    return isGated(t) ? parseAnnotations(t) : [];
  }
});
function buildDecos(s) {
  if (!s.field(import_obsidian.editorLivePreviewField, false)) return import_view.Decoration.none;
  const decos = [];
  for (const a of s.field(annField)) {
    const touched = s.selection.ranges.some((r) => r.from <= a.to && r.to >= a.from);
    decos.push(import_view.Decoration.mark({ class: "pfc-target" }).range(a.targetFrom, a.targetTo));
    if (touched) {
      if (a.instrTo > a.instrFrom) decos.push(import_view.Decoration.mark({ class: "pfc-instr-raw" }).range(a.instrFrom, a.instrTo));
    } else {
      decos.push(import_view.Decoration.replace({}).range(a.from, a.from + 2));
      decos.push(import_view.Decoration.replace({ widget: new IndicatorWidget(a.instruction, a.from) }).range(a.targetTo, a.to));
    }
  }
  return import_view.Decoration.set(decos, true);
}
var decoField = import_state.StateField.define({
  create: buildDecos,
  update: (v, tr) => {
    const lpChanged = tr.startState.field(import_obsidian.editorLivePreviewField, false) !== tr.state.field(import_obsidian.editorLivePreviewField, false);
    if (tr.docChanged || tr.selection || lpChanged) return buildDecos(tr.state);
    return v;
  },
  provide: (f) => import_view.EditorView.decorations.from(f)
});
var targetHover = import_view.EditorView.domEventHandlers({
  mouseover(e, view) {
    var _a, _b;
    const el = (_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".pfc-target");
    if (!el || popPinned) return;
    const pos = view.posAtDOM(el);
    const a = view.state.field(annField).find((x) => pos >= x.targetFrom && pos <= x.targetTo);
    if (a) showPopover(el, a.instruction);
  },
  mouseout(e) {
    var _a, _b;
    if ((_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".pfc-target")) hidePopover();
  }
});
var tableWidgetScan = import_view.ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.scan(view);
    }
    update(u) {
      window.requestAnimationFrame(() => this.scan(u.view));
    }
    scan(view) {
      const anns = view.state.field(annField);
      if (!anns.length || !view.state.field(import_obsidian.editorLivePreviewField, false)) return;
      view.dom.querySelectorAll(".cm-table-widget mark:not(.pfc-target)").forEach((mk) => {
        const a = anns.find((x) => {
          var _a;
          return norm(x.target) === norm((_a = mk.textContent) != null ? _a : "");
        });
        if (a) decorateMark(mk, a);
      });
    }
  }
);
var norm = (s) => s.replace(/\[\[[^\]|]*?\\?\|([^\]]*)\]\]/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
function decorateMark(mark, a) {
  var _a;
  mark.addClass("pfc-target");
  wireHover(mark, a.instruction);
  let n = mark.nextSibling;
  if (n && n.nodeType === Node.TEXT_NODE && n.textContent.startsWith("%%")) {
    const t = n.textContent;
    const close = t.indexOf("%%", 2);
    if (close >= 0) {
      n.textContent = t.slice(close + 2);
    } else {
      const first = n;
      n = n.nextSibling;
      first.remove();
      while (n) {
        const next = n.nextSibling;
        const txt = (_a = n.textContent) != null ? _a : "";
        const c = n.nodeType === Node.TEXT_NODE ? txt.indexOf("%%") : -1;
        if (c >= 0) {
          n.textContent = txt.slice(c + 2);
          break;
        }
        n.remove();
        n = next;
      }
    }
    mark.addClass("pfc-leak-cleaned");
  }
  mark.after(makeIndicator(a.instruction));
}
async function postProcess(app, el, ctx) {
  var _a;
  if (((_a = ctx.frontmatter) == null ? void 0 : _a["review-format"]) !== "C") return;
  const marks = Array.from(el.querySelectorAll("mark"));
  if (!marks.length) return;
  const info = ctx.getSectionInfo(el);
  if (info) {
    const lines = info.text.split("\n").slice(info.lineStart, info.lineEnd + 1);
    const hls = parseHighlights(lines.join("\n"));
    let j = 0;
    for (const mk of marks) {
      const k = hls.findIndex((h, i) => {
        var _a2;
        return i >= j && norm(h.target) === norm((_a2 = mk.textContent) != null ? _a2 : "");
      });
      if (k < 0) continue;
      j = k + 1;
      if (hls[k].annotated) decorateMark(mk, hls[k]);
    }
    return;
  }
  const f = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(f instanceof import_obsidian.TFile)) return;
  const anns = parseAnnotations(await app.vault.cachedRead(f));
  for (const mk of marks) {
    const a = anns.find((x) => {
      var _a2;
      return norm(x.target) === norm((_a2 = mk.textContent) != null ? _a2 : "");
    });
    if (a) decorateMark(mk, a);
  }
}
var InstructionModal = class extends import_obsidian.Modal {
  constructor(app, initial, onSave) {
    super(app);
    this.initial = initial;
    this.onSave = onSave;
  }
  onOpen() {
    this.titleEl.setText("Instruction (prototype C)");
    const ta = this.contentEl.createEl("textarea", { cls: "pfc-modal-textarea" });
    ta.value = this.initial;
    const save = () => {
      this.onSave(ta.value.trim());
      this.close();
    };
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        save();
      }
    });
    const row = this.contentEl.createDiv({ cls: "pfc-modal-buttons" });
    row.createEl("button", { text: "Save (Ctrl+Enter)", cls: "mod-cta" }).addEventListener("click", save);
    window.setTimeout(() => ta.focus(), 0);
  }
  onClose() {
    this.contentEl.empty();
  }
};
function sanitize(instr, line) {
  if (!instr) return null;
  if (instr.includes("%%")) {
    new import_obsidian.Notice("Format C: an Instruction cannot contain %% (it would close the comment).");
    return null;
  }
  if (instr.includes("\n")) {
    if (/^\s*(\||#)/.test(line)) {
      new import_obsidian.Notice("Format C: newlines removed. They would break this table row or heading.");
      return instr.replace(/\s*\n\s*/g, " ");
    }
    new import_obsidian.Notice("Format C: multi-line Instruction written. Without this plugin, Reading view shows it as raw %%...%% text.");
    return instr.replace(/\n\s*(?=[-*+>#]|\d+[.)])/g, "\n\xA0");
  }
  return instr;
}
var ProtoFormatC = class extends import_obsidian.Plugin {
  async onload() {
    this.registerEditorExtension([annField, decoField, targetHover, tableWidgetScan]);
    this.registerMarkdownPostProcessor((el, ctx) => postProcess(this.app, el, ctx));
    this.registerDomEvent(document, "click", (e) => {
      const t = e.target;
      if (popEl && !popEl.contains(t) && !t.closest(".pfc-indicator, .pfc-target")) hidePopover(true);
    });
    this.register(() => hidePopover(true));
    this.addCommand({
      id: "annotate-selection",
      name: "Prototype: annotate selection",
      editorCallback: (editor) => {
        if (!isGated(editor.getValue())) return new import_obsidian.Notice("Not a review-format: C note.");
        let from = editor.posToOffset(editor.getCursor("from"));
        let to = editor.posToOffset(editor.getCursor("to"));
        const doc = editor.getValue();
        while (from < to && /\s/.test(doc[from])) from++;
        while (to > from && /\s/.test(doc[to - 1])) to--;
        const sel = doc.slice(from, to);
        if (!sel) return new import_obsidian.Notice("Select the Target first.");
        if (sel.includes("\n")) return new import_obsidian.Notice("Format C: a Target cannot cross a line or block (==...== is inline only). Annotate each block separately.");
        if (sel.includes("==") || sel.includes("%%")) return new import_obsidian.Notice("Format C: the Target already contains == or %%; nesting is not possible.");
        if (parseHighlights(doc).some((h) => from < h.to && to > h.from)) return new import_obsidian.Notice("Format C: the selection overlaps an existing highlight or Annotation.");
        const line = editor.getLine(editor.offsetToPos(from).line);
        new InstructionModal(this.app, "", (v) => {
          const instr = sanitize(v, line);
          if (instr === null) return;
          editor.transaction({
            changes: [{ from: editor.offsetToPos(from), to: editor.offsetToPos(to), text: `==${sel}==%%${instr}%%` }]
          });
        }).open();
      }
    });
    this.addCommand({
      id: "edit-instruction",
      name: "Prototype: edit instruction at cursor",
      editorCallback: (editor) => {
        const doc = editor.getValue();
        if (!isGated(doc)) return new import_obsidian.Notice("Not a review-format: C note.");
        const off = editor.posToOffset(editor.getCursor());
        const a = parseAnnotations(doc).find((x) => off >= x.from && off <= x.to);
        if (!a) return new import_obsidian.Notice("No Annotation at the cursor.");
        const line = editor.getLine(editor.offsetToPos(a.from).line);
        new InstructionModal(this.app, a.instruction, (v) => {
          const instr = sanitize(v, line);
          if (instr === null) return;
          editor.transaction({
            changes: [{ from: editor.offsetToPos(a.instrFrom), to: editor.offsetToPos(a.instrTo), text: instr }]
          });
        }).open();
      }
    });
  }
};
