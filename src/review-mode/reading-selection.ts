// A Review Mode release in Reading view, as plain inputs for releaseDecision: the native
// selection's ranges over the rendered sections, mapped to the note only if the release isn't
// ignored first. No Obsidian imports; tested with a fake DOM.
import { READING_UNAVAILABLE, readingRange, type RenderedSection } from '../drag/reading-target';
import type { Release } from './release';

/** The release of LF note `text`, rendered as `sections`, with the selection's `ranges`. */
export function readingRelease(
	text: string,
	sections: readonly RenderedSection[],
	ranges: readonly Range[],
	down: Release['down'],
	commentBoxOpen: boolean,
): Release {
	const [range] = ranges;
	return {
		text,
		// Only their count and emptiness matter: `map` gives the note range.
		ranges: ranges.map((r) => ({ from: 0, to: r.collapsed ? 0 : 1 })),
		commentBoxOpen,
		down,
		map: () => {
			if (!range || sections.length === 0) return { failure: 'not-found', message: READING_UNAVAILABLE };
			return readingRange(text, sections, range);
		},
	};
}
