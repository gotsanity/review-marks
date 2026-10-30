// Every fragile or version-dependent API the plugin touches, each with its fallback.
import type { Editor, MarkdownPreviewView } from 'obsidian';
import type { ChangeDesc, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { isDelimiterRow, isTableLine, tableCells, type CellRange } from './core';

/**
 * The CodeMirror view behind an Obsidian editor. `editor.cm` is untyped but documented in
 * "Communicating with editor extensions". Undefined if it is missing or not a CM6 view.
 */
export function editorViewOf(editor: Editor): EditorView | undefined {
	const cm: unknown = (editor as unknown as { cm?: unknown }).cm;
	return cm instanceof EditorView ? cm : undefined;
}

/**
 * Runs `fn` and puts the scroll position back afterwards, so edits don't move the note.
 * `scrollSnapshot` needs @codemirror/view 6.22; without it, `fn` just runs.
 */
export function keepScroll<T>(view: EditorView, fn: () => T): T {
	if (typeof view.scrollSnapshot !== 'function') return fn();
	const snapshot = view.scrollSnapshot();
	const out = fn();
	view.dispatch({ effects: snapshot });
	return out;
}

// ---------- Live Preview table widget ----------
// Obsidian draws a table in Live Preview as a widget (`.cm-table-widget`) of rendered HTML that
// decorations can't reach. Nothing about it is public: `table tr` rows in source order without
// the delimiter row, `th`/`td` cells in source order, each cell's content in a
// `.table-cell-wrapper`, and a nested `.cm-editor` in a second wrapper while a cell is edited.
// Checked against 1.7.4 and 1.14. If any of it doesn't hold, tables stay undecorated and show the
// syntax as Obsidian renders it.

/** A table row's source: the line's text and where it starts. */
export interface TableRowSource {
	from: number;
	text: string;
}

/** A rendered table cell and the source range `[from, to)` of its content. */
export interface RenderedCell {
	el: HTMLElement;
	from: number;
	to: number;
}

/**
 * Pairs the cells of a table widget with their source ranges. `rows` are the table's source lines
 * without the delimiter row. Null if the widget's structure doesn't match the source.
 */
export function tableWidgetCells(widget: HTMLElement, rows: readonly TableRowSource[]): RenderedCell[] | null {
	const trs = Array.from(widget.querySelectorAll('table tr'));
	if (trs.length === 0 || trs.length !== rows.length) return null;
	const out: RenderedCell[] = [];
	for (let r = 0; r < rows.length; r++) {
		const row = rows[r] as TableRowSource;
		const ranges = tableCells(row.text);
		const tds = Array.from((trs[r] as Element).children).filter((c) => c.tagName === 'TD' || c.tagName === 'TH');
		if (tds.length !== ranges.length) return null;
		for (let c = 0; c < tds.length; c++) {
			const wrapper = Array.from((tds[c] as Element).children).find(
				(w) => w.classList.contains('table-cell-wrapper') && !w.querySelector('.cm-editor'),
			);
			const range = ranges[c] as CellRange;
			if (!wrapper) return null;
			out.push({ el: wrapper as HTMLElement, from: row.from + range.from, to: row.from + range.to });
		}
	}
	return out;
}

/** The table widgets in a Live Preview editor, each with its cells, skipping any that don't match the source. */
export function liveTableCells(view: EditorView): RenderedCell[][] {
	const doc = view.state.doc;
	const out: RenderedCell[][] = [];
	for (const widget of Array.from(view.contentDOM.querySelectorAll<HTMLElement>('.cm-table-widget'))) {
		try {
			const first = doc.lineAt(view.posAtDOM(widget));
			if (!isTableLine(first.text) || (first.number > 1 && isTableLine(doc.line(first.number - 1).text))) continue;
			const rows: TableRowSource[] = [];
			for (let n = first.number; n <= doc.lines; n++) {
				const line = doc.line(n);
				if (!isTableLine(line.text)) break;
				if (!isDelimiterRow(line.text)) rows.push({ from: line.from, text: line.text });
			}
			const cells = tableWidgetCells(widget, rows);
			if (cells) out.push(cells);
		} catch {
			// posAtDOM throws for a widget CodeMirror no longer tracks; skip it.
		}
	}
	return out;
}

/** Is this editor one of the small editors Obsidian opens inside a table cell? */
export function isTableCellEditor(view: EditorView): boolean {
	return view.dom.parentElement?.closest('.cm-table-widget') != null;
}

/**
 * An effect that keeps the current scroll position through `changes`, for the transaction that
 * makes them, so edits above the viewport don't shift the note. Undefined without
 * `scrollSnapshot` (@codemirror/view 6.22).
 */
export function scrollSnapshotThrough(view: EditorView, changes: ChangeDesc): StateEffect<unknown> | undefined {
	if (typeof view.scrollSnapshot !== 'function') return undefined;
	return view.scrollSnapshot().map(changes);
}

/**
 * Scrolls Reading view to a source line (0-based) and, once the Target with this ID is rendered,
 * centres and flashes it. `applyScroll` is public but its unit (a source line) is undocumented,
 * so the decorated Target's `scrollIntoView` does the real positioning when it can be found.
 */
export function scrollPreviewTo(preview: MarkdownPreviewView, line: number, id: string): void {
	preview.applyScroll(Math.max(0, line - 2));
	const win = preview.containerEl.win;
	let tries = 0;
	const find = () => {
		const el = preview.containerEl.querySelector(`.rm-target[data-rm-id="${id}"]`);
		if (el instanceof HTMLElement) {
			el.scrollIntoView({ block: 'center' });
			flash(el);
			return;
		}
		if (++tries < 10) win.requestAnimationFrame(find);
	};
	win.requestAnimationFrame(find);
}

function flash(el: HTMLElement): void {
	el.removeClass('rm-flash');
	// Restart the animation if it is still running from a previous jump.
	void el.offsetWidth;
	el.addClass('rm-flash');
	el.win.setTimeout(() => el.removeClass('rm-flash'), 1500);
}
