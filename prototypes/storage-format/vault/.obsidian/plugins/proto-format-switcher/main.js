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
  default: () => SwitcherPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var VARIANTS = [
  { key: "A", name: "Inline {target}(instruction)", path: "A-inline.md" },
  { key: "B", name: "Footnote at end", path: "B-footnote-end.md" },
  { key: "C", name: "Native highlight + comment", path: "C-highlight-comment.md" },
  { key: "D", name: "Callout after block", path: "D-callout-after-block.md" }
];
var SwitcherPlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.pill = document.body.createDiv({ cls: "proto-switcher-pill" });
    const prev = this.pill.createEl("button", { text: "\u2190" });
    prev.setAttr("aria-label", "Previous variant");
    this.label = this.pill.createSpan({ cls: "proto-switcher-label" });
    const next = this.pill.createEl("button", { text: "\u2192" });
    next.setAttr("aria-label", "Next variant");
    this.registerDomEvent(prev, "click", () => this.step(-1));
    this.registerDomEvent(next, "click", () => this.step(1));
    this.addCommand({ id: "next-variant", name: "Prototype: next variant", callback: () => this.step(1) });
    this.addCommand({ id: "previous-variant", name: "Prototype: previous variant", callback: () => this.step(-1) });
    this.registerEvent(this.app.workspace.on("file-open", () => this.updateLabel()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateLabel()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.updateLabel()));
    this.app.workspace.onLayoutReady(() => this.updateLabel());
  }
  onunload() {
    this.pill?.remove();
  }
  currentKey() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return null;
    const key = this.app.metadataCache.getFileCache(file)?.frontmatter?.["review-format"];
    return key ? String(key).trim().toUpperCase() : null;
  }
  updateLabel() {
    const key = this.currentKey();
    const v = VARIANTS.find((x) => x.key === key);
    if (v) this.label.setText(`${v.key} (${v.name})`);
    else if (key) this.label.setText(`${key} (unknown variant)`);
    else this.label.setText("not a variant note");
  }
  // The element that actually scrolls, depending on the view mode.
  scroller(view) {
    if (view.getMode() === "preview") return view.contentEl.querySelector(".markdown-preview-view");
    return view.contentEl.querySelector(".cm-scroller");
  }
  async step(dir) {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf) return;
    const view = leaf.view instanceof import_obsidian.MarkdownView ? leaf.view : null;
    let idx = VARIANTS.findIndex((x) => x.key === this.currentKey());
    if (idx === -1) idx = VARIANTS.findIndex((x) => x.path === view?.file?.path);
    const target = idx === -1 ? VARIANTS[dir > 0 ? 0 : VARIANTS.length - 1] : VARIANTS[(idx + dir + VARIANTS.length) % VARIANTS.length];
    const file = this.app.vault.getAbstractFileByPath(target.path);
    if (!(file instanceof import_obsidian.TFile)) {
      this.label.setText(`missing ${target.path}`);
      return;
    }
    let fraction = 0;
    let state = {};
    if (view) {
      const vs = leaf.getViewState().state ?? {};
      state = { mode: vs.mode, source: vs.source };
      const el = this.scroller(view);
      if (el) {
        const max = el.scrollHeight - el.clientHeight;
        fraction = max > 0 ? el.scrollTop / max : 0;
      }
    }
    await leaf.openFile(file, { state });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    const apply = () => {
      const v = leaf.view instanceof import_obsidian.MarkdownView ? leaf.view : null;
      const el = v && this.scroller(v);
      if (!el) return;
      el.scrollTop = fraction * (el.scrollHeight - el.clientHeight);
    };
    for (const ms of [0, 50, 150, 350]) window.setTimeout(apply, ms);
    this.updateLabel();
  }
};
