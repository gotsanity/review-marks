// The pointer-tracking loop of an annotate-on-drag gesture, shared by the editor and Reading view.
// With the trigger held, the gesture is ours from pointerdown to release: every pointer, mouse and
// click event of it is swallowed so the editor's own behaviour for the combination never runs.
import type { Caret } from '../guards';

/** Mouse events that follow the pointer events of a gesture and must not reach the page. */
const COMPAT_EVENTS = ['mousedown', 'mousemove', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu'] as const;

/** Stops an event of the gesture from reaching anything else. */
export function swallow(e: Event): void {
	e.preventDefault();
	e.stopPropagation();
	e.stopImmediatePropagation();
}

export interface GestureHandlers {
	/** The pointer moved, or was released (`pointerup`): extend the range to it. */
	move(e: PointerEvent): void;
	/** The gesture ended: `create` on a release, false on Escape or a cancelled pointer. */
	finish(create: boolean): void;
	/** After the events that trail the release have been swallowed too. */
	settled?(): void;
}

/**
 * Follows the pointer of `down` (already swallowed by the caller) in `win` until it is released,
 * cancelled or Escape is pressed. Returns a function that ends the gesture as cancelled.
 */
export function trackPointer(win: Window, down: PointerEvent, handlers: GestureHandlers): () => void {
	let done = false;
	const move = (e: PointerEvent) => {
		if (e.pointerId !== down.pointerId) return;
		swallow(e);
		handlers.move(e);
	};
	const up = (e: PointerEvent) => {
		if (e.pointerId !== down.pointerId) return;
		swallow(e);
		if (e.type === 'pointerup') handlers.move(e);
		end(e.type === 'pointerup');
	};
	const escape = (e: KeyboardEvent) => {
		if (e.key !== 'Escape') return;
		swallow(e);
		end(false);
	};
	const end = (create: boolean) => {
		if (done) return;
		done = true;
		win.removeEventListener('pointermove', move, true);
		win.removeEventListener('pointerup', up, true);
		win.removeEventListener('pointercancel', up, true);
		win.removeEventListener('keydown', escape, true);
		// The mouseup and click that follow the pointerup still belong to the gesture.
		win.setTimeout(() => {
			for (const type of COMPAT_EVENTS) win.removeEventListener(type, swallow, true);
			handlers.settled?.();
		}, 0);
		handlers.finish(create);
	};

	win.addEventListener('pointermove', move, true);
	win.addEventListener('pointerup', up, true);
	win.addEventListener('pointercancel', up, true);
	win.addEventListener('keydown', escape, true);
	for (const type of COMPAT_EVENTS) win.addEventListener(type, swallow, true);
	return () => end(false);
}

/** A Range from `a` to `b`, whichever comes first in the document. */
export function rangeBetween(doc: Document, a: Caret, b: Caret): Range {
	const range = doc.createRange();
	range.setStart(a.node, a.offset);
	range.setEnd(a.node, a.offset);
	const head = doc.createRange();
	head.setStart(b.node, b.offset);
	if (head.compareBoundaryPoints(Range.START_TO_START, range) < 0) range.setStart(b.node, b.offset);
	else range.setEnd(b.node, b.offset);
	return range;
}
