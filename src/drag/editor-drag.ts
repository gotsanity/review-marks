// Annotate on drag in Live Preview and Source mode. With the trigger held, a drag-select is ours:
// the editor never sees the pointer, so its own behaviour for the combination (Alt = column
// selection, Ctrl = extra cursor, Shift = extend, Control+click = context menu on macOS) never runs.
// The range is drawn as a decoration rather than a real selection, because moving the selection
// would make Live Preview reveal markup under the pointer and shift the text mid-drag.
// On release, the Annotation is created and the comment box opens (see annotateRange).
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet } from '@codemirror/view';
import { annotateRange } from '../commands/annotate-selection';
import { isExcalidraw } from '../core';
import type { ReviewMarksSettings } from '../settings';
import { triggerHeld } from './trigger';

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

// Drags starting here keep the editor's own behaviour: Live Preview tables and embeds are
// rendered widgets, not editor text, and the badge belongs to an existing Annotation.
const NOT_OURS = '.cm-table-widget, .cm-embed-block, .markdown-embed, .rm-badge';

/** Mouse events that follow the pointer events of a gesture and must not reach the editor. */
const COMPAT_EVENTS = ['mousedown', 'mousemove', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu'] as const;

function swallow(e: Event): void {
	e.preventDefault();
	e.stopPropagation();
	e.stopImmediatePropagation();
}

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
		if (el?.closest(NOT_OURS)) return;
		// A cell editor nested in a Live Preview table: tables are handled elsewhere.
		if (view.dom.parentElement?.closest('.cm-table-widget')) return;

		swallow(e);
		this.track(e, view.posAtCoords({ x: e.clientX, y: e.clientY }, false));
	};

	/** Follows the pointer until it is released, drawing the range from `anchor`. */
	private track(down: PointerEvent, anchor: number): void {
		const { view } = this;
		const win = view.dom.ownerDocument.defaultView ?? window;
		let head = anchor;
		const show = (range: { from: number; to: number } | null) => {
			if (view.dom.isConnected) view.dispatch({ effects: setDragRange.of(range) });
		};

		const move = (e: PointerEvent) => {
			if (e.pointerId !== down.pointerId) return;
			swallow(e);
			head = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
			show({ from: Math.min(anchor, head), to: Math.max(anchor, head) });
		};
		const up = (e: PointerEvent) => {
			if (e.pointerId !== down.pointerId) return;
			swallow(e);
			if (e.type === 'pointerup') head = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
			finish(e.type === 'pointerup');
		};
		const escape = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			swallow(e);
			finish(false);
		};

		const finish = (create: boolean) => {
			win.removeEventListener('pointermove', move, true);
			win.removeEventListener('pointerup', up, true);
			win.removeEventListener('pointercancel', up, true);
			win.removeEventListener('keydown', escape, true);
			// The mouseup and click that follow the pointerup still belong to the gesture.
			win.setTimeout(() => {
				for (const type of COMPAT_EVENTS) win.removeEventListener(type, swallow, true);
				this.end = null;
			}, 0);
			show(null);
			if (create && head !== anchor && view.dom.isConnected) {
				annotateRange(view, Math.min(anchor, head), Math.max(anchor, head), this.settings());
			}
		};

		win.addEventListener('pointermove', move, true);
		win.addEventListener('pointerup', up, true);
		win.addEventListener('pointercancel', up, true);
		win.addEventListener('keydown', escape, true);
		for (const type of COMPAT_EVENTS) win.addEventListener(type, swallow, true);
		this.end = () => finish(false);
		try {
			view.contentDOM.setPointerCapture(down.pointerId);
		} catch {
			// Not capturable (the pointer is already gone): the window listeners still see it.
		}
	}
}

/** The editor extension. `isMac` is `Platform.isMacOS`. */
export function editorDrag(settings: () => ReviewMarksSettings, isMac: boolean): Extension {
	return [dragField, ViewPlugin.define((view) => new DragHandler(view, settings, isMac))];
}
