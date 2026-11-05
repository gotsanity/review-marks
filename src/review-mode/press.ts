// The press a Review Mode release is judged by, shared by the editor and Reading view listeners.
import { isCommentBoxOpen } from '../comment-box/comment-box';
import { triggerHeld, type DragTrigger } from '../drag/trigger';
import { isPrimaryPress } from '../pointer';
import type { Release } from './release';

/** Where the pointer went down, and whether a comment box was open then. */
export interface Press {
	where: Release['down'];
	/** A box open when the pointer went down: the press closes it, but the gesture is still ignored. */
	boxOpen: boolean;
}

/** Does Review Mode look at `e`? Not with the drag trigger held: that gesture is annotate-on-drag's. */
export function isReviewPress(e: PointerEvent, trigger: DragTrigger, isMac: boolean): boolean {
	return isPrimaryPress(e) && !triggerHeld(e, trigger, isMac);
}

/** A press at `where`, made now. */
export function pressAt(where: Release['down']): Press {
	return { where, boxOpen: isCommentBoxOpen() };
}

/** Was a comment box open at `press`, or is one open now? */
export function boxOpenSince(press: Press | null): boolean {
	return (press?.boxOpen ?? false) || isCommentBoxOpen();
}
