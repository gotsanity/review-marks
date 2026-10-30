// Change application: one interface for "plan against the current text, then write it as one
// step", implemented for an open editor (editor-target.ts) and a closed file (file-target.ts).
import type { AnnotationDoc, Change, Refusal } from '../core';

/** What a planner returns. `caret`, if set, is where the editor cursor goes after the edit. */
export interface PlannedEdit {
	changes: Change[];
	caret?: number;
}

/** Plans against the note as it is when the change is applied. */
export type Planner<P extends PlannedEdit> = (doc: AnnotationDoc) => P | Refusal;

export interface ChangeTarget {
	/**
	 * Parses the current text, runs the planner and writes its changes as one undo step.
	 * Resolves to the plan, or to the refusal, in which case nothing changed.
	 */
	apply<P extends PlannedEdit>(planner: Planner<P>): Promise<P | Refusal>;
}
