// Every fragile or version-dependent API the plugin touches, each with its fallback.
import type { Editor, MarkdownPreviewView, MarkdownView } from 'obsidian';
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
 *
 * Reading view ignores `applyScroll` while it is still rendering a note it has just opened or
 * switched to, and it renders a far Target only once it is scrolled near it. So the scroll is
 * asked for again on every frame until the Target shows up, for about two seconds.
 */
export function scrollPreviewTo(preview: MarkdownPreviewView, line: number, id: string): void {
	const top = Math.max(0, line - 2);
	preview.applyScroll(top);
	const win = preview.containerEl.win;
	let tries = 0;
	const find = () => {
		const el = preview.containerEl.querySelector(`.rm-target[data-rm-id="${id}"]`);
		if (el instanceof HTMLElement) {
			el.scrollIntoView({ block: 'center' });
			flash(el);
			return;
		}
		if (++tries >= 120) return;
		preview.applyScroll(top);
		win.requestAnimationFrame(find);
	};
	win.requestAnimationFrame(find);
}

// ---------- Annotate on drag in Reading view ----------

/** A DOM position: a node and an offset in it. */
export interface Caret {
	node: Node;
	offset: number;
}

/** The parts of a Document that turn a screen point into a caret. Either may be missing. */
export interface CaretSource {
	caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
	caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

/**
 * The caret at a screen point: the standard `caretPositionFromPoint`, or the older
 * `caretRangeFromPoint` where it is missing (WebKit and older Chromium). Null if there is no caret
 * at the point, undefined if neither API exists.
 */
export function caretFromPoint(doc: CaretSource, x: number, y: number): Caret | null | undefined {
	if (typeof doc.caretPositionFromPoint === 'function') {
		const p = doc.caretPositionFromPoint(x, y);
		return p ? { node: p.offsetNode, offset: p.offset } : null;
	}
	if (typeof doc.caretRangeFromPoint === 'function') {
		const r = doc.caretRangeFromPoint(x, y);
		return r ? { node: r.startContainer, offset: r.startOffset } : null;
	}
	return undefined;
}

const DRAG_HIGHLIGHT = 'rm-drag';

/**
 * Draws `range` (or clears it, for null) with the CSS Custom Highlight API, styled by
 * `::highlight(rm-drag)`. Without the API it falls back to the real selection.
 */
export function showDragRange(win: Window, range: Range | null): void {
	// Typed here: the `lib` setting doesn't give HighlightRegistry its Map methods.
	const { CSS: css, Highlight } = win as unknown as {
		CSS?: { highlights?: { set(name: string, h: unknown): unknown; delete(name: string): unknown } };
		Highlight?: new (...ranges: Range[]) => unknown;
	};
	const highlights = css?.highlights;
	if (highlights && typeof Highlight === 'function') {
		if (range) highlights.set(DRAG_HIGHLIGHT, new Highlight(range));
		else highlights.delete(DRAG_HIGHLIGHT);
		return;
	}
	const selection = win.getSelection();
	selection?.removeAllRanges();
	if (range) selection?.addRange(range);
}

/**
 * Switches a note from Reading view to Live Preview and returns its CodeMirror view. The `mode`
 * and `source` view-state keys are undocumented, so the result is checked: undefined if the note
 * is not in Live Preview afterwards.
 */
export async function switchToLivePreview(view: MarkdownView): Promise<EditorView | undefined> {
	await view.setState({ ...view.getState(), mode: 'source', source: false }, { history: false });
	if (view.getMode() !== 'source' || view.getState().source !== false) return undefined;
	return editorViewOf(view.editor);
}

function flash(el: HTMLElement): void {
	el.removeClass('rm-flash');
	// Restart the animation if it is still running from a previous jump.
	void el.offsetWidth;
	el.addClass('rm-flash');
	el.win.setTimeout(() => el.removeClass('rm-flash'), 1500);
}

/**
 * Is this post processor call an export render (PDF export, or `MarkdownRenderer.render` as used
 * by Copy as HTML) rather than an embed or a Live Preview table cell? None of them has section
 * info. Obsidian passes embeds and table cells the undocumented `displayMode: false`; a render
 * inside an editor is never an export, which still holds if that flag goes away.
 */
export function isExportRender(el: HTMLElement, ctx: { getSectionInfo(el: HTMLElement): unknown }): boolean {
	if (ctx.getSectionInfo(el)) return false;
	if ((ctx as { displayMode?: unknown }).displayMode === false) return false;
	return !el.closest('.cm-editor');
}
