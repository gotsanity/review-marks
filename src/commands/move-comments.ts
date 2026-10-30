// "Move comments to end of note" and "Move comments to end of sections": the explicit way to
// convert an existing note, since the placement setting only affects new Annotations.
import { isolateHistory } from '@codemirror/commands';
import { ChangeSet } from '@codemirror/state';
import { Notice, type Editor, type Plugin } from 'obsidian';
import { parse, planMoveComments, type MovePlan, type Placement } from '../core';
import { editorViewOf, scrollSnapshotThrough } from '../guards';
import { whenAnnotatable } from './annotatable';

const WHERE: Record<Placement, string> = {
	'end-of-note': 'the end of the note',
	'end-of-section': 'the end of their sections',
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The notice after a move, without the "Review Marks: " prefix. */
export function moveMessage(plan: MovePlan, placement: Placement): string {
	const done =
		plan.moved === 0
			? 'no comments to move.'
			: plan.changes.length === 0
				? `the comments are already at ${WHERE[placement]}.`
				: `moved ${plural(plan.moved, 'comment')} to ${WHERE[placement]}.`;
	const orphans =
		plan.orphans === 0
			? ''
			: ` Left ${plural(plan.orphans, 'comment')} without a marker in place.`;
	return done + orphans;
}

/**
 * Moves every comment of the note in the editor to `placement` as one undo step. Only the moved
 * lines change, so the cursor stays where it was, and the scroll position rides along in the
 * same transaction.
 */
export function moveComments(editor: Editor, placement: Placement): MovePlan {
	const view = editorViewOf(editor);
	const text = view ? view.state.doc.toString() : editor.getValue();
	const plan = planMoveComments(parse(text), placement);
	if (plan.changes.length > 0) {
		if (view) {
			const changes = ChangeSet.of(plan.changes, view.state.doc.length);
			const scroll = scrollSnapshotThrough(view, changes);
			view.dispatch({
				changes,
				effects: scroll ? [scroll] : [],
				annotations: isolateHistory.of('full'),
				userEvent: 'input.review-marks',
			});
		} else {
			editor.transaction({
				changes: plan.changes.map((c) => ({ from: editor.offsetToPos(c.from), to: editor.offsetToPos(c.to), text: c.insert })),
			});
		}
	}
	new Notice(`Review Marks: ${moveMessage(plan, placement)}`);
	return plan;
}

/** Registers both commands. No default hotkeys, per the plugin guidelines. */
export function registerMoveComments(plugin: Plugin): void {
	plugin.addCommand({
		id: 'move-comments-to-end-of-note',
		name: 'Move comments to end of note',
		editorCheckCallback: whenAnnotatable((editor) => void moveComments(editor, 'end-of-note')),
	});
	plugin.addCommand({
		id: 'move-comments-to-end-of-sections',
		name: 'Move comments to end of sections',
		editorCheckCallback: whenAnnotatable((editor) => void moveComments(editor, 'end-of-section')),
	});
}
