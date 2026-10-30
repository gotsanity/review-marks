// Draws a note's outline in the sidebar: the count, the duplicate-ID warning, and the Annotations
// by heading section in collapsible groups. When only Comments changed, it updates the textareas
// in place; otherwise it rebuilds, keeping drafts, focus and scroll.
import { setIcon } from 'obsidian';
import type { Outline, OutlineEntry, OutlineGroup } from '../core';
import { commentField, fit, updateSaved } from './comment-editing';

/** "1 annotation", "N annotations". */
export function countLabel(count: number): string {
	return count === 1 ? '1 annotation' : `${count} annotations`;
}

/** What the list's controls ask for. */
export interface OutlineActions {
	jump(id: string, enter: boolean): void;
	remove(id: string): void;
	save(ta: HTMLTextAreaElement): void;
	fixIds(): void;
}

export class OutlineList {
	private readonly countEl: HTMLElement;
	private readonly duplicatesEl: HTMLElement;
	readonly listEl: HTMLElement;
	/** What the list shows apart from Comments, to tell a Comment-only change from a new list. */
	private signature = '';
	private readonly collapsed = new Set<string>();
	private path = '';

	constructor(
		private readonly scrollEl: HTMLElement,
		private readonly actions: OutlineActions,
	) {
		this.countEl = scrollEl.createDiv({ cls: 'rm-sb-count' });
		this.duplicatesEl = scrollEl.createDiv({ cls: 'rm-sb-duplicates' });
		this.listEl = scrollEl.createDiv({ cls: 'rm-sb-list' });
	}

	/** No list: a message instead, with the count and duplicates cleared unless given. */
	showEmpty(message: string, count = '', duplicates: readonly string[] = []): void {
		this.signature = '';
		this.countEl.setText(count);
		this.showDuplicates(duplicates);
		this.listEl.empty();
		this.listEl.createDiv({ cls: 'rm-sb-empty', text: message });
	}

	/** Shows the outline of the note at `path`. */
	show(path: string, o: Outline, duplicates: readonly string[]): void {
		this.countEl.setText(countLabel(o.count));
		this.showDuplicates(duplicates);
		const groups = o.untargeted.length
			? [...o.groups, { title: 'Comments without a target', level: 1, total: o.untargeted.length, entries: o.untargeted, children: [] }]
			: o.groups;
		const parts = [path];
		const walk = (gs: OutlineGroup[]) => {
			for (const g of gs) {
				parts.push(`[${g.level}:${g.title}:${g.total}`, ...g.entries.map((e) => `${e.id}:${e.target ?? ''}`));
				walk(g.children);
				parts.push(']');
			}
		};
		walk(groups);
		const signature = parts.join('\n');
		this.path = path;
		if (signature === this.signature) this.patch(groups);
		else {
			const samePath = this.signature.startsWith(path + '\n');
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
		button.addEventListener('click', () => this.actions.fixIds());
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
			if (comment !== undefined) updateSaved(ta, comment);
		}
	}

	private rebuild(groups: OutlineGroup[], samePath: boolean): void {
		// A textarea being typed in keeps its draft, caret and focus.
		const active = this.listEl.doc.activeElement;
		const drafts = new Map<string, string>();
		for (const ta of this.textareas()) if (ta.value !== ta.dataset.saved) drafts.set(ta.dataset.rmId ?? '', ta.value);
		const focus =
			active instanceof HTMLTextAreaElement && this.listEl.contains(active)
				? { id: active.dataset.rmId ?? '', start: active.selectionStart, end: active.selectionEnd }
				: null;
		const scroll = samePath ? this.scrollEl.scrollTop : 0;
		if (!samePath) drafts.clear();

		this.listEl.empty();
		for (const g of groups) this.renderGroup(this.listEl, g);
		this.scrollEl.scrollTop = scroll;

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

	private renderGroup(parent: HTMLElement, g: OutlineGroup): void {
		const key = `${this.path}#${g.level}:${g.title}`;
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
		const { actions } = this;
		const el = parent.createDiv({ cls: 'rm-sb-entry' });
		el.dataset.rmId = id;
		const row = el.createDiv({ cls: 'rm-sb-entry-head' });
		const target = row.createDiv({
			cls: 'rm-sb-target',
			text: entry.target ?? `[^${id}]`,
			attr: { role: 'button', tabindex: '0', 'aria-label': 'Click to show in the note, double-click to edit there' },
		});
		target.addEventListener('click', () => actions.jump(id, false));
		target.addEventListener('dblclick', () => actions.jump(id, true));
		target.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				actions.jump(id, true);
			} else if (e.key === ' ') {
				e.preventDefault();
				actions.jump(id, false);
			}
		});
		const remove = row.createEl('button', { cls: 'rm-sb-remove clickable-icon', attr: { 'aria-label': 'Remove annotation' } });
		setIcon(remove, 'eraser');
		remove.addEventListener('click', (e) => {
			e.stopPropagation();
			actions.remove(id);
		});
		commentField(el, id, entry.comment, (ta) => actions.save(ta));
	}
}
