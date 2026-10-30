// Annotate on drag in Live Preview and Source mode. With the trigger held, a drag-select is ours:
// the editor never sees the pointer, so its own behaviour for the combination (Alt = column
// selection, Ctrl = extra cursor, Shift = extend, Control+click = context menu on macOS) never runs.
// The range is drawn as a decoration rather than a real selection, because moving the selection
// would make Live Preview reveal markup under the pointer and shift the text mid-drag.
// Inside a Live Preview table, which is rendered HTML rather than editor text, the range is drawn
// as a highlight and mapped to source offsets through the table's cells (selection mapping).
// On release, the Annotation is created and the comment box opens (see annotateRange).
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from '@codemirror/view';
import { annotateRange } from '../commands/annotate-selection';
import { isExcalidraw } from '../core';
import { caretFromPoint, isTableCellEditor, keepsOwnDrag, showDragRange, tableWidgetAt, widgetCells, type Caret } from '../guards';
import { notify } from '../notice';
import type { ReviewMarksSettings } from '../settings';
import { mapSelection } from '../selection-mapping/selection-mapping';
import { rangeBetween, swallow, trackPointer } from './track';
import { triggerHeld } from './trigger';

const TABLE_UNAVAILABLE = "annotate-on-drag isn't available in this table. Select the text and use Annotate selection.";

const setDragRange = StateEffect.define<{ from: number; to: number } | null>();
const dragMark = Decoration.mark({ class: 'rm-drag-sel' });

const dragField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, tr) {
		value = value.map(tr.changes);
		for (const e of tr.effects) {
			if (e.is(setDragRange)) {
				const r = e.value;
				value = r && r.to > r.from ? Decoration.set([dragMark.range(r.from, r.to)]) : Decoration.none;
			}
		}
		return value;
	},
	provide: (f) => EditorView.decorations.from(f),
});

class DragHandler {
	private end: (() => void) | null = null;

	constructor(
		private readonly view: EditorView,
		private readonly settings: () => ReviewMarksSettings,
		private readonly isMac: boolean,
	) {
		view.dom.addEventListener('pointerdown', this.onDown, true);
	}

	destroy(): void {
		this.view.dom.removeEventListener('pointerdown', this.onDown, true);
		this.end?.();
	}

	private readonly onDown = (e: PointerEvent): void => {
		const { view } = this;
		if (this.end || e.button !== 0 || e.pointerType === 'touch') return;
		if (!triggerHeld(e, this.settings().dragTrigger, this.isMac)) return;
		// Excalidraw drawings are left alone: the editor keeps the gesture.
		if (isExcalidraw(view.state.doc.toString())) return;
		const target = e.target as Node | null;
		if (!target || !view.contentDOM.contains(target)) return;
		const el = target.nodeType === Node.ELEMENT_NODE ? (target as Element) : target.parentElement;
		if (!el || keepsOwnDrag(el)) return;
		// A cell editor nested in a Live Preview table holds only the cell's text: it keeps the gesture,
		// as does the outer editor for a drag that starts in it.
		if (isTableCellEditor(view) || el.closest('.cm-editor') !== view.dom) return;

		const widget = tableWidgetAt(el);
		if (widget) {
			const anchor = caretFromPoint(el.ownerDocument, e.clientX, e.clientY);
			if (anchor === null) return;
			swallow(e);
			if (anchor === undefined) notify(TABLE_UNAVAILABLE);
			else this.trackInTable(e, widget, anchor);
			return;
		}
		swallow(e);
		this.trackInText(e, view.posAtCoords({ x: e.clientX, y: e.clientY }, false));
	};

	/** Follows the pointer over editor text, drawing the range from `anchor` as a decoration. */
	private trackInText(down: PointerEvent, anchor: number): void {
		const { view } = this;
		let head = anchor;
		const show = (range: { from: number; to: number } | null) => {
			if (view.dom.isConnected) view.dispatch({ effects: setDragRange.of(range) });
		};
		this.track(down, {
			move: (e) => {
				head = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
				show({ from: Math.min(anchor, head), to: Math.max(anchor, head) });
			},
			finish: (create) => {
				show(null);
				if (create && head !== anchor && view.dom.isConnected) {
					annotateRange(view, Math.min(anchor, head), Math.max(anchor, head), this.settings());
				}
			},
		});
	}

	/**
	 * Follows the pointer over a Live Preview table, drawing the range from `anchor` as a
	 * highlight, then maps it to source offsets through the table's cells.
	 */
	private trackInTable(down: PointerEvent, widget: HTMLElement, anchor: Caret): void {
		const { view } = this;
		const doc = widget.ownerDocument;
		const win = doc.defaultView ?? window;
		win.getSelection()?.removeAllRanges();
		let range = rangeBetween(doc, anchor, anchor);
		this.track(down, {
			move: (e) => {
				const head = caretFromPoint(doc, e.clientX, e.clientY);
				if (!head) return;
				range = rangeBetween(doc, anchor, head);
				showDragRange(win, range);
			},
			finish: (create) => {
				showDragRange(win, null);
				if (!create || range.collapsed || !view.dom.isConnected) return;
				const cells = widgetCells(view, widget);
				if (!cells) {
					notify(TABLE_UNAVAILABLE);
					return;
				}
				const text = view.state.doc.toString();
				const mapped = mapSelection(text, cells, range);
				if ('failure' in mapped) notify(mapped.message);
				else annotateRange(view, mapped.from, mapped.to, this.settings());
			},
		});
	}

	private track(down: PointerEvent, handlers: { move(e: PointerEvent): void; finish(create: boolean): void }): void {
		const win = this.view.dom.ownerDocument.defaultView ?? window;
		this.end = trackPointer(win, down, { ...handlers, settled: () => (this.end = null) });
		try {
			this.view.contentDOM.setPointerCapture(down.pointerId);
		} catch {
			// Not capturable (the pointer is already gone): the window listeners still see it.
		}
	}
}

/** The editor extension. `isMac` is `Platform.isMacOS`. */
export function editorDrag(settings: () => ReviewMarksSettings, isMac: boolean): Extension {
	return [dragField, ViewPlugin.define((view) => new DragHandler(view, settings, isMac))];
}
