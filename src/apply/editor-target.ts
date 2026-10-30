import { isolateHistory } from '@codemirror/commands';
import { ChangeSet } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Editor } from 'obsidian';
import { isRefusal, parse, type Change, type Refusal } from '../core';
import { editorViewOf, scrollSnapshotThrough } from '../guards';
import type { ChangeTarget, PlannedEdit, Planner } from './change-target';

/**
 * Writes changes to an open editor as one transaction that the history keeps as its own undo
 * step, never merged with typing before or after it. The view does not scroll, even when the
 * changes are above it. If `caret` is given, the cursor moves there in the same transaction.
 */
export function dispatchAsOneStep(view: EditorView, changes: readonly Change[], caret?: number): void {
	const set = ChangeSet.of([...changes], view.state.doc.length);
	const scroll = scrollSnapshotThrough(view, set);
	view.dispatch({
		changes: set,
		selection: caret === undefined ? undefined : { anchor: caret },
		effects: scroll ? [scroll] : [],
		annotations: isolateHistory.of('full'),
		userEvent: 'input.review-marks',
	});
}

/** Change application for a note open in an editor. */
export class EditorChangeTarget implements ChangeTarget {
	constructor(private readonly view: EditorView) {}

	apply<P extends PlannedEdit>(planner: Planner<P>): Promise<P | Refusal> {
		const plan = planner(parse(this.view.state.doc.toString()));
		if (!isRefusal(plan) && (plan.changes.length > 0 || plan.caret !== undefined)) {
			dispatchAsOneStep(this.view, plan.changes, plan.caret);
		}
		return Promise.resolve(plan);
	}
}

/**
 * Change application through Obsidian's own `Editor` API, for an editor without a CodeMirror view
 * (see `editorViewOf`): one `editor.transaction`. The scroll position is not kept.
 */
class PlainEditorChangeTarget implements ChangeTarget {
	constructor(private readonly editor: Editor) {}

	apply<P extends PlannedEdit>(planner: Planner<P>): Promise<P | Refusal> {
		const { editor } = this;
		const plan = planner(parse(editor.getValue()));
		if (!isRefusal(plan) && plan.changes.length > 0) {
			editor.transaction({
				changes: plan.changes.map((c) => ({ from: editor.offsetToPos(c.from), to: editor.offsetToPos(c.to), text: c.insert })),
				selection: plan.caret === undefined ? undefined : { from: editor.offsetToPos(plan.caret) },
			});
		}
		return Promise.resolve(plan);
	}
}

/** Change application for the note in `editor`: its CodeMirror view, or the plain Editor API without one. */
export function changeTargetFor(editor: Editor): ChangeTarget {
	const view = editorViewOf(editor);
	return view ? new EditorChangeTarget(view) : new PlainEditorChangeTarget(editor);
}
