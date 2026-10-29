// PROTOTYPE (throwaway): floating switcher for the storage-format prototype vault.
// Cycles the active leaf through the four variant notes, keeping view mode and scroll fraction.
import { MarkdownView, Plugin, TFile } from "obsidian";

const VARIANTS = [
  { key: "A", name: "Inline {target}(instruction)", path: "A-inline.md" },
  { key: "B", name: "Footnote at end", path: "B-footnote-end.md" },
  { key: "C", name: "Native highlight + comment", path: "C-highlight-comment.md" },
  { key: "D", name: "Callout after block", path: "D-callout-after-block.md" },
];

export default class SwitcherPlugin extends Plugin {
  pill: HTMLElement;
  label: HTMLElement;

  async onload() {
    this.pill = document.body.createDiv({ cls: "proto-switcher-pill" });
    const prev = this.pill.createEl("button", { text: "←" });
    prev.setAttr("aria-label", "Previous variant");
    this.label = this.pill.createSpan({ cls: "proto-switcher-label" });
    const next = this.pill.createEl("button", { text: "→" });
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

  currentKey(): string | null {
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
  scroller(view: MarkdownView): HTMLElement | null {
    if (view.getMode() === "preview") return view.contentEl.querySelector(".markdown-preview-view");
    return view.contentEl.querySelector(".cm-scroller");
  }

  async step(dir: number) {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (!leaf) return;
    const view = leaf.view instanceof MarkdownView ? leaf.view : null;

    let idx = VARIANTS.findIndex((x) => x.key === this.currentKey());
    if (idx === -1) idx = VARIANTS.findIndex((x) => x.path === view?.file?.path);
    const target =
      idx === -1
        ? VARIANTS[dir > 0 ? 0 : VARIANTS.length - 1]
        : VARIANTS[(idx + dir + VARIANTS.length) % VARIANTS.length];

    const file = this.app.vault.getAbstractFileByPath(target.path);
    if (!(file instanceof TFile)) {
      this.label.setText(`missing ${target.path}`);
      return;
    }

    // Capture mode (source / live preview / reading) and scroll as a fraction of the note.
    let fraction = 0;
    let state: Record<string, unknown> = {};
    if (view) {
      const vs = (leaf.getViewState().state ?? {}) as Record<string, unknown>;
      state = { mode: vs.mode, source: vs.source };
      const el = this.scroller(view);
      if (el) {
        const max = el.scrollHeight - el.clientHeight;
        fraction = max > 0 ? el.scrollTop / max : 0;
      }
    }

    await leaf.openFile(file, { state });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });

    // Reading view renders lazily and CM6 measures async, so re-apply a few times.
    const apply = () => {
      const v = leaf.view instanceof MarkdownView ? leaf.view : null;
      const el = v && this.scroller(v);
      if (!el) return;
      el.scrollTop = fraction * (el.scrollHeight - el.clientHeight);
    };
    for (const ms of [0, 50, 150, 350]) window.setTimeout(apply, ms);
    this.updateLabel();
  }
}
