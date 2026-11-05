// Review Mode's release decision: when the Reviewer releases the pointer, does the selection start
// an Annotation, get ignored silently, or get refused with a notice? Pure, from plain inputs, so the
// editor, Reading view and table cell listeners stay thin around it.
import { isRefusal, parse, planCreate } from '../core';
import type { MappingFailure, SourceRange } from '../selection-mapping/selection-mapping';

/** How many ranges a selection has, and whether its one range is empty. */
export type SelectionShape = 'empty' | 'single' | 'multiple';

/** The shape of a selection's ranges. A DOM Range is `empty` when it's collapsed. */
export function selectionShape(ranges: readonly { empty: boolean }[]): SelectionShape {
	if (ranges.length > 1) return 'multiple';
	return ranges[0] && !ranges[0].empty ? 'single' : 'empty';
}

/**
 * The selection released over: its ranges as note offsets (in the editor), or, for a selection
 * over rendered text or in a table cell editor, its shape and `map`, which gives its note range.
 */
export type ReleasedSelection =
	| { ranges: readonly SourceRange[] }
	| {
			shape: SelectionShape;
			/** Called only for a release that isn't ignored first. */
			map: () => SourceRange | MappingFailure;
	  };

export interface Release {
	/** The note's text, LF. */
	text: string;
	selection: ReleasedSelection;
	commentBoxOpen: boolean;
	/**
	 * Where the pointer went down: in the note's content, on something that keeps its own drag
	 * (`keepsOwnDrag`), elsewhere, or `null` if no pointerdown was seen for this release.
	 */
	down: 'content' | 'keeps-own' | 'elsewhere' | null;
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

/** Why a press that didn't go down in the note's content is ignored. */
const IGNORED_PRESS = { elsewhere: 'outside-content', 'keeps-own': 'keeps-own' } as const;

export function releaseDecision(release: Release): ReleaseDecision {
	const { down, selection } = release;
	if (down === null) return { ignore: 'not-pointer' };
	if (down !== 'content') return { ignore: IGNORED_PRESS[down] };
	if (release.commentBoxOpen) return { ignore: 'comment-box-open' };
	const shape = 'shape' in selection ? selection.shape : selectionShape(selection.ranges.map((r) => ({ empty: r.from === r.to })));
	if (shape === 'multiple') return { ignore: 'multiple-ranges' };
	if (shape === 'empty') return { ignore: 'empty' };

	const mapped = 'map' in selection ? selection.map() : ordered(selection.ranges[0] as SourceRange);
	if ('failure' in mapped) return mapped.failure === 'outside-note' ? { ignore: 'outside-note' } : { refuse: mapped.message };
	// The check creating it makes; the placement doesn't change whether a range can be annotated.
	const plan = planCreate(parse(release.text), { ...mapped, comment: '', placement: 'end-of-note' });
	if (isRefusal(plan)) return plan.refusal === 'excalidraw' ? { ignore: 'excalidraw' } : { refuse: plan.message };
	return { start: mapped };
}

const ordered = ({ from, to }: SourceRange): SourceRange => ({ from: Math.min(from, to), to: Math.max(from, to) });
