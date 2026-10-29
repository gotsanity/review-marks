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
  decodeInstruction: () => decodeInstruction,
  default: () => ProtoFormatA,
  encodeInstruction: () => encodeInstruction,
  encodeTarget: () => encodeTarget,
  parse: () => parse
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_obsidian2 = require("obsidian");
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var FM_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
function isFormatA(text) {
  const m = FM_RE.exec(text);
  return !!m && /^review-format:\s*["']?A["']?\s*$/m.test(m[1]);
}
function parse(text, rendered = false) {
  const out = [];
  const n = text.length;
  let i = 0;
  if (!rendered) {
    const fm = FM_RE.exec(text);
    if (fm) i = fm[0].length;
  }
  let inFence = false;
  while (i < n) {
    const c = text[i];
    if (!rendered && (i === 0 || text[i - 1] === "\n") && text.startsWith("```", i)) {
      inFence = !inFence;
      const nl = text.indexOf("\n", i);
      i = nl < 0 ? n : nl + 1;
      continue;
    }
    if (inFence) {
      const nl = text.indexOf("\n", i);
      i = nl < 0 ? n : nl + 1;
      continue;
    }
    if (c === "\\" && !rendered) {
      i += 2;
      continue;
    }
    if (c !== "{") {
      i++;
      continue;
    }
    let j = i + 1;
    let close = -1;
    let restart = -1;
    while (j < n) {
      const d = text[j];
      if (d === "\\" && !rendered) {
        j += 2;
        continue;
      }
      if (d === "{") {
        restart = j;
        break;
      }
      if (d === "\n") {
        let k2 = j + 1;
        while (k2 < n && (text[k2] === " " || text[k2] === "	" || text[k2] === "\r")) k2++;
        if (k2 >= n || text[k2] === "\n") break;
      }
      if (d === "}" && text[j + 1] === "(") {
        close = j;
        break;
      }
      j++;
    }
    if (close < 0) {
      i = restart > 0 ? restart : i + 1;
      continue;
    }
    let k = close + 2;
    let depth = 0;
    let end = -1;
    while (k < n) {
      const e = text[k];
      if (e === "\\" && !rendered) {
        k += 2;
        continue;
      }
      if (e === "\n" && !rendered) break;
      if (e === "(") depth++;
      else if (e === ")") {
        if (depth === 0) {
          end = k;
          break;
        }
        depth--;
      }
      k++;
    }
    if (end < 0) {
      i++;
      continue;
    }
    const raw = text.slice(close + 2, end);
    out.push({
      from: i,
      tEnd: close,
      iStart: close + 2,
      iEnd: end,
      to: end + 1,
      instruction: rendered ? raw : decodeInstruction(raw)
    });
    i = end + 1;
  }
  return out;
}
function decodeInstruction(raw) {
  return raw.replace(/<br\s*\/?>/gi, "\n").replace(/\\([!-\/:-@\[-`{-~])/g, "$1");
}
function encodeInstruction(s) {
  s = s.replace(/\r\n?/g, "\n").trim();
  const bad = /* @__PURE__ */ new Set();
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") stack.push(i);
    else if (s[i] === ")") {
      if (stack.length) stack.pop();
      else bad.add(i);
    }
  }
  for (const i of stack) bad.add(i);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\n") out += "<br>";
    else if (c === "\\" || c === "[" || c === "]" || c === "|") out += "\\" + c;
    else if (bad.has(i)) out += "\\" + c;
    else out += c;
  }
  return out;
}
function encodeTarget(s) {
  var _a;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      out += c + ((_a = s[i + 1]) != null ? _a : "");
      i++;
      continue;
    }
    if (c === "{" || c === "}") out += "\\" + c;
    else out += c;
  }
  return out;
}
var pop = null;
var hideTimer = null;
var pinned = false;
function showPopover(anchor, text, pin) {
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (!pop) {
    pop = document.body.createDiv({ cls: "pa-popover" });
    pop.addEventListener("mouseenter", () => {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    });
    pop.addEventListener("mouseleave", () => scheduleHide());
  }
  pinned = pin || pinned;
  pop.empty();
  pop.createDiv({ cls: "pa-popover-label", text: "Instruction" });
  pop.createDiv({ cls: "pa-popover-body", text });
  const r = anchor.getBoundingClientRect();
  pop.style.setProperty("--pa-top", `${r.bottom + 6}px`);
  pop.style.setProperty("--pa-left", `${Math.max(8, Math.min(r.left, window.innerWidth - 340))}px`);
  pop.addClass("is-visible");
}
function scheduleHide() {
  if (pinned) return;
  if (hideTimer) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    pop == null ? void 0 : pop.removeClass("is-visible");
  }, 250);
}
function hidePopover() {
  pinned = false;
  pop == null ? void 0 : pop.removeClass("is-visible");
}
function wireHover(el, instruction) {
  el.addEventListener("mouseenter", () => showPopover(el, instruction, false));
  el.addEventListener("mouseleave", () => scheduleHide());
}
function makeIndicator(instruction) {
  const el = createSpan({ cls: "pa-indicator", text: "\u270E" });
  el.setAttr("aria-label", "Show instruction");
  wireHover(el, instruction);
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    pinned = false;
    showPopover(el, instruction, true);
  });
  return el;
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
};
function buildDecorations(view) {
  if (!view.state.field(import_obsidian2.editorLivePreviewField, false)) return import_view.Decoration.none;
  const text = view.state.doc.toString();
  if (!isFormatA(text)) return import_view.Decoration.none;
  const anns = parse(text);
  const ranges = view.state.selection.ranges;
  const b = new import_state.RangeSetBuilder();
  for (const a of anns) {
    const active = ranges.some((r) => r.from <= a.to && r.to >= a.from);
    const target = import_view.Decoration.mark({ class: "pa-target", attributes: { "data-pa-instr": a.instruction } });
    if (active) {
      b.add(a.from, a.from + 1, import_view.Decoration.mark({ class: "pa-delim" }));
      if (a.tEnd > a.from + 1) b.add(a.from + 1, a.tEnd, target);
      b.add(a.tEnd, a.to, import_view.Decoration.mark({ class: "pa-raw-instruction" }));
    } else {
      b.add(a.from, a.from + 1, import_view.Decoration.replace({}));
      if (a.tEnd > a.from + 1) b.add(a.from + 1, a.tEnd, target);
      b.add(a.tEnd, a.to, import_view.Decoration.replace({ widget: new IndicatorWidget(a.instruction, a.from) }));
    }
  }
  return b.finish();
}
var livePreview = import_view.ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }
    update(u) {
      const lpChanged = u.startState.field(import_obsidian2.editorLivePreviewField, false) !== u.state.field(import_obsidian2.editorLivePreviewField, false);
      if (u.docChanged || u.selectionSet || u.viewportChanged || lpChanged) this.decorations = buildDecorations(u.view);
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mouseover(e) {
        var _a, _b;
        const t = (_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".pa-target");
        const instr = t == null ? void 0 : t.getAttribute("data-pa-instr");
        if (t && instr != null) showPopover(t, instr, false);
      },
      mouseout(e) {
        var _a, _b;
        if ((_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".pa-target")) scheduleHide();
      }
    }
  }
);
function textMap(el) {
  const segs = [];
  let text = "";
  const walk = (n) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === Node.TEXT_NODE) {
        const t = c;
        segs.push({ node: t, br: null, start: text.length, len: t.data.length });
        text += t.data;
      } else if (c.nodeType === Node.ELEMENT_NODE) {
        const e = c;
        if (e.tagName === "BR") {
          segs.push({ node: null, br: e, start: text.length, len: 1 });
          text += "\n";
        } else if (!e.hasClass("pa-indicator")) walk(e);
      }
    }
  };
  walk(el);
  return { text, segs };
}
function charAt(segs, pos) {
  for (const s of segs) if (s.node && pos >= s.start && pos < s.start + s.len) return { node: s.node, off: pos - s.start };
  return null;
}
function findMatch(text, expected) {
  let best = null;
  if (expected && expected.length) {
    for (const instr of expected) {
      const idx = text.indexOf("}(" + instr + ")");
      if (idx < 0) continue;
      const open = text.lastIndexOf("{", idx);
      if (open < 0) continue;
      if (!best || open < best.open) best = { open, close: idx, end: idx + 2 + instr.length + 1, instruction: instr };
    }
    if (best) return best;
  }
  const a = parse(text, true)[0];
  return a ? { open: a.from, close: a.tEnd, end: a.to, instruction: a.instruction } : null;
}
function processReading(el, expected) {
  for (let guard = 0; guard < 50; guard++) {
    const { text, segs } = textMap(el);
    const m = findMatch(text, expected);
    if (!m) return;
    const o = charAt(segs, m.open), c = charAt(segs, m.close), e = charAt(segs, m.end - 1);
    if (!o || !c || !e) return;
    const rOpen = document.createRange();
    rOpen.setStart(o.node, o.off);
    rOpen.setEnd(o.node, o.off + 1);
    const rClose = document.createRange();
    rClose.setStart(c.node, c.off);
    rClose.setEnd(e.node, e.off + 1);
    const pieces = [];
    for (const s of segs) {
      if (!s.node) continue;
      const a = Math.max(s.start, m.open + 1), b = Math.min(s.start + s.len, m.close);
      if (a >= b) continue;
      if (!s.node.data.slice(a - s.start, b - s.start).trim()) continue;
      pieces.push({ node: s.node, s: a - s.start, e: b - s.start });
    }
    for (let i = pieces.length - 1; i >= 0; i--) {
      let { node } = pieces[i];
      const { s, e: en } = pieces[i];
      if (en < node.data.length) node.splitText(en);
      if (s > 0) node = node.splitText(s);
      const span = createSpan({ cls: "pa-target" });
      wireHover(span, m.instruction);
      span.addEventListener("click", () => {
        pinned = false;
        showPopover(span, m.instruction, true);
      });
      node.parentNode.insertBefore(span, node);
      span.appendChild(node);
    }
    rClose.deleteContents();
    rClose.insertNode(makeIndicator(m.instruction));
    rOpen.deleteContents();
    if (expected) expected = expected.filter((x) => x !== m.instruction);
  }
}
var InstructionModal = class extends import_obsidian.Modal {
  constructor(app, initial, onSubmit) {
    super(app);
    this.initial = initial;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("pa-modal");
    contentEl.createEl("h3", { text: "Instruction (prototype A)" });
    const ta = contentEl.createEl("textarea", { cls: "pa-modal-input" });
    ta.value = this.initial;
    contentEl.createDiv({ cls: "pa-modal-hint", text: "Ctrl/Cmd+Enter to save. Newlines are stored as <br>." });
    const btn = contentEl.createEl("button", { text: "Save", cls: "mod-cta" });
    const submit = () => {
      const v = ta.value.trim();
      if (!v) {
        new import_obsidian.Notice("Empty instruction.");
        return;
      }
      this.close();
      this.onSubmit(v);
    };
    btn.addEventListener("click", submit);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submit();
      }
    });
    window.setTimeout(() => ta.focus(), 0);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ProtoFormatA = class extends import_obsidian.Plugin {
  async onload() {
    this.registerEditorExtension(livePreview);
    this.registerMarkdownPostProcessor((el, ctx) => {
      var _a, _b;
      const fm = (_b = ctx.frontmatter) != null ? _b : (_a = this.app.metadataCache.getCache(ctx.sourcePath)) == null ? void 0 : _a.frontmatter;
      if (!fm || String(fm["review-format"]) !== "A") return;
      let expected = null;
      const info = ctx.getSectionInfo(el);
      if (info) {
        const src = info.text.split("\n").slice(info.lineStart, info.lineEnd + 1).join("\n");
        expected = parse(src).map((a) => a.instruction);
      }
      processReading(el, expected);
    });
    this.registerDomEvent(document, "click", (e) => {
      var _a, _b, _c;
      const t = e.target;
      if (!((_a = t.closest) == null ? void 0 : _a.call(t, ".pa-popover")) && !((_b = t.closest) == null ? void 0 : _b.call(t, ".pa-indicator")) && !((_c = t.closest) == null ? void 0 : _c.call(t, ".pa-target"))) hidePopover();
    });
    this.addCommand({
      id: "annotate-selection",
      name: "Prototype: annotate selection",
      editorCallback: (editor) => {
        const text = editor.getValue();
        if (!isFormatA(text)) {
          new import_obsidian.Notice("Not a review-format: A note.");
          return;
        }
        const sel = editor.getSelection();
        if (!sel) {
          new import_obsidian.Notice("Select a Target first.");
          return;
        }
        const from = editor.posToOffset(editor.getCursor("from"));
        const to = editor.posToOffset(editor.getCursor("to"));
        if (/\n[ \t\r]*\n/.test(sel)) {
          new import_obsidian.Notice("Format A can't hold a Target that crosses a blank line.");
          return;
        }
        if (parse(text).some((a) => a.from < to && a.to > from)) {
          new import_obsidian.Notice("Overlaps an existing Annotation; format A has no nesting.");
          return;
        }
        new InstructionModal(this.app, "", (instr) => {
          editor.transaction({
            changes: [{ from: editor.offsetToPos(from), to: editor.offsetToPos(to), text: `{${encodeTarget(sel)}}(${encodeInstruction(instr)})` }]
          });
        }).open();
      }
    });
    this.addCommand({
      id: "edit-instruction-at-cursor",
      name: "Prototype: edit instruction at cursor",
      editorCallback: (editor) => {
        const text = editor.getValue();
        if (!isFormatA(text)) {
          new import_obsidian.Notice("Not a review-format: A note.");
          return;
        }
        const off = editor.posToOffset(editor.getCursor());
        const a = parse(text).find((x) => x.from <= off && off <= x.to);
        if (!a) {
          new import_obsidian.Notice("No Annotation at cursor.");
          return;
        }
        new InstructionModal(this.app, a.instruction, (instr) => {
          editor.transaction({
            changes: [{ from: editor.offsetToPos(a.iStart), to: editor.offsetToPos(a.iEnd), text: encodeInstruction(instr) }]
          });
        }).open();
      }
    });
  }
  onunload() {
    pop == null ? void 0 : pop.remove();
    pop = null;
  }
};
