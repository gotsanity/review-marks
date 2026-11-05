// Review Mode in Live Preview and Source mode: the editor selects natively, and releasing the
// pointer over a selection starts an Annotation on it (see releaseDecision). A double-click opens
// the box at once, so a triple-click can't happen. Keyboard selections never count: only a pointer
// release is looked at. In a Live Preview table, clicking a cell opens a small cell editor: a
// selection there is converted to note offsets and annotated in the note editor (see cellToNote).
import type { Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView } from '@codemirror/view';
import { annotateRange } from '../commands/annotate-selection';
import { cellEditorAt, inNoteEditor, isTableCellEditor, isTableWidgetChrome, keepsOwnDrag, type OpenCellEditor } from '../guards';
import { notify } from '../notice';
import { elementOf, isPrimaryPress } from '../pointer';
import type { ReviewMarksSettings } from '../settings';
import { boxOpenSince, isReviewPress, pressAt, type Press } from './press';
import { releaseDecision, selectionShape, type Release } from './release';
import { cellToNote } from './table-cell';
import type { ReviewModeStore } from './store';

/** Where a pointerdown on `target` went down, seen from `view`. */
function whereDown(view: EditorView, target: EventTarget | null): Release['down'] {
	const el = elementOf(target);
	if (!el || !view.contentDOM.contains(el) || isTableWidgetChrome(el)) return 'elsewhere';
	// A cell editor open in one of this note's tables is note content too.
	if (!inNoteEditor(view, el)) return 'elsewhere';
	return keepsOwnDrag(el) ? 'keeps-own' : 'content';
}

class ReleaseHandler {
	private press: Press | null = null;
	private timer: number | null = null;

	constructor(
		private readonly view: EditorView,
		private readonly store: ReviewModeStore,
		private readonly settings: () => ReviewMarksSettings,
		private readonly isMac: boolean,
	) {
		const win = this.win;
		// Window capture runs before the comment box's own document listener closes it.
		win.addEventListener('pointerdown', this.onDown, true);
		win.addEventListener('pointerup', this.onUp, true);
	}

	private get win(): Window {
		return this.view.dom.ownerDocument.defaultView ?? window;
	}

	destroy(): void {
		const win = this.win;
		win.removeEventListener('pointerdown', this.onDown, true);
		win.removeEventListener('pointerup', this.onUp, true);
		if (this.timer !== null) win.clearTimeout(this.timer);
	}

	private readonly onDown = (e: PointerEvent): void => {
		const ours = isReviewPress(e, this.settings().dragTrigger, this.isMac);
		this.press = ours ? pressAt(whereDown(this.view, e.target)) : null;
	};

	private readonly onUp = (e: PointerEvent): void => {
		const press = this.press;
		this.press = null;
		if (!this.store.on || !isPrimaryPress(e)) return;
		if (isTableCellEditor(this.view)) return;
		// Let CodeMirror finish its own selection handling first.
		if (this.timer !== null) this.win.clearTimeout(this.timer);
		this.timer = this.win.setTimeout(() => {
			this.timer = null;
			this.release(press);
		}, 0);
	};

	private release(press: Press | null): void {
		const { view } = this;
		if (!view.dom.isConnected || !this.store.on) return;
		const text = view.state.doc.toString();
		// A press in a table cell opens a cell editor, which then holds the focus and the selection.
		const active = view.dom.ownerDocument.activeElement;
		const cell = active ? cellEditorAt(view, active) : null;
		if (!cell && !view.hasFocus) return;
		const decision = releaseDecision({
			text,
			selection: cell
				? { shape: selectionShape(cell.view.state.selection.ranges), map: () => cellSelectionInNote(text, cell) }
				: { ranges: view.state.selection.ranges },
			commentBoxOpen: boxOpenSince(press),
			down: press?.where ?? null,
		});
		if ('refuse' in decision) notify(decision.refuse);
		else if ('start' in decision) annotateRange(view, decision.start.from, decision.start.to, this.settings());
	}
}

/** The note range of a cell editor's selection. The Annotation goes into the note, never the cell editor's copy. */
function cellSelectionInNote(text: string, { view, cell }: OpenCellEditor) {
	return cellToNote(text, cell, view.state.doc.toString(), view.state.selection.main);
}

/** The editor extension. Register it on desktop only. `isMac` is `Platform.isMacOS`. */
export function editorRelease(store: ReviewModeStore, settings: () => ReviewMarksSettings, isMac: boolean): Extension {
	return ViewPlugin.define((view) => new ReleaseHandler(view, store, settings, isMac));
}
