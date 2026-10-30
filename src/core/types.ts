// The annotation core's vocabulary. Pure data: no Obsidian or editor imports anywhere in src/core.
// All offsets are UTF-16 indexes into LF-normalized note text.

/** A `[^rN]: comment` footnote definition, with its 4-space continuation lines. */
export interface Definition {
	id: string;
	/** Start of the `[^rN]:` line. */
	from: number;
	/** End of the last continuation line, before its line break. */
	to: number;
	/** The Comment, continuation indents removed. */
	comment: string;
}

/** A `{target}[^rN]` span in the note, with its definition when there is one. */
export interface Annotation {
	id: string;
	/** Offset of `{`. */
	open: number;
	/** Offset of `}`. The Target is `open + 1 .. close`. */
	close: number;
	/** Offset just after `[^rN]`. */
	markerEnd: number;
	definition: Definition | null;
}

export interface AnnotationDoc {
	text: string;
	/** Annotations with a marker, in order of their `{`. */
	annotations: Annotation[];
	/** Review definitions whose marker is missing. */
	orphanDefinitions: Definition[];
}

/** One replacement in the text, in offsets of the text before any change of the same plan. */
export interface Change {
	from: number;
	to: number;
	insert: string;
}

/** Why a planner made no change. `message` is user-facing and completes "Review Marks: …". */
export interface Refusal {
	refusal: RefusalReason;
	message: string;
}

export type RefusalReason =
	| 'empty-selection'
	| 'crosses-blocks'
	| 'in-definition'
	| 'overlaps-annotation'
	| 'unbalanced-braces'
	| 'not-found'
	| 'empty-comment';

/** Where the definition of a new Annotation goes. */
export type Placement = 'end-of-section' | 'end-of-note';

export function isRefusal(x: unknown): x is Refusal {
	return typeof x === 'object' && x !== null && 'refusal' in x;
}
