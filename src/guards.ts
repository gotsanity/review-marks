// Every fragile or version-dependent API the plugin touches, each with its fallback.
import type { App, Editor, Hotkey, MarkdownPreviewView, MarkdownView } from 'obsidian';
import type { ChangeDesc, EditorState, Extension, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { isDelimiterRow, isTableLine, lineOfOffset, lineStarts, normalizeLineEndings, tableCells, type CellRange } from './core';

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

const TABLE_WIDGET = '.cm-table-widget';

/** The Live Preview table widget `el` is in, if any. */
export function tableWidgetAt(el: Element): HTMLElement | null {
	return el.closest<HTMLElement>(TABLE_WIDGET);
}

/** Is `el` part of a table widget's own controls (its row and column drag handles), not cell content? */
export function isTableWidgetChrome(el: Element): boolean {
	return el.closest('.table-row-drag-handle, .table-col-drag-handle') !== null;
}

/**
 * The source range `[from, to)` of the content of the cell that `cellEditor` (a nested
 * `.cm-editor`) is open in. `rows` are as for `tableWidgetCells`. Null if the widget's structure
 * doesn't match the source.
 */
export function tableCellSource(cellEditor: Element, rows: readonly TableRowSource[]): CellRange | null {
	const td = cellEditor.closest('td, th');
	const widget = td && tableWidgetAt(td);
	if (!td || !widget) return null;
	const trs = Array.from(widget.querySelectorAll('table tr'));
	if (trs.length !== rows.length) return null;
	const r = trs.indexOf(td.parentElement as Element);
	const row = rows[r];
	if (!row) return null;
	const ranges = tableCells(row.text);
	const tds = Array.from((trs[r] as Element).children).filter((c) => c.tagName === 'TD' || c.tagName === 'TH');
	const range = ranges[tds.indexOf(td)];
	if (tds.length !== ranges.length || !range) return null;
	return { from: row.from + range.from, to: row.from + range.to };
}

/** The source rows of one table widget of `view` without the delimiter row, or null if CodeMirror no longer tracks it. */
function widgetRows(view: EditorView, widget: HTMLElement): TableRowSource[] | null {
	const doc = view.state.doc;
	try {
		const first = doc.lineAt(view.posAtDOM(widget));
		if (!isTableLine(first.text) || (first.number > 1 && isTableLine(doc.line(first.number - 1).text))) return null;
		const rows: TableRowSource[] = [];
		for (let n = first.number; n <= doc.lines; n++) {
			const line = doc.line(n);
			if (!isTableLine(line.text)) break;
			if (!isDelimiterRow(line.text)) rows.push({ from: line.from, text: line.text });
		}
		return rows;
	} catch {
		// posAtDOM throws for a widget CodeMirror no longer tracks.
		return null;
	}
}

/** The cells of one table widget of `view`, or null if it doesn't match the source or CodeMirror no longer tracks it. */
export function widgetCells(view: EditorView, widget: HTMLElement): RenderedCell[] | null {
	const rows = widgetRows(view, widget);
	return rows && tableWidgetCells(widget, rows);
}

/** A cell editor open in one of a note editor's table widgets, with its cell's source range in the note. */
export interface OpenCellEditor {
	view: EditorView;
	cell: CellRange;
}

/**
 * The cell editor that `el` is in, if it is one nested in a table widget of the note editor `view`.
 * Null if there is none, or if CodeMirror or the widget's structure doesn't let it be found.
 */
export function cellEditorAt(view: EditorView, el: Element): OpenCellEditor | null {
	const dom = el.closest<HTMLElement>('.cm-editor');
	const widget = dom?.parentElement && tableWidgetAt(dom.parentElement);
	if (!dom || !widget || widget.closest('.cm-editor') !== view.dom) return null;
	const cellView = typeof EditorView.findFromDOM === 'function' ? EditorView.findFromDOM(dom) : null;
	const rows = widgetRows(view, widget);
	const cell = rows && tableCellSource(dom, rows);
	return cellView && cell ? { view: cellView, cell } : null;
}

/** The table widgets in a Live Preview editor, each with its cells, skipping any that don't match the source. */
export function liveTableCells(view: EditorView): RenderedCell[][] {
	const out: RenderedCell[][] = [];
	for (const widget of Array.from(view.contentDOM.querySelectorAll<HTMLElement>(TABLE_WIDGET))) {
		const cells = widgetCells(view, widget);
		if (cells) out.push(cells);
	}
	return out;
}

/** Is this editor one of the small editors Obsidian opens inside a table cell? */
export function isTableCellEditor(view: EditorView): boolean {
	return view.dom.parentElement?.closest(TABLE_WIDGET) != null;
}

// Drags starting on these keep their own behaviour: embeds are rendered notes, not this note's
// text (a Live Preview table is drawn as an embed block too, but is ours), the badge belongs to an
// existing Annotation, and the comment box is a text field.
const OWN_DRAG = `.cm-embed-block:not(${TABLE_WIDGET}), .markdown-embed, .internal-embed, .rm-badge, .rm-cbox`;

/** Does a drag starting on `el` keep its own behaviour rather than annotate? */
export function keepsOwnDrag(el: Element): boolean {
	return el.closest(OWN_DRAG) !== null;
}

// Reading view draws the note's sections as children of the sizer, next to the inline title and
// properties (.mod-header), the embedded backlinks (.mod-footer) and a spacer (the pusher).
const NOT_NOTE_TEXT = '.markdown-preview-pusher, .mod-header, .mod-footer';

/**
 * Is `el` in the rendered note text of a Reading view, not its inline title, properties, footer or
 * the space around them? False if Reading view isn't drawn as expected.
 */
export function inRenderedNoteText(el: Element): boolean {
	for (let node: Element | null = el; node; node = node.parentElement) {
		const parent = node.parentElement;
		if (parent?.classList.contains('markdown-preview-sizer')) return !node.matches(NOT_NOTE_TEXT);
	}
	return false;
}

// ---------- Focus ----------

/**
 * An extension that turns the editor's focus changes into `effect`, through
 * `EditorView.focusChangeEffect` (@codemirror/view 6.13). Without it, no extension: callers then
 * rely on comparing with `view.hasFocus` after updates.
 */
export function focusChangeTracking(
	effect: (focusing: boolean) => StateEffect<unknown>,
	cm: { focusChangeEffect?: unknown } = EditorView,
): Extension {
	const facet = cm.focusChangeEffect as typeof EditorView.focusChangeEffect | undefined;
	if (!facet || typeof facet.of !== 'function') return [];
	return facet.of((_state: EditorState, focusing: boolean) => effect(focusing));
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
	if (!id) return;
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

const nextFrame = (win: Window) => new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));

/**
 * Scrolls the note in `view` to the Target that starts at source offset `at`. In Reading view the
 * Target is centred and, given its `id`, flashes (see `scrollPreviewTo`). In the editor its line is
 * centred, or put at screen height `top` when given; line heights are estimates until drawn, so
 * that is measured again for a few frames. Doesn't move the cursor.
 */
export async function scrollToAnnotation(view: MarkdownView, at: number, options: { id?: string; top?: number } = {}): Promise<void> {
	if (view.getMode() === 'preview') {
		const line = lineOfOffset(lineStarts(normalizeLineEndings(view.getViewData())), at);
		scrollPreviewTo(view.previewMode, line, options.id ?? '');
		return;
	}
	const { editor } = view;
	const cm = editorViewOf(editor);
	if (!cm) {
		const pos = editor.offsetToPos(at);
		editor.scrollIntoView({ from: pos, to: pos }, true);
		return;
	}
	const { top } = options;
	if (top === undefined) {
		cm.dispatch({ effects: EditorView.scrollIntoView(at, { y: 'center' }) });
		return;
	}
	const win = cm.dom.ownerDocument.defaultView ?? window;
	for (let i = 0; i < 4; i++) {
		await nextFrame(win);
		const now = cm.coordsAtPos(at, 1)?.top ?? cm.documentTop + cm.lineBlockAt(at).top;
		if (Math.abs(now - top) > 1) cm.scrollDOM.scrollTop += now - top;
	}
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

// ---------- Commands, hotkeys and the Hotkeys tab ----------
// None of this is in the typings. `app.commands.commands`, `app.hotkeyManager` (`getHotkeys`,
// `getDefaultHotkeys`) and `app.setting` (`open`, `openTabById`, the Hotkeys tab's `setQuery`) are
// the same in 1.7.4 and 1.14.5, and other plugins rely on them. The plugin only reads hotkeys.

/** A command registered with Obsidian. */
export interface RegisteredCommand {
	id: string;
	name: string;
}

/** Every command Obsidian has registered, or none if `app.commands` has changed shape. */
export function registeredCommands(app: App): RegisteredCommand[] {
	const commands = (app as unknown as { commands?: { commands?: unknown } }).commands?.commands;
	if (typeof commands !== 'object' || commands === null) return [];
	return Object.values(commands as Record<string, unknown>).filter(
		(c): c is RegisteredCommand =>
			typeof (c as RegisteredCommand | null)?.id === 'string' && typeof (c as RegisteredCommand).name === 'string',
	);
}

interface HotkeyManager {
	getHotkeys(id: string): Hotkey[] | undefined;
	getDefaultHotkeys(id: string): Hotkey[] | undefined;
}

/** A command's hotkeys as stored: the user's (undefined if they never set any) and its defaults. */
export interface StoredHotkeys {
	custom: Hotkey[] | undefined;
	defaults: Hotkey[] | undefined;
}

/**
 * Reads a command's stored hotkeys. Undefined if `app.hotkeyManager` is missing or has changed, so
 * callers show no hotkeys.
 */
export function hotkeyReader(app: App): ((id: string) => StoredHotkeys) | undefined {
	const manager = (app as unknown as { hotkeyManager?: Partial<HotkeyManager> }).hotkeyManager;
	if (typeof manager?.getHotkeys !== 'function' || typeof manager.getDefaultHotkeys !== 'function') return undefined;
	const m = manager as HotkeyManager;
	return (id) => ({ custom: m.getHotkeys(id), defaults: m.getDefaultHotkeys(id) });
}

interface SettingModal {
	open(): void;
	openTabById(id: string): unknown;
}

/**
 * Opens Settings on Obsidian's Hotkeys tab with its search set to `query`. Undefined if
 * `app.setting` is missing or has changed. If the tab has no `setQuery`, it opens unfiltered.
 */
export function hotkeysTabOpener(app: App): ((query: string) => void) | undefined {
	const setting = (app as unknown as { setting?: Partial<SettingModal> }).setting;
	if (typeof setting?.open !== 'function' || typeof setting.openTabById !== 'function') return undefined;
	const s = setting as SettingModal;
	return (query) => {
		s.open();
		const tab = s.openTabById('hotkeys') as { setQuery?: unknown } | null | undefined;
		if (typeof tab?.setQuery === 'function') (tab as { setQuery(q: string): void }).setQuery(query);
	};
}
