// What a drag in Reading view would annotate: the DOM range mapped to source offsets (selection
// mapping), then checked the way creating it would be, so a refused drag never leaves Reading
// view. No Obsidian imports; tested with a fake DOM.
import { isRefusal, lineStarts, parse, planCreate } from '../core';
import { codeLines } from '../core/sections';
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

/** Whether `offset` lies strictly inside a fenced code block or an inline code span of `text`. */
function insideCode(text: string, offset: number, starts: readonly number[], fenced: readonly boolean[]): boolean {
	let line = 0;
	while (line + 1 < starts.length && (starts[line + 1] ?? Infinity) <= offset) line++;
	if (fenced[line]) return true;
	const start = starts[line] ?? 0;
	const next = starts[line + 1];
	const lineText = text.slice(start, next === undefined ? text.length : next - 1);
	for (const m of lineText.matchAll(/(`+)(?!`)([^\n]*?[^`\n])\1(?!`)/g)) {
		const from = start + m.index;
		if (offset > from && offset < from + m[0].length) return true;
	}
	return false;
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

	const fenced = codeLines(text.split('\n'));
	if (insideCode(text, mapped.from, starts, fenced) || insideCode(text, mapped.to, starts, fenced)) {
		return { message: "a Target can't start or end inside code." };
	}
	const plan = planCreate(parse(text), { from: mapped.from, to: mapped.to, comment: '', placement: 'end-of-note' });
	if (isRefusal(plan)) return { message: plan.message };
	return mapped;
}
