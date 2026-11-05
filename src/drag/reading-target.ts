// What a drag in Reading view would annotate: the DOM range mapped to source offsets (selection
// mapping), then checked the way creating it would be, so a refused drag never leaves Reading
// view. No Obsidian imports; tested with a fake DOM.
import { isRefusal, lineStarts, parse, planCreate } from '../core';
import { mapSelection, type MappingFailure, type RenderedSlice, type SourceRange } from '../selection-mapping/selection-mapping';

/** A rendered Reading view section and the source lines `getSectionInfo` gives for it. */
export interface RenderedSection {
	el: HTMLElement;
	lineStart: number;
	lineEnd: number;
}

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

/** `range` mapped to source offsets of LF note `text`, without the check creating it makes. */
export function readingRange(text: string, sections: readonly RenderedSection[], range: Range): SourceRange | MappingFailure {
	const starts = lineStarts(text);
	const slices: RenderedSlice[] = sections.map((s) => {
		const next = starts[s.lineEnd + 1];
		return { el: s.el, from: starts[s.lineStart] ?? text.length, to: next === undefined ? text.length : next - 1 };
	});
	return mapSelection(text, slices, range);
}

/** The notice when Reading view can't be mapped at all (a guard failed). Completes "Review Marks: …". */
export const READING_UNAVAILABLE = "can't annotate in Reading view here. Switch to Live Preview to annotate.";
