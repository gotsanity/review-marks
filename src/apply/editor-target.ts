import { isolateHistory } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { isRefusal, parse, type Change, type Refusal } from '../core';
import { keepScroll } from '../guards';
import type { ChangeTarget, PlannedEdit, Planner } from './change-target';

/**
 * Writes changes to an open editor as one transaction that the history keeps as its own undo
 * step, never merged with typing before or after it. The view does not scroll. If `caret` is
 * given, the cursor moves there in the same transaction.
 */
export function dispatchAsOneStep(view: EditorView, changes: readonly Change[], caret?: number): void {
	keepScroll(view, () =>
		view.dispatch({
			changes: [...changes],
			selection: caret === undefined ? undefined : { anchor: caret },
			annotations: isolateHistory.of('full'),
			userEvent: 'input.review-marks',
		}),
	);
}

/** Change application for a note open in an editor. */
export class EditorChangeTarget implements ChangeTarget {
	constructor(private readonly view: EditorView) {}

	apply<P extends PlannedEdit>(planner: Planner<P>): Promise<P | Refusal> {
		const plan = planner(parse(this.view.state.doc.toString()));
		if (!isRefusal(plan)) dispatchAsOneStep(this.view, plan.changes, plan.caret);
		return Promise.resolve(plan);
	}
}
