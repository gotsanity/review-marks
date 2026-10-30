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
  createAnnotation: () => createAnnotation,
  default: () => ReviewMarksPlugin,
  writeComment: () => writeComment
});
module.exports = __toCommonJS(main_exports);
var import_obsidian10 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");
var DRAG_TRIGGERS = {
  off: "Off",
  alt: "Alt",
  mod: "Ctrl (Cmd on macOS)",
  shift: "Shift",
  meta: "Meta (Windows key, Cmd on macOS)",
  "mod-alt": "Ctrl+Alt",
  "mod-shift": "Ctrl+Shift",
  "alt-shift": "Alt+Shift",
  "mod-alt-shift": "Ctrl+Alt+Shift"
};
var DEFAULT_SETTINGS = {
  placement: "end-of-section",
  showBadge: true,
  excerptLength: 32,
  showHover: true,
  hideReviewFootnotes: true,
  dragTrigger: "alt"
};
var settings = { ...DEFAULT_SETTINGS };
var settingsVersion = 0;
var listeners = [];
function onSettingsChange(cb) {
  listeners.push(cb);
}
async function loadSettings(plugin) {
  Object.assign(settings, DEFAULT_SETTINGS, await plugin.loadData());
}
async function saveSettings(plugin) {
  await plugin.saveData(settings);
  settingsVersion++;
  for (const cb of listeners) cb();
}
var ReviewMarksSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app5, plugin) {
    super(app5, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", { text: "PROTOTYPE. Throwaway code for trying the B+ storage format.", cls: "setting-item-description" });
    new import_obsidian.Setting(containerEl).setName("Comment placement").setDesc('Where the comment of a new annotation is written. Existing annotations are never moved; to convert a note, run "Move comments to end of note" or "Move comments to end of sections".').addDropdown((d) => d.addOption("end-of-section", "End of section").addOption("end-of-note", "End of note").setValue(settings.placement).onChange(async (v) => {
      settings.placement = v;
      await saveSettings(this.plugin);
    }));
    new import_obsidian.Setting(containerEl).setName("Show comment badge").setDesc("A pill after each annotation with the start of its comment.").addToggle((t) => t.setValue(settings.showBadge).onChange(async (v) => {
      settings.showBadge = v;
      await saveSettings(this.plugin);
    }));
    new import_obsidian.Setting(containerEl).setName("Badge excerpt length").setDesc("How many characters of the comment the badge shows.").addText((t) => t.setValue(String(settings.excerptLength)).onChange(async (v) => {
      const n = parseInt(v, 10);
      if (!(n > 0)) return;
      settings.excerptLength = n;
      await saveSettings(this.plugin);
    }));
    new import_obsidian.Setting(containerEl).setName("Show comment on hover").setDesc("Hovering an annotation shows its full comment. On mobile, tap the annotation instead.").addToggle((t) => t.setValue(settings.showHover).onChange(async (v) => {
      settings.showHover = v;
      await saveSettings(this.plugin);
    }));
    new import_obsidian.Setting(containerEl).setName("Hide review footnotes in the footnote list").setDesc("In Reading view, the footnote list at the end of the note leaves out [^r\u2026] comments. Your other footnotes stay.").addToggle((t) => t.setValue(settings.hideReviewFootnotes).onChange(async (v) => {
      settings.hideReviewFootnotes = v;
      await saveSettings(this.plugin);
    }));
    new import_obsidian.Setting(containerEl).setName("Annotate-on-drag trigger").setDesc("Hold these keys while you drag-select text to annotate it at once. Works in Live Preview, Source mode and Reading view (which switches to Live Preview). The editor's own behaviour for this combination is turned off while the setting is on.").addDropdown((d) => {
      for (const [k, label] of Object.entries(DRAG_TRIGGERS)) d.addOption(k, label);
      d.setValue(settings.dragTrigger).onChange(async (v) => {
        settings.dragTrigger = v;
        await saveSettings(this.plugin);
      });
    });
  }
};

// src/ui.ts
var import_obsidian2 = require("obsidian");

// src/parse.ts
var REVIEW_ID = /^r\d+$/;
function normalize(text) {
  return text.replace(/\r\n?/g, "\n");
}
function lineStarts(text) {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") out.push(i + 1);
  return out;
}
function ignoredMask(text) {
  const m = new Uint8Array(text.length);
  const fill = (a, b) => m.fill(1, a, b);
  const fm = /^---\n[\s\S]*?\n---(?=\n|$)/.exec(text);
  if (fm) fill(0, fm[0].length);
  const starts = lineStarts(text);
  let fence = null;
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const e = i + 1 < starts.length ? starts[i + 1] - 1 : text.length;
    const line = text.slice(s, e);
    const f = /^\s*(?:>\s*)*(`{3,}|~{3,})/.exec(line);
    if (!fence) {
      if (f && !(f[1][0] === "`" && line.slice(f.index + f[0].length).includes("`"))) {
        fence = { ch: f[1][0], len: f[1].length, from: s };
      }
    } else if (f && f[1][0] === fence.ch && f[1].length >= fence.len && line.trim().replace(/^(?:>\s*)*/, "").replace(/[`~]/g, "") === "") {
      fill(fence.from, e);
      fence = null;
    }
  }
  if (fence) fill(fence.from, text.length);
  const tick = /`+/g;
  let t;
  while (t = tick.exec(text)) {
    if (m[t.index]) continue;
    const n = t[0].length;
    const re = new RegExp("(^|[^`])`{" + n + "}(?!`)", "g");
    re.lastIndex = t.index + n;
    const c = re.exec(text);
    if (!c) continue;
    const end = c.index + c[1].length + n;
    if (/\n[ \t]*\n/.test(text.slice(t.index, end))) continue;
    fill(t.index, end);
    tick.lastIndex = end;
  }
  for (const re of [/%%[\s\S]*?%%/g, /<!--[\s\S]*?-->/g]) {
    let c;
    while (c = re.exec(text)) if (!m[c.index]) fill(c.index, c.index + c[0].length);
  }
  return m;
}
function parse(text) {
  const ign = ignoredMask(text);
  const starts = lineStarts(text);
  const lines = text.split("\n");
  const defs = /* @__PURE__ */ new Map();
  const inDef = new Uint8Array(text.length);
  for (let i = 0; i < lines.length; i++) {
    const m = /^\[\^(r\d+)\]:[ \t]?(.*)$/.exec(lines[i]);
    if (!m || ign[starts[i]]) continue;
    const parts = [m[2]];
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
    const from = starts[i], to = starts[last] + lines[last].length;
    inDef.fill(1, from, to);
    if (!defs.has(m[1])) defs.set(m[1], { from, to, comment: parts.join("\n").trimEnd() });
    i = last;
  }
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const stack = [];
  const marker = /\}\[\^(r\d+)\](?!:)/y;
  for (let i = 0; i < text.length; i++) {
    if (ign[i] || inDef[i]) continue;
    const c = text[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "{") {
      stack.push(i);
      continue;
    }
    if (c !== "}") continue;
    const open2 = stack.pop();
    marker.lastIndex = i;
    const m = marker.exec(text);
    if (!m || open2 === void 0 || seen.has(m[1])) continue;
    seen.add(m[1]);
    const d = defs.get(m[1]);
    out.push({
      id: m[1],
      open: open2,
      close: i,
      refEnd: i + m[0].length,
      defFrom: d ? d.from : -1,
      defTo: d ? d.to : -1,
      comment: d ? d.comment : ""
    });
    i += m[0].length - 1;
  }
  out.sort((a, b) => a.open - b.open);
  for (const [id, d] of defs) {
    if (!seen.has(id)) out.push({ id, open: -1, close: -1, refEnd: -1, defFrom: d.from, defTo: d.to, comment: d.comment });
  }
  return out;
}
var cache = null;
function analyze(text) {
  if (!cache || cache.text !== text) cache = { text, anns: parse(text), ign: ignoredMask(text) };
  return cache;
}
function nextId(anns) {
  let max = 0;
  for (const a of anns) max = Math.max(max, parseInt(a.id.slice(1), 10));
  return "r" + (max + 1);
}
function defText(id, comment) {
  return comment.split("\n").map((l, i) => i === 0 ? `[^${id}]: ${l}` : l.trim() === "" ? "" : "    " + l).join("\n");
}
function excerpt(s, n) {
  const first = s.split("\n")[0];
  return first.length > n || s.includes("\n") ? first.slice(0, n).trimEnd() + "\u2026" : first;
}
function headingStarts(text, ign = ignoredMask(text)) {
  const out = [];
  const re = /^#{1,6}(?:[ \t]|$)/gm;
  let m;
  while (m = re.exec(text)) if (!ign[m.index]) out.push(m.index);
  return out;
}
function sectionAt(text, offset) {
  const hs = headingStarts(text);
  let from = 0, to = text.length;
  for (const h of hs) {
    if (h <= offset) from = h;
    else {
      to = h;
      break;
    }
  }
  return { from, to };
}
var BLOCK_PREFIX = /^(?:[ \t]*(?:>[ \t]?|[-*+][ \t]+(?:\[.\][ \t]+)?|\d+[.)][ \t]+))*[ \t]*(?:#{1,6}[ \t]+)?/;
function blockPrefixLength(line) {
  var _a;
  return ((_a = BLOCK_PREFIX.exec(line)) != null ? _a : [""])[0].length;
}
function isTableLine(line) {
  return /^\s*\|/.test(line);
}
function planDefinition(text, anns, targetEnd, placement, def) {
  var _a;
  if (placement === "end-of-note") {
    const last = anns.filter((a) => a.defFrom >= 0).sort((a, b) => b.defTo - a.defTo)[0];
    if (last) return { at: last.defTo, insert: "\n" + def };
    let ce2 = text.length;
    while (ce2 > 0 && /\s/.test(text[ce2 - 1])) ce2--;
    return { at: ce2, insert: (ce2 > 0 ? "\n\n" : "") + def + (text.slice(ce2).includes("\n") ? "" : "\n") };
  }
  const { to: next } = sectionAt(text, targetEnd);
  let ce = next;
  while (ce > 0 && /\s/.test(text[ce - 1])) ce--;
  if (ce < targetEnd) ce = targetEnd;
  const afterDef = anns.some((a) => a.defFrom >= 0 && a.defTo === ce);
  let insert = (afterDef ? "\n" : "\n\n") + def;
  const gapNewlines = ((_a = text.slice(ce, next).match(/\n/g)) != null ? _a : []).length;
  if (next < text.length) {
    if (gapNewlines < 2) insert += "\n";
  } else if (gapNewlines === 0) insert += "\n";
  return { at: ce, insert };
}
function footnoteOrder(text) {
  const ign = ignoredMask(text);
  const defined = /* @__PURE__ */ new Set();
  const dre = /^\[\^([^\]\s]+)\]:/gm;
  let m;
  while (m = dre.exec(text)) if (!ign[m.index]) defined.add(m[1]);
  const out = [];
  const re = /\[\^([^\]\s]+)\](?!:)/g;
  while (m = re.exec(text)) {
    if (ign[m.index] || !defined.has(m[1]) || out.includes(m[1])) continue;
    out.push(m[1]);
  }
  return out;
}
function renderedBraces(text, from, to, anns, ign = ignoredMask(text)) {
  const out = [];
  const inDef = (i) => anns.some((a) => a.defFrom >= 0 && i >= a.defFrom && i < a.defTo);
  for (let i = from; i < to; i++) {
    const c = text[i];
    if ((c === "{" || c === "}") && !ign[i] && !inDef(i)) out.push(i);
  }
  return out;
}

// src/ui.ts
var app;
var owner;
function initUi(a, c) {
  app = a;
  owner = c;
}
var pop = null;
var popAnchor = null;
var pinned = false;
var hideTimer;
var popComp = null;
function isPopoverPinned() {
  return pinned;
}
function showPopover(anchor, a, sourcePath2, pin) {
  window.clearTimeout(hideTimer);
  if (pop && pinned && !pin) return;
  if (pop && pinned && pin && popAnchor === anchor) {
    hidePopover(true);
    return;
  }
  hidePopover(true);
  pinned = pin;
  popAnchor = anchor;
  pop = document.body.createDiv({ cls: "rm-popover" });
  pop.createDiv({ cls: "rm-popover-head", text: `Comment [^${a.id}]` });
  const body = pop.createDiv({ cls: "rm-popover-body markdown-rendered" });
  popComp = new import_obsidian2.Component();
  owner.addChild(popComp);
  if (a.comment) void import_obsidian2.MarkdownRenderer.render(app, a.comment, body, sourcePath2, popComp).then(() => place(anchor));
  else body.setText("(no definition found for this annotation)");
  pop.addEventListener("mouseenter", () => window.clearTimeout(hideTimer));
  pop.addEventListener("mouseleave", () => scheduleHide());
  place(anchor);
}
function place(anchor) {
  if (!pop) return;
  const r = anchor.getBoundingClientRect();
  const below = r.bottom + 6 + pop.offsetHeight <= window.innerHeight;
  const top = below ? r.bottom + 6 : r.top - pop.offsetHeight - 6;
  const left = Math.max(4, Math.min(r.left, window.innerWidth - pop.offsetWidth - 4));
  pop.setCssProps({ "--rm-top": `${Math.max(4, top)}px`, "--rm-left": `${left}px` });
}
function scheduleHide() {
  if (pinned) return;
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => hidePopover(false), 250);
}
function hidePopover(force) {
  if (!pop || pinned && !force) return;
  pop.remove();
  if (popComp) owner.removeChild(popComp);
  pop = null;
  popComp = null;
  popAnchor = null;
  pinned = false;
}
function popoverContains(n) {
  return !!pop && pop.contains(n);
}
function wireTarget(el, a, sourcePath2, isBadge) {
  el.addEventListener("mouseenter", () => {
    if (settings.showHover && !import_obsidian2.Platform.isMobile) showPopover(el, a, sourcePath2, false);
  });
  el.addEventListener("mouseleave", () => scheduleHide());
  if (isBadge || import_obsidian2.Platform.isMobile) {
    el.addEventListener("click", (e) => {
      if (!isBadge && !settings.showHover) return;
      e.preventDefault();
      e.stopPropagation();
      showPopover(el, a, sourcePath2, true);
    });
  }
}
function makeBadge(a, sourcePath2) {
  const el = createSpan({ cls: "rm-badge", attr: { "data-rm-id": a.id, "aria-label": "Comment" } });
  el.setText(a.comment ? excerpt(a.comment, settings.excerptLength) : `[^${a.id}]?`);
  wireTarget(el, a, sourcePath2, true);
  return el;
}

// src/render-live.ts
var import_obsidian3 = require("obsidian");
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");

// src/render-dom.ts
var SKIP = "code, pre, sup.footnote-ref, .rm-badge, .math, .cm-editor, .footnotes, .frontmatter, .table-row-drag-handle, .table-col-drag-handle";
function skipped(n, root) {
  for (let p = n.parentElement; p && p !== root; p = p.parentElement) if (p.matches(SKIP)) return true;
  return false;
}
function undecorate(root) {
  root.querySelectorAll(".rm-badge").forEach((b) => b.remove());
  root.querySelectorAll("sup.rm-hidden").forEach((s) => s.removeClass("rm-hidden"));
  root.querySelectorAll("span.rm-hidden, span.rm-target").forEach((s) => {
    var _a;
    return s.replaceWith(document.createTextNode((_a = s.textContent) != null ? _a : ""));
  });
  root.normalize();
}
function decorateRendered(root, text, from, to, sourcePath2) {
  if (root.querySelector(".rm-hidden, .rm-target, .rm-badge")) undecorate(root);
  const { anns, ign } = analyze(text);
  const hits = anns.filter((a) => a.open >= 0 && a.open < to && a.refEnd > from);
  if (!hits.length) return 0;
  const nodes = [];
  const braces = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while (n = w.nextNode()) {
    if (skipped(n, root)) continue;
    const t = n;
    for (let i = 0; i < t.data.length; i++) {
      const c = t.data[i];
      if (c === "{" || c === "}") braces.push({ ni: nodes.length, ci: i, ch: c });
    }
    nodes.push(t);
  }
  if (!nodes.length) return 0;
  const src = renderedBraces(text, from, to, anns, ign);
  if (src.length !== braces.length) console.debug("[review-marks] brace count differs", { from, to, src: src.length, dom: braces.length });
  const at = /* @__PURE__ */ new Map();
  for (let k = 0; k < Math.min(src.length, braces.length); k++) {
    if (text[src[k]] !== braces[k].ch) break;
    at.set(src[k], braces[k]);
  }
  const ivs = /* @__PURE__ */ new Map();
  const add = (ni, iv) => {
    if (!ivs.has(ni)) ivs.set(ni, []);
    ivs.get(ni).push(iv);
  };
  const badges = [];
  let done = 0;
  for (const a of hits) {
    const o = a.open >= from ? at.get(a.open) : { ni: 0, ci: -1 };
    const c = a.close < to ? at.get(a.close) : { ni: nodes.length - 1, ci: nodes[nodes.length - 1].length };
    if (!o || !c) continue;
    if (a.open >= from) add(o.ni, { s: o.ci, e: o.ci + 1, kind: "hide", ann: a });
    if (a.close < to) {
      const node = nodes[c.ni];
      const rest = node.data.slice(c.ci + 1);
      const ref = new RegExp("^(\\[\\^" + a.id + "\\]|" + a.id + "(?![0-9]))").exec(rest);
      add(c.ni, { s: c.ci, e: c.ci + 1 + (ref ? ref[0].length : 0), kind: "hide", ann: a, close: true });
      const sib = !ref && c.ci + 1 === node.length ? node.nextSibling : null;
      if (sib instanceof HTMLElement && sib.tagName === "SUP") {
        sib.addClass("rm-hidden");
        badges.push({ ann: a, after: sib });
      } else badges.push({ ann: a, after: "close" });
    }
    for (let k = o.ni; k <= c.ni; k++) {
      const s = k === o.ni ? o.ci + 1 : 0;
      const e = k === c.ni ? c.ci : nodes[k].length;
      if (e > s && nodes[k].data.slice(s, e).trim() !== "") add(k, { s, e, kind: "target", ann: a });
    }
    done++;
  }
  for (const [ni, list] of ivs) {
    const node = nodes[ni];
    const cuts = /* @__PURE__ */ new Set([0, node.length]);
    for (const iv of list) {
      cuts.add(Math.max(0, iv.s));
      cuts.add(Math.min(node.length, iv.e));
    }
    const pts = [...cuts].sort((x, y) => x - y);
    const frag = document.createDocumentFragment();
    for (let i = 0; i + 1 < pts.length; i++) {
      const s = pts[i], e = pts[i + 1];
      const piece = node.data.slice(s, e);
      const cover = list.filter((iv) => iv.s <= s && iv.e >= e);
      const hide2 = cover.find((iv) => iv.kind === "hide");
      const tgts = cover.filter((iv) => iv.kind === "target").sort((x, y) => x.ann.close - x.ann.open - (y.ann.close - y.ann.open));
      if (hide2) {
        const sp = createSpan({ cls: "rm-hidden", text: piece });
        if (hide2.close) sp.dataset.rmClose = hide2.ann.id;
        frag.appendChild(sp);
      } else if (tgts.length) {
        const sp = createSpan({ cls: "rm-target" + (tgts.length > 1 ? " rm-nested" : ""), text: piece });
        sp.dataset.rmId = tgts[0].ann.id;
        wireTarget(sp, tgts[0].ann, sourcePath2, false);
        frag.appendChild(sp);
      } else frag.appendChild(document.createTextNode(piece));
    }
    node.replaceWith(frag);
  }
  if (settings.showBadge) {
    for (const b of badges) {
      const after = b.after === "close" ? root.querySelector(`[data-rm-close="${b.ann.id}"]`) : b.after;
      after == null ? void 0 : after.after(makeBadge(b.ann, sourcePath2));
    }
  }
  return done;
}

// src/render-live.ts
var refreshEffect = import_state.StateEffect.define();
var annotationsField = import_state.StateField.define({
  create: (s) => analyze(s.doc.toString()).anns,
  update: (v, tr) => tr.docChanged ? analyze(tr.state.doc.toString()).anns : v
});
var setFocus = import_state.StateEffect.define();
var focusField = import_state.StateField.define({
  create: () => false,
  update: (v, tr) => {
    for (const e of tr.effects) if (e.is(setFocus)) v = e.value;
    return v;
  }
});
var focusTracker = [
  import_view.EditorView.focusChangeEffect.of((_s, focusing) => setFocus.of(focusing)),
  // An editor that already has focus when the extension loads (plugin reload) gets no focus event.
  import_view.ViewPlugin.define((view) => {
    const raf = window.requestAnimationFrame(() => {
      if (view.hasFocus) view.dispatch({ effects: setFocus.of(true) });
    });
    return { destroy: () => window.cancelAnimationFrame(raf) };
  })
];
var sourcePath = (s) => {
  var _a, _b, _c;
  return (_c = (_b = (_a = s.field(import_obsidian3.editorInfoField, false)) == null ? void 0 : _a.file) == null ? void 0 : _b.path) != null ? _c : "";
};
var BadgeWidget = class extends import_view.WidgetType {
  constructor(a, path, ver) {
    super();
    this.a = a;
    this.path = path;
    this.ver = ver;
  }
  eq(o) {
    return o.a.id === this.a.id && o.a.comment === this.a.comment && o.ver === this.ver;
  }
  toDOM() {
    return makeBadge(this.a, this.path);
  }
  ignoreEvent() {
    return true;
  }
};
var hide = import_view.Decoration.replace({});
var syntaxMark = import_view.Decoration.mark({ class: "rm-syntax" });
function build(s) {
  if (!s.field(import_obsidian3.editorLivePreviewField, false)) return import_view.Decoration.none;
  const doc = s.doc;
  const path = sourcePath(s);
  const out = [];
  const table = (pos) => isTableLine(doc.lineAt(pos).text);
  for (const a of s.field(annotationsField)) {
    if (a.defFrom >= 0) {
      const l1 = doc.lineAt(a.defFrom).number, l2 = doc.lineAt(a.defTo).number;
      for (let l = l1; l <= l2; l++) out.push(import_view.Decoration.line({ class: "rm-def-line" }).range(doc.line(l).from));
    }
    if (a.open < 0) continue;
    const touched = s.field(focusField, false) === true && s.selection.ranges.some((r) => r.from <= a.refEnd && r.to >= a.open);
    const mark = import_view.Decoration.mark({ class: "rm-target" + (touched ? " rm-revealed" : ""), attributes: { "data-rm-id": a.id } });
    for (let pos = a.open + 1; pos < a.close; ) {
      const line = doc.lineAt(pos);
      const end = Math.min(line.to, a.close);
      if (pos === line.from) pos += blockPrefixLength(line.text);
      if (end > pos && !isTableLine(line.text)) out.push(mark.range(pos, end));
      pos = line.to + 1;
    }
    if (!table(a.open)) out.push((touched ? syntaxMark : hide).range(a.open, a.open + 1));
    if (!table(a.close)) {
      if (touched) out.push(syntaxMark.range(a.close, a.refEnd));
      else if (settings.showBadge) out.push(import_view.Decoration.replace({ widget: new BadgeWidget(a, path, settingsVersion) }).range(a.close, a.refEnd));
      else out.push(hide.range(a.close, a.refEnd));
    }
  }
  return import_view.Decoration.set(out, true);
}
var decoField = import_state.StateField.define({
  create: build,
  update: (v, tr) => {
    const lp = tr.startState.field(import_obsidian3.editorLivePreviewField, false) !== tr.state.field(import_obsidian3.editorLivePreviewField, false);
    if (tr.docChanged || tr.selection || lp || tr.effects.some((e) => e.is(refreshEffect) || e.is(setFocus))) return build(tr.state);
    return v;
  },
  provide: (f) => import_view.EditorView.decorations.from(f)
});
var hover = import_view.EditorView.domEventHandlers({
  mouseover(e, view) {
    var _a, _b;
    if (!settings.showHover || import_obsidian3.Platform.isMobile || isPopoverPinned()) return;
    const t = (_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".cm-content .rm-target[data-rm-id]");
    if (!t || t.hasClass("rm-revealed") || t.closest(".cm-table-widget")) return;
    const a = view.state.field(annotationsField).find((x) => x.id === t.dataset.rmId);
    if (a) showPopover(t, a, sourcePath(view.state), false);
  },
  mouseout(e) {
    var _a, _b;
    if ((_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".rm-target")) scheduleHide();
  },
  // Clicking or typing into the text puts the cursor in the syntax: drop a hover popover.
  mousedown() {
    hidePopover(false);
  },
  keydown() {
    hidePopover(false);
  },
  click(e, view) {
    var _a, _b;
    if (!import_obsidian3.Platform.isMobile || !settings.showHover) return;
    const t = (_b = (_a = e.target).closest) == null ? void 0 : _b.call(_a, ".rm-target[data-rm-id]");
    const a = t && view.state.field(annotationsField).find((x) => x.id === t.dataset.rmId);
    if (t && a) showPopover(t, a, sourcePath(view.state), true);
  }
});
var tableScan = import_view.ViewPlugin.fromClass(class {
  constructor(view) {
    this.raf = 0;
    this.schedule(view);
  }
  update(u) {
    this.schedule(u.view);
  }
  schedule(view) {
    window.cancelAnimationFrame(this.raf);
    this.raf = window.requestAnimationFrame(() => scanTables(view));
  }
  destroy() {
    window.cancelAnimationFrame(this.raf);
  }
});
function splitCells(line, base) {
  const cells = [];
  let start = 0;
  for (let i = 0; i <= line.length; i++) {
    if (i < line.length && (line[i] !== "|" || line[i - 1] === "\\")) continue;
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
function scanTables(view) {
  const s = view.state;
  if (!s.field(import_obsidian3.editorLivePreviewField, false)) return;
  const anns = s.field(annotationsField).filter((a) => a.open >= 0 && isTableLine(s.doc.lineAt(a.open).text));
  if (!anns.length) return;
  const text = s.doc.toString();
  const path = sourcePath(s);
  view.dom.querySelectorAll(".cm-table-widget").forEach((w) => {
    let pos;
    try {
      pos = view.posAtDOM(w);
    } catch (e) {
      return;
    }
    let line = s.doc.lineAt(pos);
    const rows = [];
    for (let n = line.number; n <= s.doc.lines; n++) {
      line = s.doc.line(n);
      if (!isTableLine(line.text)) break;
      if (n !== s.doc.lineAt(pos).number + 1) rows.push({ from: line.from, text: line.text });
    }
    const trs = Array.from(w.querySelectorAll("table tr"));
    trs.forEach((tr, r) => {
      const row = rows[r];
      if (!row) return;
      const cells = splitCells(row.text, row.from);
      Array.from(tr.children).forEach((td, c) => {
        var _a;
        const cell = cells[c];
        const wrap = (_a = td.querySelector(".table-cell-wrapper")) != null ? _a : td;
        if (!cell || wrap.querySelector(".cm-editor")) return;
        if (!anns.some((a) => a.open < cell.to && a.refEnd > cell.from)) return;
        const sig = `${settingsVersion}:${text.slice(cell.from, cell.to)}`;
        if (wrap.dataset.rmSig === sig && wrap.querySelector(".rm-hidden")) return;
        wrap.dataset.rmSig = sig;
        decorateRendered(wrap, text, cell.from, cell.to, path);
      });
    });
  });
}
var livePreviewExtension = [annotationsField, focusField, focusTracker, import_state.Prec.highest(decoField), hover, tableScan];
function refreshLivePreview(app5) {
  for (const leaf of app5.workspace.getLeavesOfType("markdown")) {
    const v = leaf.view;
    if (!(v instanceof import_obsidian3.MarkdownView)) continue;
    const cm = v.editor.cm;
    if (!cm) continue;
    cm.dom.querySelectorAll(".cm-table-widget [data-rm-sig]").forEach((el) => el.removeAttribute("data-rm-sig"));
    cm.dispatch({ effects: refreshEffect.of(null) });
  }
}

// src/render-reading.ts
var import_obsidian4 = require("obsidian");
function registerReading(plugin) {
  plugin.registerMarkdownPostProcessor((el, ctx) => postProcess(plugin, el, ctx));
  plugin.registerEvent(plugin.app.vault.on("modify", async (f) => {
    if (!(f instanceof import_obsidian4.TFile) || f.extension !== "md") return;
    const shape = shapeOf(normalize(await plugin.app.vault.cachedRead(f)));
    const old = shapes.get(f.path);
    shapes.set(f.path, shape);
    if (old !== void 0 && old !== shape) rerenderPreviews(plugin, f.path);
  }));
}
var shapes = /* @__PURE__ */ new Map();
function shapeOf(text) {
  const starts = lineStarts(text);
  const line = (o) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const m = lo + hi + 1 >> 1;
      if (starts[m] <= o) lo = m;
      else hi = m - 1;
    }
    return lo;
  };
  return analyze(text).anns.map((a) => `${a.id}:${a.open < 0 ? -1 : line(a.open)}-${a.close < 0 ? -1 : line(a.close)}:${a.comment}`).join("|");
}
function rerenderPreviews(plugin, path) {
  var _a;
  for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
    const v = leaf.view;
    if (v instanceof import_obsidian4.MarkdownView && (!path || ((_a = v.file) == null ? void 0 : _a.path) === path)) v.previewMode.rerender(true);
  }
}
async function postProcess(plugin, el, ctx) {
  var _a;
  const info = ctx.getSectionInfo(el);
  let text;
  if (info) text = normalize(info.text);
  else {
    const f = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(f instanceof import_obsidian4.TFile)) return;
    text = normalize(await plugin.app.vault.cachedRead(f));
  }
  if (!shapes.has(ctx.sourcePath)) shapes.set(ctx.sourcePath, shapeOf(text));
  if (info) {
    const starts = lineStarts(text);
    const from = (_a = starts[info.lineStart]) != null ? _a : text.length;
    const to = info.lineEnd + 1 < starts.length ? starts[info.lineEnd + 1] - 1 : text.length;
    decorateRendered(el, text, from, to, ctx.sourcePath);
  } else {
    const { anns } = analyze(text);
    el.querySelectorAll("sup.footnote-ref").forEach((sup) => {
      var _a2, _b;
      const id = (_b = (_a2 = sup.querySelector("a[data-footref]")) == null ? void 0 : _a2.getAttribute("data-footref")) != null ? _b : "";
      const a = anns.find((x) => x.id === id && x.open >= 0);
      if (!a || !(sup instanceof HTMLElement) || sup.hasClass("rm-hidden")) return;
      sup.addClass("rm-hidden");
      const prev = sup.previousSibling;
      if (prev instanceof Text && prev.data.endsWith("}")) prev.data = prev.data.slice(0, -1);
      if (settings.showBadge) sup.after(makeBadge(a, ctx.sourcePath));
    });
  }
  el.querySelectorAll("section.footnotes").forEach((sec) => {
    var _a2, _b, _c;
    const order = footnoteOrder(text);
    const items = Array.from(sec.querySelectorAll('li[id^="fn-"]'));
    let hidden = 0;
    for (const li of items) {
      const num = parseInt((_b = (_a2 = /^fn-(\d+)/.exec(li.id)) == null ? void 0 : _a2[1]) != null ? _b : "0", 10);
      const label = (_c = order[num - 1]) != null ? _c : "";
      if (li instanceof HTMLLIElement && num) li.value = num;
      if (!REVIEW_ID.test(label)) continue;
      li.addClass("rm-review-fn");
      li.setAttribute("data-rm-id", label);
      if (settings.hideReviewFootnotes) {
        li.addClass("rm-hidden");
        hidden++;
      }
    }
    if (items.length && hidden === items.length) sec.addClass("rm-hidden");
  });
}

// src/commands.ts
var import_obsidian6 = require("obsidian");

// src/comment-box.ts
var import_obsidian5 = require("obsidian");
var import_state2 = require("@codemirror/state");
var import_view2 = require("@codemirror/view");
var cmOf = (editor) => editor.cm;
var captures = /* @__PURE__ */ new Set();
var commentBoxExtension = import_view2.ViewPlugin.define(() => ({
  update(u) {
    if (!u.docChanged) return;
    for (const c of captures) {
      if (c.view !== u.view) continue;
      if (c.recording) {
        c.created = c.created ? c.created.compose(u.changes) : u.changes;
        if (!c.startDoc) c.startDoc = u.startState.doc;
      } else c.later = c.later ? c.later.compose(u.changes) : u.changes;
    }
  }
}));
function keepScroll(cm, f) {
  if (!cm) return f();
  const snap = cm.scrollSnapshot();
  const out = f();
  cm.dispatch({ effects: snap });
  return out;
}
var active = null;
function commitActiveBox() {
  if (active) finish(active, "away");
}
function annotateWithBox(editor, from, to, refocus) {
  commitActiveBox();
  const cm = cmOf(editor);
  const cap = cm ? { view: cm, created: null, startDoc: null, later: null, recording: true } : null;
  if (cap) captures.add(cap);
  const id = keepScroll(cm, () => createAnnotation(editor, from, to, ""));
  if (cap) cap.recording = false;
  if (!id) {
    if (cap) captures.delete(cap);
    return null;
  }
  open(editor, id, "", true, refocus, cap);
  return id;
}
function editWithBox(editor, id, refocus) {
  var _a;
  commitActiveBox();
  const a = analyze(editor.getValue()).anns.find((x) => x.id === id);
  open(editor, id, (_a = a == null ? void 0 : a.comment) != null ? _a : "", false, refocus, null);
}
function open(editor, id, initial, isNew, refocus, cap) {
  var _a, _b;
  const el = document.body.createDiv({ cls: "rm-cbox" + (import_obsidian5.Platform.isMobile ? " is-mobile" : "") });
  el.createDiv({ cls: "rm-cbox-head", text: `Comment [^${id}]` });
  const ta = el.createEl("textarea", { cls: "rm-cbox-input", attr: { rows: "1", placeholder: "Write a comment\u2026", spellcheck: "true" } });
  ta.value = initial;
  const foot = el.createDiv({ cls: "rm-cbox-foot" });
  foot.createSpan({ cls: "rm-cbox-hint", text: "Enter saves \xB7 Shift+Enter new line \xB7 Esc cancels" });
  const cancelBtn = foot.createEl("button", { cls: "rm-cbox-btn", text: "Cancel" });
  const saveBtn = foot.createEl("button", { cls: "rm-cbox-btn mod-cta", text: "Save" });
  hidePopover(true);
  document.body.addClass("rm-cbox-open");
  const b = { el, ta, editor, cm: cmOf(editor), id, initial, isNew, refocus, cap, off: [] };
  active = b;
  ta.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      finish(b, "save");
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish(b, "cancel");
    }
  });
  ta.addEventListener("input", () => {
    grow(ta);
    place2(b);
  });
  cancelBtn.addEventListener("click", () => finish(b, "cancel"));
  saveBtn.addEventListener("click", () => finish(b, "save"));
  const away = (e) => {
    if (active === b && !el.contains(e.target)) finish(b, "away");
  };
  const reposition = () => place2(b);
  document.addEventListener("pointerdown", away, true);
  document.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition);
  (_a = window.visualViewport) == null ? void 0 : _a.addEventListener("resize", reposition);
  (_b = window.visualViewport) == null ? void 0 : _b.addEventListener("scroll", reposition);
  b.off.push(() => {
    var _a2, _b2;
    document.removeEventListener("pointerdown", away, true);
    document.removeEventListener("scroll", reposition, true);
    window.removeEventListener("resize", reposition);
    (_a2 = window.visualViewport) == null ? void 0 : _a2.removeEventListener("resize", reposition);
    (_b2 = window.visualViewport) == null ? void 0 : _b2.removeEventListener("scroll", reposition);
  });
  grow(ta);
  place2(b);
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(ta.value.length, ta.value.length);
  let n = 0;
  const settle = () => {
    if (active !== b) return;
    place2(b);
    if (++n < 3) window.requestAnimationFrame(settle);
  };
  window.requestAnimationFrame(settle);
}
function grow(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight + 2, 220) + "px";
}
function finish(b, how) {
  if (active !== b) return;
  active = null;
  for (const f of b.off) f();
  b.el.remove();
  document.body.removeClass("rm-cbox-open");
  const v = b.ta.value.replace(/\s+$/, "").replace(/^\s*\n/, "");
  const alive = !b.cm || b.cm.dom.isConnected;
  if (alive) {
    if (how === "cancel" || !v.trim()) {
      if (b.isNew) removeNew(b);
    } else if (b.isNew || v !== b.initial) keepScroll(b.cm, () => void writeComment(b.editor, b.id, v));
  }
  if (b.cap) captures.delete(b.cap);
  if (alive && b.refocus) b.cm ? b.cm.focus() : b.editor.focus();
}
function removeNew(b) {
  const cap = b.cap;
  if (cap && cap.created && cap.startDoc) {
    let inv = cap.created.invert(cap.startDoc);
    if (cap.later) inv = inv.map(cap.later);
    cap.view.dispatch({ changes: inv, annotations: import_state2.Transaction.addToHistory.of(false) });
    return;
  }
  b.editor.undo();
}
function anchorRect(b) {
  const cm = b.cm;
  if (!cm) return null;
  const rects = [];
  cm.dom.querySelectorAll(`.rm-target[data-rm-id="${b.id}"]`).forEach((e2) => {
    for (const r of Array.from(e2.getClientRects())) if (r.width || r.height) rects.push(r);
  });
  if (rects.length) {
    const top2 = Math.min(...rects.map((r) => r.top)), bottom2 = Math.max(...rects.map((r) => r.bottom));
    const oneLine = rects.every((r) => Math.abs(r.top - rects[0].top) < 4);
    return { left: oneLine ? rects[0].left : Math.min(...rects.map((r) => r.left)), top: top2, bottom: bottom2 };
  }
  const a = analyze(cm.state.doc.toString()).anns.find((x) => x.id === b.id);
  if (!a) return null;
  const s = a.open >= 0 ? a.open : a.defFrom, e = a.open >= 0 ? a.refEnd : a.defTo;
  const c1 = cm.coordsAtPos(s, 1), c2 = cm.coordsAtPos(e, -1);
  if (!c1 && !c2) return null;
  const top = (c1 != null ? c1 : c2).top, bottom = (c2 != null ? c2 : c1).bottom;
  const left = c1 && c2 && Math.abs(c1.top - c2.top) < 4 ? c1.left : cm.contentDOM.getBoundingClientRect().left;
  return { left, top, bottom };
}
function place2(b) {
  var _a;
  if (b.cm && !b.cm.dom.isConnected) {
    finish(b, "away");
    return;
  }
  const vv = window.visualViewport;
  const vTop = vv ? vv.offsetTop : 0;
  const vBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const vRight = vv ? vv.offsetLeft + vv.width : window.innerWidth;
  const h = b.el.offsetHeight, w = b.el.offsetWidth;
  const r = (_a = anchorRect(b)) != null ? _a : (() => {
    var _a2, _b;
    const s = ((_b = (_a2 = b.cm) == null ? void 0 : _a2.scrollDOM) != null ? _b : document.body).getBoundingClientRect();
    return { left: s.left + 16, top: s.top + s.height / 3, bottom: s.top + s.height / 3 };
  })();
  let top = r.bottom + 4;
  if (top + h > vBottom - 4) {
    const above = r.top - h - 4;
    top = above >= vTop + 4 ? above : vBottom - h - 4;
  }
  top = Math.max(vTop + 4, top);
  const left = Math.max(4, Math.min(r.left, vRight - w - 4));
  b.el.setCssProps({ "--rm-top": `${top}px`, "--rm-left": `${left}px` });
}

// src/commands.ts
var app2;
function registerCommands(plugin) {
  app2 = plugin.app;
  plugin.addCommand({
    id: "annotate-selection",
    name: "Annotate selection",
    editorCallback: (editor) => {
      const from = editor.getCursor("from"), to = editor.getCursor("to");
      const err = checkTarget(editor.getValue(), editor.posToOffset(from), editor.posToOffset(to));
      if (typeof err === "string") {
        new import_obsidian6.Notice("Review Marks: " + err);
        return;
      }
      annotateWithBox(editor, from, to, true);
    }
  });
  plugin.addCommand({
    id: "edit-comment-at-cursor",
    name: "Edit comment at cursor",
    editorCallback: (editor) => {
      const a = annotationAt(editor.getValue(), editor.posToOffset(editor.getCursor("head")));
      if (!a) {
        new import_obsidian6.Notice("Review Marks: no annotation at the cursor.");
        return;
      }
      editWithBox(editor, a.id, true);
    }
  });
}
function annotationAt(text, off) {
  var _a;
  const { anns } = analyze(text);
  return (_a = anns.filter((a) => a.open >= 0 && off >= a.open && off <= a.refEnd).sort((x, y) => x.refEnd - x.open - (y.refEnd - y.open))[0]) != null ? _a : anns.find((a) => a.defFrom >= 0 && off >= a.defFrom && off <= a.defTo);
}
function checkTarget(text, f, t) {
  if (f > t) [f, t] = [t, f];
  const trim = () => {
    while (f < t && /\s/.test(text[f])) f++;
    while (t > f && /\s/.test(text[t - 1])) t--;
  };
  trim();
  const lineStart = (o) => text.lastIndexOf("\n", o - 1) + 1;
  const lineText = (o) => {
    const s = lineStart(o);
    const e = text.indexOf("\n", s);
    return text.slice(s, e < 0 ? text.length : e);
  };
  const pf = blockPrefixLength(lineText(f));
  if (f - lineStart(f) < pf) {
    f = lineStart(f) + pf;
    trim();
  }
  const lt = lineStart(t);
  if (lt > f && t - lt <= blockPrefixLength(lineText(t))) {
    t = lt - 1;
    trim();
  }
  if (f >= t) return "select the text to annotate first.";
  const { anns, ign } = analyze(text);
  if (ign[f] || ign[t - 1]) return "a Target cannot start or end inside code or a comment.";
  for (const a of anns) {
    if (a.defFrom >= 0 && f < a.defTo && t > a.defFrom) return `the selection includes the comment of [^${a.id}].`;
    if (a.open < 0) continue;
    if (f > a.close && f < a.refEnd || t > a.close && t < a.refEnd) return `the selection starts or ends inside the marker [^${a.id}].`;
    if (a.open < f && f < a.refEnd && t > a.refEnd || f < a.open && t > a.open && t < a.refEnd) return `the selection overlaps annotation [^${a.id}].`;
  }
  let depth = 0;
  for (let i = f; i < t; i++) {
    if (ign[i]) continue;
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth < 0) break;
  }
  if (depth !== 0) return "the selection has an unmatched { or }.";
  if (isTableLine(lineText(f)) || isTableLine(lineText(t))) {
    if (lineStart(f) !== lineStart(t) || /(^|[^\\])\|/.test(text.slice(f, t))) return "in a table, a Target must stay inside one cell.";
  }
  return { from: f, to: t };
}
function createAnnotation(editor, from, to, comment) {
  const text = editor.getValue();
  const r = checkTarget(text, editor.posToOffset(from), editor.posToOffset(to));
  if (typeof r === "string") {
    new import_obsidian6.Notice("Review Marks: " + r);
    return null;
  }
  const { anns } = analyze(text);
  const id = nextId(anns);
  const plan = planDefinition(text, anns, r.to, settings.placement, defText(id, comment));
  const ins = /* @__PURE__ */ new Map();
  const put = (at, s, before = false) => {
    var _a, _b;
    return ins.set(at, before ? s + ((_a = ins.get(at)) != null ? _a : "") : ((_b = ins.get(at)) != null ? _b : "") + s);
  };
  put(r.from, "{");
  put(r.to, `}[^${id}]`);
  put(plan.at, plan.insert, plan.at === r.from);
  const changes = [...ins].sort((a, b) => a[0] - b[0]).map(([at, s]) => {
    const p = editor.offsetToPos(at);
    return { from: p, to: p, text: s };
  });
  editor.transaction({ changes });
  return id;
}
function commentChange(text, id, comment) {
  const { anns } = analyze(text);
  const a = anns.find((x) => x.id === id);
  if (!a) return null;
  if (a.defFrom >= 0) return { from: a.defFrom, to: a.defTo, insert: defText(id, comment) };
  const p = planDefinition(text, anns, a.refEnd, settings.placement, defText(id, comment));
  return { from: p.at, to: p.at, insert: p.insert };
}
async function writeComment(target, id, comment) {
  if (target instanceof import_obsidian6.TFile) {
    let ok = false;
    await app2.vault.process(target, (data) => {
      const crlf = data.includes("\r\n");
      const text = normalize(data);
      const c2 = commentChange(text, id, comment);
      if (!c2) return data;
      ok = true;
      const out = text.slice(0, c2.from) + c2.insert + text.slice(c2.to);
      return crlf ? out.replace(/\n/g, "\r\n") : out;
    });
    return ok;
  }
  const c = commentChange(target.getValue(), id, comment);
  if (!c) return false;
  target.transaction({ changes: [{ from: target.offsetToPos(c.from), to: target.offsetToPos(c.to), text: c.insert }] });
  return true;
}

// src/convert.ts
var import_state3 = require("@codemirror/state");
var import_obsidian7 = require("obsidian");
function registerConvertCommands(plugin) {
  plugin.addCommand({
    id: "move-comments-to-end-of-note",
    name: "Move comments to end of note",
    editorCallback: (editor) => applyPlacement(editor, "end-of-note")
  });
  plugin.addCommand({
    id: "move-comments-to-end-of-sections",
    name: "Move comments to end of sections",
    editorCallback: (editor) => applyPlacement(editor, "end-of-section")
  });
}
var isBlank = (l) => l.trim() === "";
function convertPlacement(text, placement) {
  const anns = parse(text);
  const movable = anns.filter((a) => a.open >= 0 && a.defFrom >= 0).sort((a, b) => a.close - b.close);
  const orphanMarkers = anns.filter((a) => a.open >= 0 && a.defFrom < 0).length;
  let orphanDefs = anns.filter((a) => a.open < 0).length;
  const ign = ignoredMask(text);
  let defLines = 0;
  for (let m, re = /^\[\^r\d+\]:/gm; m = re.exec(text); ) if (!ign[m.index]) defLines++;
  orphanDefs += Math.max(0, defLines - movable.length - orphanDefs);
  if (!movable.length) return { text, moved: 0, orphanDefs, orphanMarkers };
  const hadNL = text.endsWith("\n");
  const body = hadNL ? text.slice(0, -1) : text;
  const lines = body.split("\n");
  const starts = lineStarts(body);
  const lineOf = (off) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = lo + hi + 1 >> 1;
      if (starts[mid] <= off) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const heads = headingStarts(text);
  const sectionOf = (off) => {
    let k = 0;
    for (const h of heads) {
      if (h <= off) k++;
      else break;
    }
    return k;
  };
  const removed = new Uint8Array(lines.length);
  const blocks = movable.map((a) => {
    const s = lineOf(a.defFrom), e = lineOf(a.defTo);
    removed.fill(1, s, e + 1);
    return { section: sectionOf(a.close), lines: lines.slice(s, e + 1) };
  });
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    if (!removed[i] && !(isBlank(lines[i]) && touchesRemoved(i))) {
      kept.push(lines[i]);
      continue;
    }
    let e = i;
    while (e + 1 < lines.length && (removed[e + 1] || isBlank(lines[e + 1]))) e++;
    const firstBlank = lines.slice(i, e + 1).find((l, j) => !removed[i + j] && isBlank(l));
    if (kept.length && e + 1 < lines.length && firstBlank !== void 0) kept.push(firstBlank);
    i = e;
  }
  function touchesRemoved(i) {
    for (let j = i; j >= 0 && (removed[j] || isBlank(lines[j])); j--) if (removed[j]) return true;
    for (let j = i; j < lines.length && (removed[j] || isBlank(lines[j])); j++) if (removed[j]) return true;
    return false;
  }
  const insertAfter = (out2, from, to, defs, beforeHeading) => {
    let last = to - 1;
    while (last >= from && isBlank(out2[last])) last--;
    const gap = out2.slice(last + 1, to);
    const add = ["", ...defs, ...beforeHeading && gap.length === 0 ? [""] : []];
    out2.splice(last + 1, 0, ...add);
    return add.length;
  };
  let out = kept;
  if (placement === "end-of-note") {
    insertAfter(out, 0, out.length, blocks.flatMap((b) => b.lines), false);
  } else {
    const keptText = out.join("\n") + (hadNL ? "\n" : "");
    const ks = lineStarts(keptText);
    const keptHeads = headingStarts(keptText);
    if (keptHeads.length !== heads.length) return "the headings changed while moving the comments; nothing was changed.";
    const bounds = [0, ...keptHeads.map((h) => ks.indexOf(h)), out.length];
    for (let k = heads.length; k >= 0; k--) {
      const defs = blocks.filter((b) => b.section === k).flatMap((b) => b.lines);
      if (defs.length) insertAfter(out, bounds[k], bounds[k + 1], defs, k < heads.length);
    }
  }
  return { text: out.join("\n") + (hadNL ? "\n" : ""), moved: movable.length, orphanDefs, orphanMarkers };
}
function applyPlacement(editor, placement) {
  const old = editor.getValue();
  const r = convertPlacement(old, placement);
  if (typeof r === "string") {
    new import_obsidian7.Notice("Review Marks: " + r);
    return;
  }
  const orphans = [];
  if (r.orphanDefs) orphans.push(`${r.orphanDefs} comment${r.orphanDefs === 1 ? "" : "s"} without a marker`);
  if (r.orphanMarkers) orphans.push(`${r.orphanMarkers} marker${r.orphanMarkers === 1 ? "" : "s"} without a comment`);
  const orphanMsg = orphans.length ? ` Left in place: ${orphans.join(" and ")}.` : "";
  const where = placement === "end-of-note" ? "the end of the note" : "the end of their sections";
  if (r.text === old) {
    new import_obsidian7.Notice(`Review Marks: ${r.moved ? `comments are already at ${where}.` : "no comments to move."}${orphanMsg}`);
    return;
  }
  const diff = lineChanges(old, r.text);
  const cm = editor.cm;
  if (cm && typeof cm.scrollSnapshot === "function") {
    const cs = import_state3.ChangeSet.of(diff, old.length);
    cm.dispatch({ changes: cs, effects: cm.scrollSnapshot().map(cs), userEvent: "input.review-marks.convert" });
  } else {
    editor.transaction({ changes: diff.map((c) => ({ from: editor.offsetToPos(c.from), to: editor.offsetToPos(c.to), text: c.insert })) });
  }
  new import_obsidian7.Notice(`Review Marks: moved ${r.moved} comment${r.moved === 1 ? "" : "s"} to ${where}.${orphanMsg}`);
}
function lineChanges(a, b) {
  const split = (s) => {
    var _a;
    return (_a = s.match(/[^\n]*\n|[^\n]+$/g)) != null ? _a : [];
  };
  const A = split(a), B = split(b);
  const N = A.length, M = B.length, max = N + M, off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let done = false;
  for (let d = 0; d <= max && !done; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x2 = k === -d || k !== d && v[off + k - 1] < v[off + k + 1] ? v[off + k + 1] : v[off + k - 1] + 1;
      let y2 = x2 - k;
      while (x2 < N && y2 < M && A[x2] === B[y2]) {
        x2++;
        y2++;
      }
      v[off + k] = x2;
      if (x2 >= N && y2 >= M) {
        done = true;
        break;
      }
    }
  }
  const ops = [];
  let x = N, y = M;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vv = trace[d], k = x - y;
    const prevK = k === -d || k !== d && vv[off + k - 1] < vv[off + k + 1] ? k + 1 : k - 1;
    const px = d === 0 ? 0 : vv[off + prevK], py = d === 0 ? 0 : px - prevK;
    while (x > px && y > py) {
      ops.push("k");
      x--;
      y--;
    }
    if (d > 0) {
      if (x === px) {
        ops.push("i");
        y--;
      } else {
        ops.push("d");
        x--;
      }
    }
  }
  ops.reverse();
  const starts = [0];
  for (const l of A) starts.push(starts[starts.length - 1] + l.length);
  const out = [];
  let i = 0, j = 0, cur = null;
  for (const op of ops) {
    if (op === "k") {
      if (cur) {
        out.push(cur);
        cur = null;
      }
      i++;
      j++;
      continue;
    }
    if (!cur) cur = { from: starts[i], to: starts[i], insert: "" };
    if (op === "d") {
      i++;
      cur.to = starts[i];
    } else {
      cur.insert += B[j];
      j++;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// src/sidebar.ts
var import_obsidian8 = require("obsidian");
var VIEW_TYPE_ANNOTATIONS = "proto-review-marks-sidebar";
var EXCERPT = 80;
var app3;
function registerSidebar(plugin) {
  app3 = plugin.app;
  plugin.registerView(VIEW_TYPE_ANNOTATIONS, (leaf) => new AnnotationsView(leaf));
  const open2 = () => openSidebar(plugin);
  plugin.addRibbonIcon("message-square-text", "Open annotations sidebar", open2);
  plugin.addCommand({ id: "open-annotations-sidebar", name: "Open annotations sidebar", callback: open2 });
}
async function openSidebar(plugin) {
  var _a;
  const ws = plugin.app.workspace;
  const leaf = (_a = ws.getLeavesOfType(VIEW_TYPE_ANNOTATIONS)[0]) != null ? _a : ws.getRightLeaf(false);
  if (!leaf) return;
  if (!(leaf.view instanceof AnnotationsView)) await leaf.setViewState({ type: VIEW_TYPE_ANNOTATIONS, active: true });
  await ws.revealLeaf(leaf);
}
function targetExcerpt(text, a) {
  const raw = text.slice(a.open + 1, a.close);
  const flat = raw.split("\n").map((l, i) => (i === 0 ? l : l.slice(blockPrefixLength(l))).replace(/^\|\s*|\s*\|$/g, "").trim()).filter((l) => l !== "").join(" / ").replace(/\}\[\^r\d+\]/g, "").replace(/[{}]/g, "").replace(/\[\[([^\]|]*?)(?:\\?\|([^\]]*))?\]\]/g, (_m, p, alias) => alias != null ? alias : p).replace(/\*\*|__|==|~~/g, "").replace(/\s+/g, " ");
  return flat.length > EXCERPT ? flat.slice(0, EXCERPT).trimEnd() + "\u2026" : flat;
}
function headingTitle(line) {
  return line.replace(/^#{1,6}\s*/, "").replace(/\}\[\^r\d+\]/g, "").replace(/[{}]/g, "").replace(/\s+#+\s*$/, "").trim() || "(untitled heading)";
}
function buildGroups(text, noteName) {
  const { anns, ign } = analyze(text);
  const hs = headingStarts(text, ign);
  const top = { title: noteName, level: 0, anns: [], children: [], total: 0 };
  const heads = hs.map((h) => {
    const e = text.indexOf("\n", h);
    const line = text.slice(h, e < 0 ? text.length : e);
    return { title: headingTitle(line), level: /^#+/.exec(line)[0].length, anns: [], children: [], total: 0 };
  });
  const orphans = [];
  for (const a of anns) {
    if (a.open < 0) {
      orphans.push(a);
      continue;
    }
    let gi = -1;
    for (let i = 0; i < hs.length && hs[i] <= a.open; i++) gi = i;
    (gi < 0 ? top : heads[gi]).anns.push(a);
  }
  const roots = [top];
  const stack = [];
  for (const g of heads) {
    while (stack.length && stack[stack.length - 1].level >= g.level) stack.pop();
    (stack.length ? stack[stack.length - 1].children : roots).push(g);
    stack.push(g);
  }
  const prune = (gs) => gs.filter((g) => {
    g.children = prune(g.children);
    g.total = g.anns.length + g.children.reduce((n, c) => n + c.total, 0);
    return g.total > 0;
  });
  return { roots: prune(roots), orphans, total: anns.length };
}
function cleanComment(s) {
  return s.replace(/\s+$/, "").replace(/^\s*\n/, "").split("\n").map((l) => l.trim() === "" ? "" : l).join("\n");
}
function unwrapChanges(text, id) {
  const a = analyze(text).anns.find((x) => x.id === id);
  if (!a) return null;
  const out = [];
  if (a.open >= 0) out.push({ from: a.open, to: a.open + 1 }, { from: a.close, to: a.refEnd });
  if (a.defFrom >= 0) {
    let s = a.defFrom, e = a.defTo;
    if (text[e] === "\n") e++;
    if (e >= text.length) {
      while (s > 1 && text[s - 1] === "\n" && text[s - 2] === "\n") s--;
    } else if (text[e] === "\n" && (s === 0 || text[s - 1] === "\n" && text[s - 2] === "\n")) e++;
    out.push({ from: s, to: e });
  }
  return out.sort((x, y) => x.from - y.from);
}
async function unwrapAnnotation(target, id) {
  if (target instanceof import_obsidian8.TFile) {
    let ok = false;
    await app3.vault.process(target, (data) => {
      const crlf = data.includes("\r\n");
      const text = normalize(data);
      const ch2 = unwrapChanges(text, id);
      if (!ch2) return data;
      ok = true;
      let out = "";
      let at = 0;
      for (const c of ch2) {
        out += text.slice(at, c.from);
        at = c.to;
      }
      out += text.slice(at);
      return crlf ? out.replace(/\n/g, "\r\n") : out;
    });
    return ok;
  }
  const ch = unwrapChanges(target.getValue(), id);
  if (!ch) return false;
  target.transaction({ changes: ch.map((c) => ({ from: target.offsetToPos(c.from), to: target.offsetToPos(c.to), text: "" })) });
  return true;
}
var AnnotationsView = class extends import_obsidian8.ItemView {
  constructor(leaf) {
    super(leaf);
    this.file = null;
    /** The markdown leaf the listed note was last active in (the sidebar itself takes focus when used). */
    this.noteLeaf = null;
    this.text = "";
    this.sig = "";
    this.timer = 0;
    this.collapsed = /* @__PURE__ */ new Set();
    this.scope = new import_obsidian8.Scope(this.app.scope);
    this.scope.register(["Mod"], "Enter", () => {
      var _a;
      const ta = document.activeElement;
      if (!(ta instanceof HTMLTextAreaElement) || !((_a = this.listEl) == null ? void 0 : _a.contains(ta))) return;
      void this.save(ta);
      return false;
    });
  }
  getViewType() {
    return VIEW_TYPE_ANNOTATIONS;
  }
  getDisplayText() {
    return "Annotations";
  }
  getIcon() {
    return "message-square-text";
  }
  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("rm-sidebar");
    this.countEl = this.contentEl.createDiv({ cls: "rm-sb-count" });
    this.listEl = this.contentEl.createDiv({ cls: "rm-sb-list" });
    const ws = this.app.workspace;
    this.registerEvent(ws.on("active-leaf-change", (leaf) => this.onLeaf(leaf)));
    this.registerEvent(ws.on("file-open", () => {
      var _a, _b;
      return this.onLeaf((_b = (_a = ws.getActiveViewOfType(import_obsidian8.MarkdownView)) == null ? void 0 : _a.leaf) != null ? _b : null);
    }));
    this.registerEvent(ws.on("editor-change", (_e, info) => {
      if (info.file && info.file === this.file) this.schedule();
    }));
    this.registerEvent(this.app.vault.on("modify", (f) => {
      if (f === this.file) this.schedule();
    }));
    this.registerEvent(this.app.vault.on("rename", (f) => {
      if (f === this.file) this.schedule();
    }));
    this.registerEvent(this.app.vault.on("delete", (f) => {
      if (f === this.file) {
        this.file = null;
        this.noteLeaf = null;
        void this.refresh();
      }
    }));
    ws.onLayoutReady(() => {
      var _a, _b;
      const leaf = (_b = (_a = ws.getActiveViewOfType(import_obsidian8.MarkdownView)) == null ? void 0 : _a.leaf) != null ? _b : ws.getMostRecentLeaf(ws.rootSplit);
      this.onLeaf(leaf);
      if (!this.file) void this.refresh();
    });
  }
  async onClose() {
    window.clearTimeout(this.timer);
  }
  onLeaf(leaf) {
    if (leaf && leaf.view instanceof import_obsidian8.MarkdownView) {
      this.noteLeaf = leaf;
      this.file = leaf.view.file;
    } else if (leaf && leaf.getRoot() === this.app.workspace.rootSplit) {
      this.noteLeaf = null;
      this.file = null;
    } else return;
    void this.refresh();
  }
  schedule() {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.refresh(), 250);
  }
  /** The open editor for the listed note, if any (also usable in Reading view). */
  editor() {
    const leaves = [this.noteLeaf, ...this.app.workspace.getLeavesOfType("markdown")];
    for (const l of leaves) if (l && l.view instanceof import_obsidian8.MarkdownView && l.view.file === this.file) return l.view.editor;
    return null;
  }
  markdownView() {
    const leaves = [this.noteLeaf, ...this.app.workspace.getLeavesOfType("markdown")];
    for (const l of leaves) if (l && l.view instanceof import_obsidian8.MarkdownView && l.view.file === this.file) return l.view;
    return null;
  }
  async readText() {
    if (!this.file) return "";
    const ed = this.editor();
    return normalize(ed ? ed.getValue() : await this.app.vault.cachedRead(this.file));
  }
  async refresh() {
    window.clearTimeout(this.timer);
    const file = this.file;
    const text = await this.readText();
    if (file !== this.file) return;
    this.text = text;
    if (!file) {
      this.sig = "";
      this.countEl.setText("");
      this.listEl.empty();
      this.listEl.createDiv({ cls: "rm-sb-empty", text: "Open a note to see its annotations." });
      return;
    }
    const { roots, orphans, total } = buildGroups(text, file.basename);
    this.countEl.setText(total === 1 ? "1 annotation" : `${total} annotations`);
    if (!total) {
      this.sig = "";
      this.listEl.empty();
      this.listEl.createDiv({ cls: "rm-sb-empty", text: "No annotations in this note." });
      return;
    }
    const parts = [file.path];
    const walk = (gs) => {
      for (const g of gs) {
        parts.push(`[${g.level}:${g.title}:${g.total}`, ...g.anns.map((a) => a.id + ":" + targetExcerpt(text, a)));
        walk(g.children);
        parts.push("]");
      }
    };
    walk(roots);
    parts.push(...orphans.map((a) => a.id));
    const sig = parts.join("\n");
    if (sig === this.sig) {
      this.patch(roots, orphans);
      return;
    }
    const samePath = this.sig.startsWith(file.path + "\n");
    this.sig = sig;
    this.rebuild(roots, orphans, samePath);
  }
  /** Same entries as before: only the comments may have changed. Leaves a textarea being typed in alone. */
  patch(roots, orphans) {
    var _a;
    const all = [...orphans];
    const walk = (gs) => {
      for (const g of gs) {
        all.push(...g.anns);
        walk(g.children);
      }
    };
    walk(roots);
    for (const a of all) {
      const ta = this.listEl.querySelector(`textarea[data-rm-id="${a.id}"]`);
      if (!ta) continue;
      const saved = (_a = ta.dataset.saved) != null ? _a : "";
      if (a.comment === saved) continue;
      if (document.activeElement !== ta || ta.value === saved) {
        ta.value = a.comment;
        fit(ta);
      }
      ta.dataset.saved = a.comment;
    }
  }
  rebuild(roots, orphans, samePath) {
    const act = document.activeElement;
    const keep = act instanceof HTMLTextAreaElement && this.listEl.contains(act) ? { id: act.dataset.rmId, value: act.value, saved: act.dataset.saved, s: act.selectionStart, e: act.selectionEnd } : null;
    const scroll = samePath ? this.contentEl.scrollTop : 0;
    this.listEl.empty();
    for (const g of roots) this.renderGroup(this.listEl, g);
    if (orphans.length) {
      const g = { title: "Comments without a target", level: 1, anns: orphans, children: [], total: orphans.length };
      this.renderGroup(this.listEl, g);
    }
    this.contentEl.scrollTop = scroll;
    if (keep) {
      const ta = this.listEl.querySelector(`textarea[data-rm-id="${keep.id}"]`);
      if (ta) {
        if (keep.value !== keep.saved) ta.value = keep.value;
        fit(ta);
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(keep.s, keep.e);
      }
    }
  }
  renderGroup(parent, g) {
    const box = parent.createDiv({ cls: "rm-sb-group" + (this.collapsed.has(this.ckey(g)) ? " is-collapsed" : "") });
    box.dataset.level = String(g.level);
    const head = box.createDiv({ cls: "rm-sb-group-head", attr: { role: "button", tabindex: "0", "aria-expanded": String(!this.collapsed.has(this.ckey(g))) } });
    (0, import_obsidian8.setIcon)(head.createSpan({ cls: "rm-sb-chevron" }), "chevron-down");
    head.createSpan({ cls: "rm-sb-group-title", text: g.title });
    head.createSpan({ cls: "rm-sb-group-count", text: String(g.total) });
    const toggle = () => {
      const k = this.ckey(g);
      const now = !this.collapsed.has(k);
      if (now) this.collapsed.add(k);
      else this.collapsed.delete(k);
      box.toggleClass("is-collapsed", now);
      head.setAttribute("aria-expanded", String(!now));
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
    const body = box.createDiv({ cls: "rm-sb-group-body" });
    for (const a of g.anns) this.renderEntry(body, a);
    for (const c of g.children) this.renderGroup(body, c);
  }
  /** Collapse state survives refreshes; keyed by note, heading text and level. */
  ckey(g) {
    var _a;
    return `${(_a = this.file) == null ? void 0 : _a.path}#${g.level}:${g.title}`;
  }
  renderEntry(parent, a) {
    const el = parent.createDiv({ cls: "rm-sb-entry" });
    el.dataset.rmId = a.id;
    const row = el.createDiv({ cls: "rm-sb-entry-head" });
    const tgt = row.createDiv({ cls: "rm-sb-target", attr: { role: "button", tabindex: "0", "aria-label": "Go to annotation" } });
    tgt.setText(a.open >= 0 ? targetExcerpt(this.text, a) : `[^${a.id}] (no target)`);
    tgt.addEventListener("click", () => void this.jump(a.id));
    tgt.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void this.jump(a.id);
      }
    });
    const btn = row.createEl("button", { cls: "rm-sb-unwrap clickable-icon", attr: { "aria-label": "Unwrap: remove the annotation and keep the text" } });
    (0, import_obsidian8.setIcon)(btn, "eraser");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.unwrap(a.id);
    });
    const ta = el.createEl("textarea", { cls: "rm-sb-comment", attr: { rows: "1", placeholder: "Add a comment\u2026", "aria-label": `Comment [^${a.id}]`, spellcheck: "true" } });
    ta.dataset.rmId = a.id;
    ta.dataset.saved = a.comment;
    ta.value = a.comment;
    ta.addEventListener("input", () => fit(ta));
    ta.addEventListener("blur", () => void this.save(ta));
    ta.addEventListener("keydown", (e) => {
      var _a;
      if (e.key === "Escape") {
        e.preventDefault();
        ta.value = (_a = ta.dataset.saved) != null ? _a : "";
        fit(ta);
        ta.blur();
      }
    });
    window.requestAnimationFrame(() => fit(ta));
  }
  async save(ta) {
    var _a, _b, _c;
    if (!this.file || !ta.isConnected) return;
    const id = ta.dataset.rmId;
    const v = cleanComment(ta.value);
    if (v === ((_a = ta.dataset.saved) != null ? _a : "")) return;
    if (!v.trim()) {
      new import_obsidian8.Notice("Review Marks: the comment is empty. Use the unwrap button to remove the annotation.");
      ta.value = (_b = ta.dataset.saved) != null ? _b : "";
      fit(ta);
      return;
    }
    ta.dataset.saved = v;
    const ok = await writeComment((_c = this.editor()) != null ? _c : this.file, id, v);
    if (!ok) new import_obsidian8.Notice(`Review Marks: annotation [^${id}] is gone; the comment was not saved.`);
    this.schedule();
  }
  async unwrap(id) {
    var _a;
    if (!this.file) return;
    const ok = await unwrapAnnotation((_a = this.editor()) != null ? _a : this.file, id);
    if (!ok) new import_obsidian8.Notice(`Review Marks: annotation [^${id}] not found.`);
    void this.refresh();
  }
  async jump(id) {
    var _a;
    const file = this.file;
    if (!file) return;
    let view = this.markdownView();
    if (!view) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      if (!(leaf.view instanceof import_obsidian8.MarkdownView)) return;
      view = leaf.view;
    }
    const text = normalize(view.editor.getValue());
    const a = analyze(text).anns.find((x) => x.id === id);
    if (!a) return;
    const at = a.open >= 0 ? a.open + 1 : a.defFrom;
    const end = a.open >= 0 ? a.close : a.defTo;
    if (import_obsidian8.Platform.isMobile) this.app.workspace.rightSplit.collapse();
    this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
    if (view.getMode() === "source") {
      const ed = view.editor;
      const cm = ed.cm;
      const pos = ed.offsetToPos(at);
      const inTable = isTableLine(ed.getLine(pos.line));
      cm.focus();
      ed.setCursor(pos);
      ed.scrollIntoView({ from: pos, to: ed.offsetToPos(end) }, true);
      if (inTable) {
        cm.scrollDOM.scrollTop = cm.lineBlockAt(at).top - cm.scrollDOM.clientHeight / 3;
        window.setTimeout(() => {
          var _a2;
          (_a2 = cm.dom.querySelector(`.cm-table-widget [data-rm-id="${id}"]`)) == null ? void 0 : _a2.scrollIntoView({ block: "center" });
        }, 150);
      }
      window.setTimeout(() => {
        if (!view.containerEl.contains(document.activeElement)) (inTable ? ed : cm).focus();
      }, 50);
    } else {
      const line = ((_a = text.slice(0, at).match(/\n/g)) != null ? _a : []).length;
      view.previewMode.applyScroll(Math.max(0, line - 2));
      flashInPreview(view, a.id);
    }
  }
};
function flashInPreview(view, id, tries = 20) {
  const el = view.previewMode.containerEl.querySelector(`.rm-target[data-rm-id="${id}"]`);
  if (!el) {
    if (tries > 0) window.setTimeout(() => flashInPreview(view, id, tries - 1), 50);
    return;
  }
  el.scrollIntoView({ block: "center" });
  const all = view.previewMode.containerEl.querySelectorAll(`.rm-target[data-rm-id="${id}"]`);
  all.forEach((t) => t.addClass("rm-flash"));
  window.setTimeout(() => all.forEach((t) => t.removeClass("rm-flash")), 1200);
}
function fit(ta) {
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + 2 + "px";
}

// src/drag.ts
var import_obsidian9 = require("obsidian");
var import_state4 = require("@codemirror/state");
var import_view3 = require("@codemirror/view");

// src/dom-map.ts
var SKIP2 = "sup.footnote-ref, .rm-badge, .rm-hidden, .footnotes, section.footnotes, .frontmatter, .metadata-container, .internal-embed, .math, .copy-code-button, .table-row-drag-handle, .table-col-drag-handle, .rm-cbox, .markdown-preview-pusher, .mod-header, .mod-footer, .embedded-backlinks";
var SOFT = "*_~=`|#\\";
function visibility(text, from, to) {
  const vis = new Uint8Array(to - from).fill(1);
  const { anns, ign } = analyze(text);
  const set = (a, b, val) => {
    for (let i = Math.max(a, from); i < Math.min(b, to); i++) vis[i - from] = val;
  };
  for (let i = from; i < to; i++) if (SOFT.includes(text[i])) vis[i - from] = 2;
  const starts = lineStarts(text);
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k];
    const e = k + 1 < starts.length ? starts[k + 1] - 1 : text.length;
    if (e < from || s > to) continue;
    const line = text.slice(s, e);
    if (isTableLine(line) && /^[\s|:-]+$/.test(line) && line.includes("-")) set(s, e, 0);
    else if (/^\s*(?:>\s*)*(`{3,}|~{3,})/.test(line)) set(s, e, 0);
    else if (/^\[\^[^\]\s]+\]:/.test(line) && !ign[s]) set(s, e, 0);
    else if (!ign[s]) set(s, s + blockPrefixLength(line), 0);
  }
  const fm = /^---\n[\s\S]*?\n---(?=\n|$)/.exec(text);
  if (fm) set(0, fm[0].length, 0);
  for (const a of anns) {
    if (a.open >= 0) {
      set(a.open, a.open + 1, 0);
      set(a.close, a.refEnd, 0);
    }
    if (a.defFrom >= 0) set(a.defFrom, a.defTo, 0);
  }
  const each = (re, f) => {
    let m;
    re.lastIndex = Math.max(0, from - 2e3);
    while ((m = re.exec(text)) && m.index < to) if (!ign[m.index] && m.index + m[0].length > from) f(m);
  };
  const links = [];
  each(/%%[\s\S]*?%%|<!--[\s\S]*?-->/g, (m) => set(m.index, m.index + m[0].length, 0));
  each(/\[\^[^\]\s]+\](?!:)/g, (m) => set(m.index, m.index + m[0].length, 0));
  each(/!\[\[[^\]\n]*\]\]|!\[[^\]\n]*\]\([^)\n]*\)/g, (m) => {
    set(m.index, m.index + m[0].length, 0);
    links.push({ s: m.index, e: m.index + m[0].length });
  });
  each(/(?<!!)\[\[([^\]\n]*)\]\]/g, (m) => {
    const s = m.index, e = s + m[0].length;
    const bar = /\\?\|/.exec(m[1]);
    set(s, bar ? s + 2 + bar.index + bar[0].length : s + 2, 0);
    set(e - 2, e, 0);
    links.push({ s, e });
  });
  each(/(?<![!\]])\[([^\]\n]*)\]\(([^)\n]*)\)/g, (m) => {
    const s = m.index, e = s + m[0].length;
    set(s, s + 1, 0);
    set(s + 1 + m[1].length, e, 0);
    links.push({ s, e });
  });
  return { vis, links };
}
function textNodes(root) {
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n2) => {
      for (let p = n2.parentElement; p && p !== root.parentElement; p = p.parentElement) if (p.matches(SKIP2)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n;
  while (n = w.nextNode()) out.push(n);
  return out;
}
function mapSlice(text, sl) {
  const { vis } = visibility(text, sl.from, sl.to);
  const chars = [];
  for (const node of textNodes(sl.el)) for (let i = 0; i < node.data.length; i++) if (!/\s/.test(node.data[i])) chars.push({ node, idx: i, ch: node.data[i] });
  const V = (q) => vis[q - sl.from];
  const seek = (q, c, maxHard) => {
    let hard = 0;
    for (; q < sl.to; q++) {
      const m = V(q), sc = text[q];
      if (m === 0 || /\s/.test(sc)) continue;
      if (sc === c) return { at: q, hard };
      if (m === 2) continue;
      if (++hard > maxHard) break;
    }
    return { at: -1, hard };
  };
  const out = [];
  let p = sl.from;
  for (let k = 0; k < chars.length; k++) {
    const r = seek(p, chars[k].ch, 12);
    if (r.at < 0) continue;
    if (r.hard > 0) {
      let q = r.at + 1, ok = true;
      for (let j = k + 1; j < Math.min(chars.length, k + 3); j++) {
        const n = seek(q, chars[j].ch, 0);
        if (n.at < 0) {
          ok = false;
          break;
        }
        q = n.at + 1;
      }
      if (!ok) continue;
    }
    out.push({ node: chars[k].node, idx: chars[k].idx, off: r.at });
    p = r.at + 1;
  }
  return out;
}
function selected(range, h) {
  try {
    return range.comparePoint(h.node, h.idx) === 0 && range.comparePoint(h.node, h.idx + 1) === 0;
  } catch (e) {
    return false;
  }
}
function mapSelection(text, slices, range) {
  const hit = slices.filter((s) => range.intersectsNode(s.el));
  if (!hit.length) return "the selection is not in the note text.";
  let from = -1, to = -1;
  for (const sl of hit) {
    const first = mapSlice(text, sl).find((h) => selected(range, h));
    if (first) {
      from = first.off;
      break;
    }
  }
  for (let i = hit.length - 1; i >= 0; i--) {
    const all = mapSlice(text, hit[i]);
    for (let j = all.length - 1; j >= 0; j--) if (selected(range, all[j])) {
      to = all[j].off + 1;
      break;
    }
    if (to >= 0) break;
  }
  if (from < 0 || to <= from) return "could not find the selected text in the note.";
  return snapRange(text, from, to);
}
function snapRange(text, from, to) {
  const { links } = visibility(text, Math.max(0, from - 1), Math.min(text.length, to + 1));
  for (const l of links) {
    if (from > l.s && from < l.e) from = l.s;
    if (to > l.s && to < l.e) to = l.e;
  }
  const { ign } = analyze(text);
  if (ign[from] && from > 0 && text[from - 1] === "`" && ign[from - 1]) while (from > 0 && text[from - 1] === "`") from--;
  if (to > 0 && ign[to - 1] && text[to] === "`" && ign[to]) while (to < text.length && text[to] === "`") to++;
  return { from, to };
}

// src/drag.ts
var app4;
var setDrag = import_state4.StateEffect.define();
var dragMark = import_view3.Decoration.mark({ class: "rm-drag-sel" });
var dragField = import_state4.StateField.define({
  create: () => import_view3.Decoration.none,
  update(v, tr) {
    v = v.map(tr.changes);
    for (const e of tr.effects) if (e.is(setDrag)) v = e.value && e.value.to > e.value.from ? import_view3.Decoration.set([dragMark.range(e.value.from, e.value.to)]) : import_view3.Decoration.none;
    return v;
  },
  provide: (f) => import_view3.EditorView.decorations.from(f)
});
function registerDrag(plugin) {
  app4 = plugin.app;
  plugin.registerEditorExtension(dragField);
  plugin.registerDomEvent(window, "pointerdown", onDown, { capture: true });
  plugin.registerDomEvent(window, "mousedown", (e) => {
    if (gesture) swallow(e);
  }, { capture: true });
}
function triggerHeld(e, trig = settings.dragTrigger) {
  if (trig === "off") return false;
  const parts = trig.split("-");
  const want = { ctrl: false, meta: false, alt: parts.includes("alt"), shift: parts.includes("shift") };
  if (parts.includes("mod")) {
    if (import_obsidian9.Platform.isMacOS) want.meta = true;
    else want.ctrl = true;
  }
  if (parts.includes("meta")) want.meta = true;
  return e.ctrlKey === want.ctrl && e.metaKey === want.meta && e.altKey === want.alt && e.shiftKey === want.shift;
}
var cmOf2 = (v) => v.editor.cm;
function viewOf(t) {
  for (const leaf of app4.workspace.getLeavesOfType("markdown")) {
    if (leaf.view instanceof import_obsidian9.MarkdownView && leaf.view.containerEl.contains(t)) return leaf.view;
  }
  return null;
}
function swallow(e) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}
var gesture = false;
function track(move, up) {
  gesture = true;
  const pm = (e) => {
    swallow(e);
    move(e);
  };
  const mm = (e) => swallow(e);
  const pu = (e) => {
    swallow(e);
    window.removeEventListener("pointermove", pm, true);
    window.removeEventListener("pointerup", pu, true);
    window.removeEventListener("pointercancel", pu, true);
    const late = (c) => swallow(c);
    window.addEventListener("mouseup", late, true);
    window.addEventListener("click", late, true);
    window.setTimeout(() => {
      gesture = false;
      window.removeEventListener("mousemove", mm, true);
      window.removeEventListener("mouseup", late, true);
      window.removeEventListener("click", late, true);
    }, 0);
    up(e);
  };
  window.addEventListener("pointermove", pm, true);
  window.addEventListener("mousemove", mm, true);
  window.addEventListener("pointerup", pu, true);
  window.addEventListener("pointercancel", pu, true);
}
function onDown(e) {
  if (e.button !== 0 || e.pointerType === "touch" || !triggerHeld(e)) return;
  const t = e.target;
  if (!(t == null ? void 0 : t.closest) || t.closest(".rm-cbox, .markdown-embed, .rm-badge")) return;
  const view = viewOf(t);
  if (!(view == null ? void 0 : view.file)) return;
  if (view.getMode() === "preview") {
    if (!t.closest(".markdown-reading-view .markdown-preview-view")) return;
    swallow(e);
    commitActiveBox();
    domGesture(e, (range) => void readingDone(view, range));
    return;
  }
  const cm = cmOf2(view);
  if (!cm || !cm.dom.contains(t) || t.closest(".cm-gutters")) return;
  swallow(e);
  commitActiveBox();
  const widget = t.closest(".cm-table-widget");
  if (widget) domGesture(e, (range) => tableDone(view, widget, range));
  else editorGesture(e, view, cm);
}
function editorGesture(e, view, cm) {
  const at = (ev) => cm.posAtCoords({ x: ev.clientX, y: ev.clientY }, false);
  const anchor = at(e);
  const show = (head) => cm.dispatch({ effects: setDrag.of(head === null ? null : { from: Math.min(anchor, head), to: Math.max(anchor, head) }) });
  track(
    (ev) => show(at(ev)),
    (ev) => {
      const head = at(ev);
      show(null);
      if (head === anchor) return;
      const r = snapRange(cm.state.doc.toString(), Math.min(anchor, head), Math.max(anchor, head));
      const ed = view.editor;
      annotateWithBox(ed, ed.offsetToPos(r.from), ed.offsetToPos(r.to), false);
    }
  );
}
function caretAt(x, y) {
  const r = document.caretRangeFromPoint(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}
var W = window;
function domGesture(e, done) {
  var _a;
  const start = caretAt(e.clientX, e.clientY);
  if (!start) return;
  (_a = window.getSelection()) == null ? void 0 : _a.removeAllRanges();
  const anchor = document.createRange();
  anchor.setStart(start.node, start.offset);
  const range = anchor.cloneRange();
  const draw = () => {
    var _a2;
    if (((_a2 = W.CSS) == null ? void 0 : _a2.highlights) && W.Highlight) W.CSS.highlights.set("rm-drag", new W.Highlight(range));
    else {
      const sel = window.getSelection();
      sel == null ? void 0 : sel.removeAllRanges();
      sel == null ? void 0 : sel.addRange(range);
    }
  };
  const extend = (ev) => {
    const c = caretAt(ev.clientX, ev.clientY);
    if (!c) return;
    const p = document.createRange();
    p.setStart(c.node, c.offset);
    if (p.compareBoundaryPoints(Range.START_TO_START, anchor) < 0) {
      range.setStart(c.node, c.offset);
      range.setEnd(start.node, start.offset);
    } else {
      range.setStart(start.node, start.offset);
      range.setEnd(c.node, c.offset);
    }
    draw();
  };
  track(extend, (ev) => {
    var _a2, _b, _c;
    extend(ev);
    (_b = (_a2 = W.CSS) == null ? void 0 : _a2.highlights) == null ? void 0 : _b.delete("rm-drag");
    (_c = window.getSelection()) == null ? void 0 : _c.removeAllRanges();
    if (!range.collapsed) done(range);
  });
}
function tableDone(view, widget, range) {
  const cm = cmOf2(view);
  let pos;
  try {
    pos = cm.posAtDOM(widget);
  } catch (e) {
    return;
  }
  const doc = cm.state.doc;
  const first = doc.lineAt(pos);
  let last = first;
  while (last.number < doc.lines && isTableLine(doc.line(last.number + 1).text)) last = doc.line(last.number + 1);
  const text = doc.toString();
  const r = mapSelection(text, [{ el: widget, from: first.from, to: last.to }], range);
  if (typeof r === "string") {
    new import_obsidian9.Notice("Review Marks: " + r);
    return;
  }
  const ed = view.editor;
  annotateWithBox(ed, ed.offsetToPos(r.from), ed.offsetToPos(r.to), false);
}
async function readingDone(view, range) {
  var _a, _b, _c, _d;
  const text = view.editor.getValue();
  const sections = (_b = (_a = view.previewMode.renderer) == null ? void 0 : _a.sections) != null ? _b : [];
  const starts = lineStarts(text);
  const slices = sections.filter((s) => s.el && s.el.isConnected && s.start && !s.el.matches(".mod-header, .mod-footer")).map((s) => {
    var _a2;
    return {
      el: s.el,
      from: (_a2 = starts[s.start.line]) != null ? _a2 : text.length,
      to: s.end.line + 1 < starts.length ? starts[s.end.line + 1] - 1 : text.length
    };
  });
  const r = mapSelection(text, slices, range);
  if (typeof r === "string") {
    new import_obsidian9.Notice("Review Marks: " + r);
    return;
  }
  const ok = checkTarget(text, r.from, r.to);
  if (typeof ok === "string") {
    new import_obsidian9.Notice("Review Marks: " + ok);
    return;
  }
  const y = (_d = (_c = range.getClientRects()[0]) == null ? void 0 : _c.top) != null ? _d : range.getBoundingClientRect().top;
  await view.leaf.setViewState({ type: "markdown", state: { ...view.getState(), mode: "source", source: false } });
  const cm = cmOf2(view);
  const frame = () => new Promise((res) => window.requestAnimationFrame(() => res()));
  for (let i = 0; i < 4; i++) {
    await frame();
    const c = cm.coordsAtPos(ok.from, 1);
    const cur = c ? c.top : cm.documentTop + cm.lineBlockAt(ok.from).top;
    if (Math.abs(cur - y) > 1) cm.scrollDOM.scrollTop += cur - y;
  }
  const ed = view.editor;
  annotateWithBox(ed, ed.offsetToPos(r.from), ed.offsetToPos(r.to), false);
}

// src/main.ts
var ReviewMarksPlugin = class extends import_obsidian10.Plugin {
  constructor() {
    super(...arguments);
    /** Also reachable as app.plugins.plugins['proto-review-marks'].api (handy from the console). */
    this.api = { createAnnotation, writeComment, unwrapAnnotation };
  }
  async onload() {
    await loadSettings(this);
    initUi(this.app, this);
    this.registerEditorExtension(livePreviewExtension);
    registerReading(this);
    registerCommands(this);
    registerConvertCommands(this);
    registerSidebar(this);
    this.registerEditorExtension(commentBoxExtension);
    registerDrag(this);
    this.addSettingTab(new ReviewMarksSettingTab(this.app, this));
    onSettingsChange(() => {
      refreshLivePreview(this.app);
      rerenderPreviews(this);
    });
    this.registerDomEvent(document, "click", (e) => {
      var _a;
      const t = e.target;
      if (!popoverContains(t) && !((_a = t.closest) == null ? void 0 : _a.call(t, ".rm-badge, .rm-target"))) hidePopover(true);
    });
    this.register(() => hidePopover(true));
  }
};
