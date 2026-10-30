// The annotations sidebar: an ItemView in the right sidebar listing every Annotation of the active
// note by heading section, with the Comment editable in place. Click a Target to scroll the note
// there (focus stays here), double-click to put the cursor on it.
// The view wires the parts together: tracked-note.ts (which note), outline-list.ts (drawing),
// comment-editing.ts (the Comment textareas) and actions.ts (what the controls do).
import { ItemView, MarkdownView, Scope, type Plugin, type WorkspaceLeaf } from 'obsidian';
import { duplicateIds, isExcalidraw, outline, parse } from '../core';
import type { ReviewMarksSettings } from '../settings';
import { fixIds, jump, removeAnnotation, saveComment } from './actions';
import { takeEdit } from './comment-editing';
import { countLabel, OutlineList } from './outline-list';
import { TrackedNote } from './tracked-note';

export { countLabel } from './outline-list';

export const VIEW_TYPE_ANNOTATIONS = 'review-marks-annotations';
const ICON = 'message-square-text';
const REFRESH_DELAY = 250;

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
	private readonly note = new TrackedNote(this.app);
	private timer: number | null = null;
	private list!: OutlineList;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly settings: () => ReviewMarksSettings,
	) {
		super(leaf);
		// Obsidian's keymap sees Mod+Enter before a textarea does; the view's own Scope runs first.
		this.scope = new Scope(this.app.scope);
		this.scope.register(['Mod'], 'Enter', () => {
			const ta = this.containerEl.doc.activeElement;
			if (!(ta instanceof HTMLTextAreaElement) || !this.list.listEl.contains(ta)) return true;
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
		this.list = new OutlineList(this.contentEl, {
			jump: (id, enter) => void jump(this.app, this.note, id, enter),
			remove: (id) => void this.after(removeAnnotation(this.note, id)),
			save: (ta) => void this.save(ta),
			fixIds: () => void this.after(fixIds(this.note)),
		});
		const ws = this.app.workspace;
		this.registerEvent(ws.on('active-leaf-change', (leaf) => this.follow(leaf)));
		this.registerEvent(ws.on('file-open', () => this.follow(ws.getActiveViewOfType(MarkdownView)?.leaf ?? null)));
		this.registerEvent(
			ws.on('editor-change', (_editor, info) => {
				if (info.file === this.note.file) this.schedule();
			}),
		);
		this.registerEvent(this.app.vault.on('modify', (f) => f === this.note.file && this.schedule()));
		this.registerEvent(this.app.vault.on('rename', (f) => f === this.note.file && this.schedule()));
		this.registerEvent(
			this.app.vault.on('delete', (f) => {
				if (f !== this.note.file) return;
				this.note.clear();
				void this.refresh();
			}),
		);
		// At startup the sidebar is restored before the note tabs.
		ws.onLayoutReady(() => {
			this.follow(ws.getActiveViewOfType(MarkdownView)?.leaf ?? ws.getMostRecentLeaf(ws.rootSplit));
			if (!this.note.file) void this.refresh();
		});
	}

	async onClose(): Promise<void> {
		if (this.timer !== null) this.containerEl.win.clearTimeout(this.timer);
	}

	private follow(leaf: WorkspaceLeaf | null): void {
		if (this.note.follow(leaf)) void this.refresh();
	}

	private schedule(): void {
		const win = this.containerEl.win;
		if (this.timer !== null) win.clearTimeout(this.timer);
		this.timer = win.setTimeout(() => void this.refresh(), REFRESH_DELAY);
	}

	/** Refreshes once `done` has written its change. */
	private async after(done: Promise<void>): Promise<void> {
		await done;
		await this.refresh();
	}

	async refresh(): Promise<void> {
		if (this.timer !== null) this.containerEl.win.clearTimeout(this.timer);
		this.timer = null;
		const file = this.note.file;
		if (!file) {
			this.list.showEmpty('Open a note to see its annotations.');
			return;
		}
		const text = await this.note.readText(file);
		if (file !== this.note.file) return;
		const doc = parse(text);
		const o = outline(doc, file.basename);
		if (o.groups.length === 0 && o.untargeted.length === 0) {
			const empty = isExcalidraw(text) ? 'Annotations are off in Excalidraw drawings.' : 'No annotations in this note.';
			this.list.showEmpty(empty, countLabel(o.count), duplicateIds(doc));
			return;
		}
		this.list.show(file.path, o, duplicateIds(doc));
	}

	private async save(ta: HTMLTextAreaElement): Promise<void> {
		if (!this.note.file || !ta.isConnected) return;
		const comment = takeEdit(ta);
		if (comment === null) return;
		await saveComment(this.note, ta.dataset.rmId ?? '', comment, this.settings().placement);
		this.schedule();
	}
}
