// Reading pointer events the same way in the editor and Reading view, for annotate-on-drag and
// Review Mode, in any Obsidian window.

/**
 * The element a pointer event's target is, or holds it for a text node. Checks `nodeType`, not
 * `instanceof`, which fails for targets in a popout window.
 */
export function elementOf(target: EventTarget | null): Element | null {
	const node = target as Node | null;
	if (typeof node?.nodeType !== 'number') return null;
	return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

/** Is `e` the primary button of a mouse or pen? Touch keeps its own gestures. */
export function isPrimaryPress(e: PointerEvent): boolean {
	return e.button === 0 && e.pointerType !== 'touch';
}
