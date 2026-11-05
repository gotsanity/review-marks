// What a drag in Reading view would annotate: the DOM range mapped to source offsets (readingRange),
// then checked the way creating it would be, so a refused drag never leaves Reading view.
// No Obsidian imports; tested with a fake DOM.
import { isRefusal, parse, planCreate } from '../core';
import { readingRange, type RenderedSection } from '../reading-annotate/reading-range';
import type { MappingFailure, SourceRange } from '../selection-mapping/selection-mapping';

/**
 * Why the selection can't be annotated: a mapping failure (`outside-note` when it lies entirely in
 * areas mapping skips, `not-found`) or `refused` by the check creating it makes. `message`
 * completes "Review Marks: …".
 */
export interface DragRefusal {
	failure: MappingFailure['failure'] | 'refused';
	message: string;
}

/**
 * The source range of LF note `text` that a drag over `range` would annotate, or why it can't be.
 * `sections` are the rendered sections in document order.
 */
export function readingTarget(text: string, sections: readonly RenderedSection[], range: Range): SourceRange | DragRefusal {
	const mapped = readingRange(text, sections, range);
	if ('failure' in mapped) return mapped;
	const plan = planCreate(parse(text), { from: mapped.from, to: mapped.to, comment: '', placement: 'end-of-note' });
	if (isRefusal(plan)) return { failure: 'refused', message: plan.message };
	return mapped;
}
