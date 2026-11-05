// Review Mode's release decision: when the Reviewer releases the pointer, does the selection start
// an Annotation, get ignored silently, or get refused with a notice? Pure, from plain inputs, so the
// editor, Reading view and table cell listeners stay thin around it.
import { isRefusal, parse, planCreate } from '../core';
import type { MappingFailure, SourceRange } from '../selection-mapping/selection-mapping';

export interface Release {
	/** The note's text, LF. */
	text: string;
	/**
	 * The selection's ranges. In the editor they are note offsets. For a selection over rendered
	 * text (Reading view, a table cell) only their count and emptiness matter: `map` gives the
	 * note range.
	 */
	ranges: readonly SourceRange[];
	commentBoxOpen: boolean;
	/**
	 * Where the pointer went down: in the note's content, on something that keeps its own drag
	 * (`keepsOwnDrag`), elsewhere, or `null` if no pointerdown was seen for this release.
	 */
	down: 'content' | 'keeps-own' | 'elsewhere' | null;
	/** Maps a selection over rendered text to the note. Called only for a release that isn't ignored first. */
	map?: () => SourceRange | MappingFailure;
}

/** Why a release is ignored without a word. */
export type IgnoreReason =
	| 'not-pointer'
	| 'outside-content'
	| 'keeps-own'
	| 'comment-box-open'
	| 'multiple-ranges'
	| 'empty'
	| 'outside-note'
	| 'excalidraw';

/** Start an Annotation on `start`, ignore the release, or refuse it with `refuse` (completes "Review Marks: …"). */
export type ReleaseDecision = { start: SourceRange } | { ignore: IgnoreReason } | { refuse: string };

const DOWN_IGNORED = { elsewhere: 'outside-content', 'keeps-own': 'keeps-own' } as const;

export function releaseDecision(release: Release): ReleaseDecision {
	const { down, ranges } = release;
	if (down === null) return { ignore: 'not-pointer' };
	if (down !== 'content') return { ignore: DOWN_IGNORED[down] };
	if (release.commentBoxOpen) return { ignore: 'comment-box-open' };
	if (ranges.length > 1) return { ignore: 'multiple-ranges' };
	const [range] = ranges;
	if (!range || range.from === range.to) return { ignore: 'empty' };

	const mapped = release.map ? release.map() : { from: Math.min(range.from, range.to), to: Math.max(range.from, range.to) };
	if ('failure' in mapped) return mapped.failure === 'outside-note' ? { ignore: 'outside-note' } : { refuse: mapped.message };
	// The check creating it makes; the placement doesn't change whether a range can be annotated.
	const plan = planCreate(parse(release.text), { ...mapped, comment: '', placement: 'end-of-note' });
	if (isRefusal(plan)) return plan.refusal === 'excalidraw' ? { ignore: 'excalidraw' } : { refuse: plan.message };
	return { start: mapped };
}
