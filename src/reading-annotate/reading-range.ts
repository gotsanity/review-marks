// A selection over Reading view mapped to the note: the DOM range over the rendered sections
// mapped to source offsets (selection mapping). Shared by annotate-on-drag and Review Mode.
// No Obsidian imports; tested with a fake DOM.
import { lineStarts } from '../core';
import { mapSelection, type MappingFailure, type RenderedSlice, type SourceRange } from '../selection-mapping/selection-mapping';

/** A rendered Reading view section and the source lines `getSectionInfo` gives for it. */
export interface RenderedSection {
	el: HTMLElement;
	lineStart: number;
	lineEnd: number;
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
