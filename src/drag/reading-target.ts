// What a drag in Reading view would annotate: the DOM range mapped to source offsets (selection
// mapping), then checked the way creating it would be, so a refused drag never leaves Reading
// view. No Obsidian imports; tested with a fake DOM.
import { isRefusal, lineStarts, parse, planCreate } from '../core';
import { mapSelection, type RenderedSlice, type SourceRange } from '../selection-mapping/selection-mapping';

/** A rendered Reading view section and the source lines `getSectionInfo` gives for it. */
export interface RenderedSection {
	el: HTMLElement;
	lineStart: number;
	lineEnd: number;
}

/** Why the drag can't be annotated. `message` completes "Review Marks: …". */
export interface DragRefusal {
	message: string;
}

/**
 * The source range of LF note `text` that a drag over `range` would annotate, or why it can't be.
 * `sections` are the rendered sections in document order.
 */
export function readingTarget(text: string, sections: readonly RenderedSection[], range: Range): SourceRange | DragRefusal {
	const starts = lineStarts(text);
	const slices: RenderedSlice[] = sections.map((s) => {
		const next = starts[s.lineEnd + 1];
		return { el: s.el, from: starts[s.lineStart] ?? text.length, to: next === undefined ? text.length : next - 1 };
	});
	const mapped = mapSelection(text, slices, range);
	if ('failure' in mapped) return { message: mapped.message };
	const plan = planCreate(parse(text), { from: mapped.from, to: mapped.to, comment: '', placement: 'end-of-note' });
	if (isRefusal(plan)) return { message: plan.message };
	return mapped;
}
