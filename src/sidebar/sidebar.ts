// The annotations sidebar: an ItemView in the right sidebar listing every Annotation of the active
// note by heading section, with the Comment editable in place. Click a Target to scroll the note
// there (focus stays here), double-click to put the cursor on it.
import { ItemView, MarkdownView, Platform, Scope, setIcon, type Plugin, type TFile, type WorkspaceLeaf } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { EditorChangeTarget } from '../apply/editor-target';
import { FileChangeTarget } from '../apply/file-target';
import type { ChangeTarget } from '../apply/change-target';
import {
	duplicateIds,
	isExcalidraw,
	isRefusal,
	planFixIds,
	normalizeComment,
	normalizeLineEndings,
	outline,
	parse,
	planEditComment,
	planRemove,
	type OutlineEntry,
	type OutlineGroup,
} from '../core';
import { editorViewOf, scrollPreviewTo } from '../guards';
import { notify } from '../notice';
import type { ReviewMarksSettings } from '../settings';

export const VIEW_TYPE_ANNOTATIONS = 'review-marks-annotations';
const ICON = 'message-square-text';
const REFRESH_DELAY = 250;

/** "1 annotation", "N annotations". */
export function countLabel(count: number): string {
	return count === 1 ? '1 annotation' : `${count} annotations`;
}

/** Opens the sidebar in the right split, or reveals it if it is already open. */
export async function openSidebar(plugin: Plugin): Promise<void> {
	await plugin.app.workspace.ensureSideLeaf(VIEW_TYPE_ANNOTATIONS, 'right', { active: true, reveal: true });
}

/** Registers the view, its ribbon icon and the "Open annotations sidebar" command (no default hotkey). */
export function registerSidebar(plugin: Plugin, settings: () => ReviewMarksSettings): void {
	plugin.registerView(VIEW_TYPE_ANNOTATIONS, (leaf) => new AnnotationsView(leaf, settings));
	const open = () => void openSidebar(plugin);
	plugin.addRibbonIcon(ICON, 'Open annotations sidebar', open);
	plugin.addCommand({ id: 'open-annotations-sidebar', name: 'Open annotations sidebar', callback: open });
}

export class AnnotationsView extends ItemView {
	private file: TFile | null = null;
	/** The note's leaf, remembered because using the sidebar makes the sidebar the active leaf. */
	private noteLeaf: WorkspaceLeaf | null = null;
	private timer: number | null = null;
	/** What the list shows apart from Comments, to tell a Comment-only change from a new list. */
	private signature = '';
	private readonly collapsed = new Set<string>();
	private countEl!: HTMLElement;
	private duplicatesEl!: HTMLElement;
	private listEl!: HTMLElement;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly settings: () => ReviewMarksSettings,
	) {
		super(leaf);
		// Obsidian's keymap sees Mod+Enter before a textarea does; the view's own Scope runs first.
		this.scope = new Scope(this.app.scope);
		this.scope.register(['Mod'], 'Enter', () => {
			const ta = this.containerEl.doc.activeElement;
			if (!(ta instanceof HTMLTextAreaElement) || !this.listEl.contains(ta)) return true;
			void this.save(ta);
			return false;
		});
	}

	getViewType(): string {
		return VIEW_TYPE_ANNOTATIONS;
	}

	getDisplayText(): string {
		return 'Annotations';
	}

	getIcon(): string {
		return ICON;
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('rm-sidebar');
		this.countEl = this.contentEl.createDiv({ cls: 'rm-sb-count' });
		this.duplicatesEl = this.contentEl.createDiv({ cls: 'rm-sb-duplicates' });
		this.listEl = this.contentEl.createDiv({ cls: 'rm-sb-list' });
		const ws = this.app.workspace;
		this.registerEvent(ws.on('active-leaf-change', (leaf) => this.follow(leaf)));
		this.registerEvent(ws.on('file-open', () => this.follow(ws.getActiveViewOfType(MarkdownView)?.leaf ?? null)));
		this.registerEvent(
			ws.on('editor-change', (_editor, info) => {
				if (info.file === this.file) this.schedule();
			}),
		);
		this.registerEvent(this.app.vault.on('modify', (f) => f === this.file && this.schedule()));
		this.registerEvent(this.app.vault.on('rename', (f) => f === this.file && this.schedule()));
		this.registerEvent(
			this.app.vault.on('delete', (f) => {
				if (f !== this.file) return;
				this.file = null;
				this.noteLeaf = null;
				void this.refresh();
			}),
		);
		// At startup the sidebar is restored before the note tabs.
		ws.onLayoutReady(() => {
			this.follow(ws.getActiveViewOfType(MarkdownView)?.leaf ?? ws.getMostRecentLeaf(ws.rootSplit));
			if (!this.file) void this.refresh();
		});
	}

	async onClose(): Promise<void> {
		if (this.timer !== null) this.containerEl.win.clearTimeout(this.timer);
	}

	/** Follows the active leaf: a note shows its Annotations, another main-area tab clears the list, sidebars are ignored. */
	private follow(leaf: WorkspaceLeaf | null): void {
		if (leaf?.view instanceof MarkdownView) {
			if (leaf === this.noteLeaf && leaf.view.file === this.file) return;
			this.noteLeaf = leaf;
			this.file = leaf.view.file;
		} else if (leaf && leaf.getRoot() === this.app.workspace.rootSplit) {
			this.noteLeaf = null;
			this.file = null;
		} else return;
		void this.refresh();
	}

	private schedule(): void {
		const win = this.containerEl.win;
		if (this.timer !== null) win.clearTimeout(this.timer);
		this.timer = win.setTimeout(() => void this.refresh(), REFRESH_DELAY);
	}

	/** An open MarkdownView of the listed note, preferring the leaf it was last active in. */
	private markdownView(): MarkdownView | null {
		const leaves = [this.noteLeaf, ...this.app.workspace.getLeavesOfType('markdown')];
		for (const leaf of leaves) if (leaf?.view instanceof MarkdownView && leaf.view.file === this.file) return leaf.view;
		return null;
	}

	/** Where edits go: the open editor (one undo step), else the file through `Vault.process`. */
	private changeTarget(file: TFile): ChangeTarget {
		const cm = this.markdownView() ? editorViewOf((this.markdownView() as MarkdownView).editor) : undefined;
		return cm ? new EditorChangeTarget(cm) : new FileChangeTarget(this.app.vault, file);
	}

	private async readText(file: TFile): Promise<string> {
		const view = this.markdownView();
		return normalizeLineEndings(view ? view.editor.getValue() : await this.app.vault.cachedRead(file));
	}

	async refresh(): Promise<void> {
		if (this.timer !== null) this.containerEl.win.clearTimeout(this.timer);
		this.timer = null;
		const file = this.file;
		if (!file) {
			this.signature = '';
			this.showDuplicates([]);
			this.countEl.setText('');
			this.listEl.empty();
			this.listEl.createDiv({ cls: 'rm-sb-empty', text: 'Open a note to see its annotations.' });
			return;
		}
		const text = await this.readText(file);
		if (file !== this.file) return;
		const doc = parse(text);
		const o = outline(doc, file.basename);
		this.countEl.setText(countLabel(o.count));
		this.showDuplicates(duplicateIds(doc));
		if (o.groups.length === 0 && o.untargeted.length === 0) {
			this.signature = '';
			this.listEl.empty();
			const empty = isExcalidraw(text) ? 'Annotations are off in Excalidraw drawings.' : 'No annotations in this note.';
			this.listEl.createDiv({ cls: 'rm-sb-empty', text: empty });
			return;
		}
		const groups = o.untargeted.length
			? [...o.groups, { title: 'Comments without a target', level: 1, total: o.untargeted.length, entries: o.untargeted, children: [] }]
			: o.groups;
		const parts = [file.path];
		const walk = (gs: OutlineGroup[]) => {
			for (const g of gs) {
				parts.push(`[${g.level}:${g.title}:${g.total}`, ...g.entries.map((e) => `${e.id}:${e.target ?? ''}`));
				walk(g.children);
				parts.push(']');
			}
		};
		walk(groups);
		const signature = parts.join('\n');
		if (signature === this.signature) this.patch(groups);
		else {
			const samePath = this.signature.startsWith(file.path + '\n');
			this.signature = signature;
			this.rebuild(groups, samePath);
		}
	}

	/** Flags IDs used twice, which hide all but their first Annotation, with a "Fix IDs" button. */
	private showDuplicates(ids: readonly string[]): void {
		const key = ids.join(',');
		if (this.duplicatesEl.dataset.ids === key) return;
		this.duplicatesEl.dataset.ids = key;
		this.duplicatesEl.empty();
		this.duplicatesEl.toggleClass('is-hidden', ids.length === 0);
		if (ids.length === 0) return;
		const labels = ids.map((id) => `[^${id}]`).join(', ');
		this.duplicatesEl.createDiv({
			cls: 'rm-sb-duplicates-text',
			text: `${ids.length === 1 ? 'This ID is' : 'These IDs are'} used more than once: ${labels}. Only the first use shows.`,
		});
		const button = this.duplicatesEl.createEl('button', { cls: 'mod-warning', text: 'Fix IDs' });
		button.addEventListener('click', () => void this.fixIds());
	}

	/** Gives each later use of a duplicate ID a new one, as one undo step. */
	private async fixIds(): Promise<void> {
		const file = this.file;
		if (!file) return;
		const plan = await this.changeTarget(file).apply(planFixIds);
		if (isRefusal(plan)) notify(plan.message);
		await this.refresh();
	}

	private textareas(): HTMLTextAreaElement[] {
		return Array.from(this.listEl.querySelectorAll<HTMLTextAreaElement>('textarea.rm-sb-comment'));
	}

	/** Only Comments changed: update the textareas, leaving one with an unsaved draft alone. */
	private patch(groups: OutlineGroup[]): void {
		const comments = new Map<string, string>();
		const walk = (gs: OutlineGroup[]) => {
			for (const g of gs) {
				for (const e of g.entries) comments.set(e.id, e.comment);
				walk(g.children);
			}
		};
		walk(groups);
		for (const ta of this.textareas()) {
			const comment = comments.get(ta.dataset.rmId ?? '');
			const saved = ta.dataset.saved ?? '';
			if (comment === undefined || comment === saved) continue;
			if (ta.value === saved) {
				ta.value = comment;
				fit(ta);
			}
			ta.dataset.saved = comment;
		}
	}

	private rebuild(groups: OutlineGroup[], samePath: boolean): void {
		// A textarea being typed in keeps its draft, caret and focus.
		const active = this.containerEl.doc.activeElement;
		const drafts = new Map<string, string>();
		for (const ta of this.textareas()) if (ta.value !== ta.dataset.saved) drafts.set(ta.dataset.rmId ?? '', ta.value);
		const focus =
			active instanceof HTMLTextAreaElement && this.listEl.contains(active)
				? { id: active.dataset.rmId ?? '', start: active.selectionStart, end: active.selectionEnd }
				: null;
		const scroll = samePath ? this.contentEl.scrollTop : 0;
		if (!samePath) drafts.clear();

		this.listEl.empty();
		for (const g of groups) this.renderGroup(this.listEl, g);
		this.contentEl.scrollTop = scroll;

		for (const ta of this.textareas()) {
			const draft = drafts.get(ta.dataset.rmId ?? '');
			if (draft !== undefined) {
				ta.value = draft;
				fit(ta);
			}
			if (focus && ta.dataset.rmId === focus.id) {
				ta.focus({ preventScroll: true });
				ta.setSelectionRange(focus.start, focus.end);
			}
		}
	}

	private groupKey(g: OutlineGroup): string {
		return `${this.file?.path ?? ''}#${g.level}:${g.title}`;
	}

	private renderGroup(parent: HTMLElement, g: OutlineGroup): void {
		const key = this.groupKey(g);
		const box = parent.createDiv({ cls: 'rm-sb-group' });
		box.toggleClass('is-collapsed', this.collapsed.has(key));
		box.dataset.level = String(g.level);
		const head = box.createDiv({
			cls: 'rm-sb-group-head',
			attr: { role: 'button', tabindex: '0', 'aria-expanded': String(!this.collapsed.has(key)) },
		});
		setIcon(head.createSpan({ cls: 'rm-sb-chevron' }), 'chevron-down');
		head.createSpan({ cls: 'rm-sb-group-title', text: g.title });
		head.createSpan({ cls: 'rm-sb-group-count', text: String(g.total) });
		const toggle = () => {
			const collapse = !this.collapsed.has(key);
			if (collapse) this.collapsed.add(key);
			else this.collapsed.delete(key);
			box.toggleClass('is-collapsed', collapse);
			head.setAttribute('aria-expanded', String(!collapse));
		};
		head.addEventListener('click', toggle);
		head.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle();
			}
		});
		const body = box.createDiv({ cls: 'rm-sb-group-body' });
		for (const e of g.entries) this.renderEntry(body, e);
		for (const c of g.children) this.renderGroup(body, c);
	}

	private renderEntry(parent: HTMLElement, entry: OutlineEntry): void {
		const { id } = entry;
		const el = parent.createDiv({ cls: 'rm-sb-entry' });
		el.dataset.rmId = id;
		const row = el.createDiv({ cls: 'rm-sb-entry-head' });
		const target = row.createDiv({
			cls: 'rm-sb-target',
			text: entry.target ?? `[^${id}]`,
			attr: { role: 'button', tabindex: '0', 'aria-label': 'Click to show in the note, double-click to edit there' },
		});
		target.addEventListener('click', () => void this.jump(id, false));
		target.addEventListener('dblclick', () => void this.jump(id, true));
		target.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				void this.jump(id, true);
			} else if (e.key === ' ') {
				e.preventDefault();
				void this.jump(id, false);
			}
		});
		const remove = row.createEl('button', { cls: 'rm-sb-remove clickable-icon', attr: { 'aria-label': 'Remove annotation' } });
		setIcon(remove, 'eraser');
		remove.addEventListener('click', (e) => {
			e.stopPropagation();
			void this.remove(id);
		});

		const ta = el.createEl('textarea', {
			cls: 'rm-sb-comment',
			attr: { rows: '1', placeholder: 'Add a comment…', 'aria-label': `Comment [^${id}]` },
		});
		ta.dataset.rmId = id;
		ta.dataset.saved = entry.comment;
		ta.value = entry.comment;
		ta.addEventListener('input', () => fit(ta));
		ta.addEventListener('blur', () => void this.save(ta));
		ta.addEventListener('keydown', (e) => {
			if (e.key !== 'Escape') return;
			e.preventDefault();
			ta.value = ta.dataset.saved ?? '';
			fit(ta);
			ta.blur();
		});
		this.containerEl.win.requestAnimationFrame(() => fit(ta));
	}

	private async save(ta: HTMLTextAreaElement): Promise<void> {
		const file = this.file;
		if (!file || !ta.isConnected) return;
		const id = ta.dataset.rmId ?? '';
		const comment = normalizeComment(ta.value);
		if (comment === normalizeComment(ta.dataset.saved ?? '')) return;
		if (comment === '') {
			notify('a comment cannot be empty. To delete it, use Remove annotation.');
			ta.value = ta.dataset.saved ?? '';
			fit(ta);
			return;
		}
		// Before the write, so the refresh it triggers sees this textarea as saved.
		ta.dataset.saved = comment;
		const placement = this.settings().placement;
		const plan = await this.changeTarget(file).apply((doc) => planEditComment(doc, { id, comment, placement }));
		if (isRefusal(plan)) notify(plan.message);
		this.schedule();
	}

	private async remove(id: string): Promise<void> {
		const file = this.file;
		if (!file) return;
		const plan = await this.changeTarget(file).apply((doc) => planRemove(doc, id));
		if (isRefusal(plan)) notify(plan.message);
		await this.refresh();
	}

	/**
	 * Shows the Target in the note. `enter` false (click): scrolls there and focus stays in the
	 * sidebar. `enter` true (double-click): the cursor goes to the Target and the note takes focus.
	 */
	private async jump(id: string, enter: boolean): Promise<void> {
		const file = this.file;
		if (!file) return;
		let view = this.markdownView();
		if (!view) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file, { active: enter });
			if (!(leaf.view instanceof MarkdownView)) return;
			view = leaf.view;
			this.noteLeaf = leaf;
		} else if (!view.containerEl.isShown()) await this.app.workspace.revealLeaf(view.leaf);
		const text = normalizeLineEndings(view.editor.getValue());
		const doc = parse(text);
		const a = doc.annotations.find((x) => x.id === id);
		const def = a ? a.definition : (doc.orphanDefinitions.find((d) => d.id === id) ?? null);
		if (!a && !def) return;
		const at = a ? a.open + 1 : (def as { from: number }).from;
		if (Platform.isMobile) this.app.workspace.rightSplit.collapse();
		if (enter) this.app.workspace.setActiveLeaf(view.leaf, { focus: true });

		if (view.getMode() === 'preview') {
			const line = text.slice(0, at).split('\n').length - 1;
			scrollPreviewTo(view.previewMode, line, id);
			return;
		}
		const { editor } = view;
		const pos = editor.offsetToPos(at);
		const cm = editorViewOf(editor);
		if (enter) {
			editor.setCursor(pos);
			if (cm) cm.focus();
			else editor.focus();
		}
		if (cm) cm.dispatch({ effects: EditorView.scrollIntoView(at, { y: 'center' }) });
		else editor.scrollIntoView({ from: pos, to: pos }, true);
	}
}

/** Grows a textarea to fit its text. */
function fit(ta: HTMLTextAreaElement): void {
	ta.setCssProps({ '--rm-sb-comment-height': 'auto' });
	ta.setCssProps({ '--rm-sb-comment-height': `${ta.scrollHeight + 2}px` });
}
