// PROTOTYPE (throwaway). Annotations sidebar: an ItemView listing every Annotation in the active note,
// grouped under the heading section its Target starts in, with the Comment editable in place.
import { App, Editor, ItemView, MarkdownView, Notice, Platform, Plugin, Scope, TFile, WorkspaceLeaf, setIcon } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import { Annotation, analyze, blockPrefixLength, headingStarts, isTableLine, normalize } from './parse';
import { writeComment } from './commands';

export const VIEW_TYPE_ANNOTATIONS = 'proto-review-marks-sidebar';
const EXCERPT = 80;

let app: App;

export function registerSidebar(plugin: Plugin) {
  app = plugin.app;
  plugin.registerView(VIEW_TYPE_ANNOTATIONS, (leaf) => new AnnotationsView(leaf));
  const open = () => openSidebar(plugin);
  plugin.addRibbonIcon('message-square-text', 'Open annotations sidebar', open);
  plugin.addCommand({ id: 'open-annotations-sidebar', name: 'Open annotations sidebar', callback: open });
}

async function openSidebar(plugin: Plugin) {
  const ws = plugin.app.workspace;
  const leaf = ws.getLeavesOfType(VIEW_TYPE_ANNOTATIONS)[0] ?? ws.getRightLeaf(false);
  if (!leaf) return;
  if (!(leaf.view instanceof AnnotationsView)) await leaf.setViewState({ type: VIEW_TYPE_ANNOTATIONS, active: true });
  await ws.revealLeaf(leaf);
}

// ---------- model ----------

interface Group { title: string; level: number; anns: Annotation[]; children: Group[]; total: number }

/** The Target as one line of plain-ish text: block markers, nested syntax and emphasis stripped. */
function targetExcerpt(text: string, a: Annotation): string {
  const raw = text.slice(a.open + 1, a.close);
  const flat = raw.split('\n')
    .map((l, i) => (i === 0 ? l : l.slice(blockPrefixLength(l))).replace(/^\|\s*|\s*\|$/g, '').trim())
    .filter((l) => l !== '')
    .join(' / ')
    .replace(/\}\[\^r\d+\]/g, '').replace(/[{}]/g, '')
    .replace(/\[\[([^\]|]*?)(?:\\?\|([^\]]*))?\]\]/g, (_m, p, alias) => alias ?? p)
    .replace(/\*\*|__|==|~~/g, '')
    .replace(/\s+/g, ' ');
  return flat.length > EXCERPT ? flat.slice(0, EXCERPT).trimEnd() + '…' : flat;
}

function headingTitle(line: string): string {
  return line.replace(/^#{1,6}\s*/, '').replace(/\}\[\^r\d+\]/g, '').replace(/[{}]/g, '').replace(/\s+#+\s*$/, '').trim() || '(untitled heading)';
}

/** Heading tree, pruned to the headings that hold an Annotation (or have a descendant that does). */
function buildGroups(text: string, noteName: string): { roots: Group[]; orphans: Annotation[]; total: number } {
  const { anns, ign } = analyze(text);
  const hs = headingStarts(text, ign);
  const top: Group = { title: noteName, level: 0, anns: [], children: [], total: 0 };
  const heads: Group[] = hs.map((h) => {
    const e = text.indexOf('\n', h);
    const line = text.slice(h, e < 0 ? text.length : e);
    return { title: headingTitle(line), level: /^#+/.exec(line)![0].length, anns: [], children: [], total: 0 };
  });
  const orphans: Annotation[] = [];
  for (const a of anns) {
    if (a.open < 0) { orphans.push(a); continue; }
    let gi = -1;
    for (let i = 0; i < hs.length && hs[i] <= a.open; i++) gi = i;
    (gi < 0 ? top : heads[gi]).anns.push(a);
  }
  // Nest by level: parent = nearest earlier heading of a lower level.
  const roots: Group[] = [top];
  const stack: Group[] = [];
  for (const g of heads) {
    while (stack.length && stack[stack.length - 1].level >= g.level) stack.pop();
    (stack.length ? stack[stack.length - 1].children : roots).push(g);
    stack.push(g);
  }
  const prune = (gs: Group[]): Group[] => gs.filter((g) => {
    g.children = prune(g.children);
    g.total = g.anns.length + g.children.reduce((n, c) => n + c.total, 0);
    return g.total > 0;
  });
  return { roots: prune(roots), orphans, total: anns.length };
}

/** Same comment text as the modal would save: no trailing whitespace, no leading blank lines. */
function cleanComment(s: string): string {
  return s.replace(/\s+$/, '').replace(/^\s*\n/, '').split('\n').map((l) => (l.trim() === '' ? '' : l)).join('\n');
}

// ---------- unwrap ----------

/** The edits that remove an Annotation but keep its Target text: '{', '}[^id]' and the definition. */
export function unwrapChanges(text: string, id: string): { from: number; to: number }[] | null {
  const a = analyze(text).anns.find((x) => x.id === id);
  if (!a) return null;
  const out: { from: number; to: number }[] = [];
  if (a.open >= 0) out.push({ from: a.open, to: a.open + 1 }, { from: a.close, to: a.refEnd });
  if (a.defFrom >= 0) {
    let s = a.defFrom, e = a.defTo;
    if (text[e] === '\n') e++;
    if (e >= text.length) { while (s > 1 && text[s - 1] === '\n' && text[s - 2] === '\n') s--; }
    else if (text[e] === '\n' && (s === 0 || (text[s - 1] === '\n' && text[s - 2] === '\n'))) e++;
    out.push({ from: s, to: e });
  }
  return out.sort((x, y) => x.from - y.from);
}

/** Removes one Annotation, keeping its Target as plain text. Editor: one undo step. File: Vault.process. */
export async function unwrapAnnotation(target: Editor | TFile, id: string): Promise<boolean> {
  if (target instanceof TFile) {
    let ok = false;
    await app.vault.process(target, (data) => {
      const crlf = data.includes('\r\n');
      const text = normalize(data);
      const ch = unwrapChanges(text, id);
      if (!ch) return data;
      ok = true;
      let out = '';
      let at = 0;
      for (const c of ch) { out += text.slice(at, c.from); at = c.to; }
      out += text.slice(at);
      return crlf ? out.replace(/\n/g, '\r\n') : out;
    });
    return ok;
  }
  const ch = unwrapChanges(target.getValue(), id);
  if (!ch) return false;
  target.transaction({ changes: ch.map((c) => ({ from: target.offsetToPos(c.from), to: target.offsetToPos(c.to), text: '' })) });
  return true;
}

// ---------- view ----------

export class AnnotationsView extends ItemView {
  private file: TFile | null = null;
  /** The markdown leaf the listed note was last active in (the sidebar itself takes focus when used). */
  private noteLeaf: WorkspaceLeaf | null = null;
  private text = '';
  private sig = '';
  private timer = 0;
  private collapsed = new Set<string>();
  private listEl!: HTMLElement;
  private countEl!: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    // Obsidian's keymap handles Mod+Enter before a textarea's own keydown sees it; a view scope runs first.
    this.scope = new Scope(this.app.scope);
    this.scope.register(['Mod'], 'Enter', () => {
      const ta = document.activeElement;
      if (!(ta instanceof HTMLTextAreaElement) || !this.listEl?.contains(ta)) return;
      void this.save(ta);
      return false;
    });
  }
  getViewType() { return VIEW_TYPE_ANNOTATIONS; }
  getDisplayText() { return 'Annotations'; }
  getIcon() { return 'message-square-text'; }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('rm-sidebar');
    this.countEl = this.contentEl.createDiv({ cls: 'rm-sb-count' });
    this.listEl = this.contentEl.createDiv({ cls: 'rm-sb-list' });
    const ws = this.app.workspace;
    this.registerEvent(ws.on('active-leaf-change', (leaf) => this.onLeaf(leaf)));
    this.registerEvent(ws.on('file-open', () => this.onLeaf(ws.getActiveViewOfType(MarkdownView)?.leaf ?? null)));
    this.registerEvent(ws.on('editor-change', (_e, info) => { if (info.file && info.file === this.file) this.schedule(); }));
    this.registerEvent(this.app.vault.on('modify', (f) => { if (f === this.file) this.schedule(); }));
    this.registerEvent(this.app.vault.on('rename', (f) => { if (f === this.file) this.schedule(); }));
    this.registerEvent(this.app.vault.on('delete', (f) => { if (f === this.file) { this.file = null; this.noteLeaf = null; void this.refresh(); } }));
    // On startup the sidebar is restored before the note tabs: wait for the layout.
    ws.onLayoutReady(() => {
      const leaf = ws.getActiveViewOfType(MarkdownView)?.leaf ?? ws.getMostRecentLeaf(ws.rootSplit);
      this.onLeaf(leaf);
      if (!this.file) void this.refresh();
    });
  }

  async onClose() { window.clearTimeout(this.timer); }

  private onLeaf(leaf: WorkspaceLeaf | null) {
    if (leaf && leaf.view instanceof MarkdownView) {
      this.noteLeaf = leaf;
      this.file = leaf.view.file;
    } else if (leaf && leaf.getRoot() === this.app.workspace.rootSplit) {
      // Another kind of tab in the main area (empty tab, canvas, PDF): nothing to list.
      this.noteLeaf = null;
      this.file = null;
    } else return; // sidebars (including this view) keep the current note
    void this.refresh();
  }

  private schedule() {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.refresh(), 250);
  }

  /** The open editor for the listed note, if any (also usable in Reading view). */
  private editor(): Editor | null {
    const leaves = [this.noteLeaf, ...this.app.workspace.getLeavesOfType('markdown')];
    for (const l of leaves) if (l && l.view instanceof MarkdownView && l.view.file === this.file) return l.view.editor;
    return null;
  }

  private markdownView(): MarkdownView | null {
    const leaves = [this.noteLeaf, ...this.app.workspace.getLeavesOfType('markdown')];
    for (const l of leaves) if (l && l.view instanceof MarkdownView && l.view.file === this.file) return l.view;
    return null;
  }

  private async readText(): Promise<string> {
    if (!this.file) return '';
    const ed = this.editor();
    return normalize(ed ? ed.getValue() : await this.app.vault.cachedRead(this.file));
  }

  async refresh() {
    window.clearTimeout(this.timer);
    const file = this.file;
    const text = await this.readText();
    if (file !== this.file) return; // the note changed while reading
    this.text = text;
    if (!file) {
      this.sig = '';
      this.countEl.setText('');
      this.listEl.empty();
      this.listEl.createDiv({ cls: 'rm-sb-empty', text: 'Open a note to see its annotations.' });
      return;
    }
    const { roots, orphans, total } = buildGroups(text, file.basename);
    this.countEl.setText(total === 1 ? '1 annotation' : `${total} annotations`);
    if (!total) {
      this.sig = '';
      this.listEl.empty();
      this.listEl.createDiv({ cls: 'rm-sb-empty', text: 'No annotations in this note.' });
      return;
    }
    // Everything the list shows except the comments; if only comments changed, patch in place.
    const parts: string[] = [file.path];
    const walk = (gs: Group[]) => { for (const g of gs) { parts.push(`[${g.level}:${g.title}:${g.total}`, ...g.anns.map((a) => a.id + ':' + targetExcerpt(text, a))); walk(g.children); parts.push(']'); } };
    walk(roots);
    parts.push(...orphans.map((a) => a.id));
    const sig = parts.join('\n');
    if (sig === this.sig) { this.patch(roots, orphans); return; }
    const samePath = this.sig.startsWith(file.path + '\n');
    this.sig = sig;
    this.rebuild(roots, orphans, samePath);
  }

  /** Same entries as before: only the comments may have changed. Leaves a textarea being typed in alone. */
  private patch(roots: Group[], orphans: Annotation[]) {
    const all: Annotation[] = [...orphans];
    const walk = (gs: Group[]) => { for (const g of gs) { all.push(...g.anns); walk(g.children); } };
    walk(roots);
    for (const a of all) {
      const ta = this.listEl.querySelector<HTMLTextAreaElement>(`textarea[data-rm-id="${a.id}"]`);
      if (!ta) continue;
      const saved = ta.dataset.saved ?? '';
      if (a.comment === saved) continue;
      if (document.activeElement !== ta || ta.value === saved) { ta.value = a.comment; fit(ta); }
      ta.dataset.saved = a.comment;
    }
  }

  private rebuild(roots: Group[], orphans: Annotation[], samePath: boolean) {
    // Keep a textarea being typed in: its draft, caret and focus survive the rebuild.
    const act = document.activeElement;
    const keep = act instanceof HTMLTextAreaElement && this.listEl.contains(act)
      ? { id: act.dataset.rmId!, value: act.value, saved: act.dataset.saved, s: act.selectionStart, e: act.selectionEnd } : null;
    const scroll = samePath ? this.contentEl.scrollTop : 0;
    this.listEl.empty();
    for (const g of roots) this.renderGroup(this.listEl, g);
    if (orphans.length) {
      const g: Group = { title: 'Comments without a target', level: 1, anns: orphans, children: [], total: orphans.length };
      this.renderGroup(this.listEl, g);
    }
    this.contentEl.scrollTop = scroll;
    if (keep) {
      const ta = this.listEl.querySelector<HTMLTextAreaElement>(`textarea[data-rm-id="${keep.id}"]`);
      if (ta) {
        if (keep.value !== keep.saved) ta.value = keep.value;
        fit(ta);
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(keep.s, keep.e);
      }
    }
  }

  private renderGroup(parent: HTMLElement, g: Group) {
    const box = parent.createDiv({ cls: 'rm-sb-group' + (this.collapsed.has(this.ckey(g)) ? ' is-collapsed' : '') });
    box.dataset.level = String(g.level);
    const head = box.createDiv({ cls: 'rm-sb-group-head', attr: { role: 'button', tabindex: '0', 'aria-expanded': String(!this.collapsed.has(this.ckey(g))) } });
    setIcon(head.createSpan({ cls: 'rm-sb-chevron' }), 'chevron-down');
    head.createSpan({ cls: 'rm-sb-group-title', text: g.title });
    head.createSpan({ cls: 'rm-sb-group-count', text: String(g.total) });
    const toggle = () => {
      const k = this.ckey(g);
      const now = !this.collapsed.has(k);
      if (now) this.collapsed.add(k); else this.collapsed.delete(k);
      box.toggleClass('is-collapsed', now);
      head.setAttribute('aria-expanded', String(!now));
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    const body = box.createDiv({ cls: 'rm-sb-group-body' });
    for (const a of g.anns) this.renderEntry(body, a);
    for (const c of g.children) this.renderGroup(body, c);
  }

  /** Collapse state survives refreshes; keyed by note, heading text and level. */
  private ckey(g: Group) { return `${this.file?.path}#${g.level}:${g.title}`; }

  private renderEntry(parent: HTMLElement, a: Annotation) {
    const el = parent.createDiv({ cls: 'rm-sb-entry' });
    el.dataset.rmId = a.id;
    const row = el.createDiv({ cls: 'rm-sb-entry-head' });
    const tgt = row.createDiv({ cls: 'rm-sb-target', attr: { role: 'button', tabindex: '0', 'aria-label': 'Go to annotation' } });
    tgt.setText(a.open >= 0 ? targetExcerpt(this.text, a) : `[^${a.id}] (no target)`);
    tgt.addEventListener('click', () => void this.jump(a.id));
    tgt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void this.jump(a.id); } });
    const btn = row.createEl('button', { cls: 'rm-sb-unwrap clickable-icon', attr: { 'aria-label': 'Unwrap: remove the annotation and keep the text' } });
    setIcon(btn, 'eraser');
    btn.addEventListener('click', (e) => { e.stopPropagation(); void this.unwrap(a.id); });

    const ta = el.createEl('textarea', { cls: 'rm-sb-comment', attr: { rows: '1', placeholder: 'Add a comment…', 'aria-label': `Comment [^${a.id}]`, spellcheck: 'true' } });
    ta.dataset.rmId = a.id;
    ta.dataset.saved = a.comment;
    ta.value = a.comment;
    ta.addEventListener('input', () => fit(ta));
    ta.addEventListener('blur', () => void this.save(ta));
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); ta.value = ta.dataset.saved ?? ''; fit(ta); ta.blur(); }
    });
    window.requestAnimationFrame(() => fit(ta));
  }

  private async save(ta: HTMLTextAreaElement) {
    if (!this.file || !ta.isConnected) return;
    const id = ta.dataset.rmId!;
    const v = cleanComment(ta.value);
    if (v === (ta.dataset.saved ?? '')) return;
    if (!v.trim()) {
      new Notice('Review Marks: the comment is empty. Use the unwrap button to remove the annotation.');
      ta.value = ta.dataset.saved ?? '';
      fit(ta);
      return;
    }
    ta.dataset.saved = v; // before the write, so the refresh it triggers sees this textarea as clean
    const ok = await writeComment(this.editor() ?? this.file, id, v);
    if (!ok) new Notice(`Review Marks: annotation [^${id}] is gone; the comment was not saved.`);
    this.schedule();
  }

  private async unwrap(id: string) {
    if (!this.file) return;
    const ok = await unwrapAnnotation(this.editor() ?? this.file, id);
    if (!ok) new Notice(`Review Marks: annotation [^${id}] not found.`);
    void this.refresh();
  }

  private async jump(id: string) {
    const file = this.file;
    if (!file) return;
    let view = this.markdownView();
    if (!view) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      if (!(leaf.view instanceof MarkdownView)) return;
      view = leaf.view;
    }
    const text = normalize(view.editor.getValue());
    const a = analyze(text).anns.find((x) => x.id === id);
    if (!a) return;
    const at = a.open >= 0 ? a.open + 1 : a.defFrom;
    const end = a.open >= 0 ? a.close : a.defTo;
    if (Platform.isMobile) this.app.workspace.rightSplit.collapse();
    this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
    if (view.getMode() === 'source') {
      const ed = view.editor;
      // @ts-expect-error Obsidian exposes the main CM6 EditorView as editor.cm.
      const cm = ed.cm as EditorView;
      const pos = ed.offsetToPos(at);
      const inTable = isTableLine(ed.getLine(pos.line));
      // editor.focus() focuses the "active" CM, which can be a table cell's editor that is already gone.
      cm.focus();
      ed.setCursor(pos);
      ed.scrollIntoView({ from: pos, to: ed.offsetToPos(end) }, true);
      if (inTable) {
        // CM can't scroll to a position inside Obsidian's table widget: scroll to the table, then the cell.
        cm.scrollDOM.scrollTop = cm.lineBlockAt(at).top - cm.scrollDOM.clientHeight / 3;
        window.setTimeout(() => {
          cm.dom.querySelector(`.cm-table-widget [data-rm-id="${id}"]`)?.scrollIntoView({ block: 'center' });
        }, 150);
      }
      // Moving the cursor into or out of a table swaps the cell editor (and focus) asynchronously.
      window.setTimeout(() => { if (!view!.containerEl.contains(document.activeElement)) (inTable ? ed : cm).focus(); }, 50);
    } else {
      // Reading view: scroll by source line (MarkdownPreviewView.applyScroll), then flash the Target.
      const line = (text.slice(0, at).match(/\n/g) ?? []).length;
      view.previewMode.applyScroll(Math.max(0, line - 2));
      flashInPreview(view, a.id);
    }
  }
}

/** Reading view renders lazily: wait for the Target's element, then scroll it to the middle and flash it. */
function flashInPreview(view: MarkdownView, id: string, tries = 20) {
  const el = view.previewMode.containerEl.querySelector<HTMLElement>(`.rm-target[data-rm-id="${id}"]`);
  if (!el) { if (tries > 0) window.setTimeout(() => flashInPreview(view, id, tries - 1), 50); return; }
  el.scrollIntoView({ block: 'center' });
  const all = view.previewMode.containerEl.querySelectorAll<HTMLElement>(`.rm-target[data-rm-id="${id}"]`);
  all.forEach((t) => t.addClass('rm-flash'));
  window.setTimeout(() => all.forEach((t) => t.removeClass('rm-flash')), 1200);
}

function fit(ta: HTMLTextAreaElement) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 2 + 'px';
}
