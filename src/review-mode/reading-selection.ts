// A Review Mode release in Reading view, as plain inputs for releaseDecision: the shape of the
// native selection's ranges, and their mapping over the rendered sections to the note, done only
// if the release isn't ignored first. No Obsidian imports; tested with a fake DOM.
import { READING_UNAVAILABLE, readingRange, type RenderedSection } from '../reading-annotate/reading-range';
import { selectionShape, type Release } from './release';

/** The release of LF note `text`, rendered as `sections`, with the selection's `ranges`. */
export function readingSelectionRelease(
	text: string,
	sections: readonly RenderedSection[],
	ranges: readonly Range[],
	down: Release['down'],
	commentBoxOpen: boolean,
): Release {
	const [range] = ranges;
	return {
		text,
		selection: {
			shape: selectionShape(ranges.map((r) => ({ empty: r.collapsed }))),
			map: () => {
				if (!range || sections.length === 0) return { failure: 'not-found', message: READING_UNAVAILABLE };
				return readingRange(text, sections, range);
			},
		},
		commentBoxOpen,
		down,
	};
}
