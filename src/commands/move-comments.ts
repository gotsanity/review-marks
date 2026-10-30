// "Move comments to end of note" and "Move comments to end of sections": the explicit way to
// convert an existing note, since the placement setting only affects new Annotations.
import type { Editor, Plugin } from 'obsidian';
import { planMoveComments, type MovePlan, type Placement } from '../core';
import { changeTargetFor } from '../apply/editor-target';
import { notify } from '../notice';
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
 * lines change, so the cursor and the scroll position stay where they were.
 */
export async function moveComments(editor: Editor, placement: Placement): Promise<MovePlan> {
	const plan = await changeTargetFor(editor).apply((doc) => planMoveComments(doc, placement));
	// planMoveComments never refuses.
	const moved = plan as MovePlan;
	notify(moveMessage(moved, placement));
	return moved;
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
