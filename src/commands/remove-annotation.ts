// "Remove annotation at cursor": braces, marker and definition go, the Target text stays, as
// one undo step.
import type { Editor, Plugin } from 'obsidian';
import { notify } from '../notice';
import { annotationAt, isRefusal, parse, planRemove } from '../core';
import { changeTargetFor } from '../apply/editor-target';
import { whenAnnotatable } from './annotatable';

/** Removes the Annotation with this ID from the note in the editor. */
export async function removeAnnotation(editor: Editor, id: string): Promise<void> {
	const plan = await changeTargetFor(editor).apply((doc) => planRemove(doc, id));
	if (isRefusal(plan)) notify(plan.message);
}

/** The ID of the Annotation at the editor's cursor: on its Target, marker or definition. */
export function annotationIdAtCursor(editor: Editor): string | null {
	return annotationAt(parse(editor.getValue()), editor.posToOffset(editor.getCursor('head')))?.id ?? null;
}

/** Registers the command. No default hotkey, per the plugin guidelines. */
export function registerRemoveAnnotation(plugin: Plugin): void {
	plugin.addCommand({
		id: 'remove-annotation-at-cursor',
		name: 'Remove annotation at cursor',
		editorCheckCallback: whenAnnotatable((editor) => {
			const id = annotationIdAtCursor(editor);
			if (id) void removeAnnotation(editor, id);
			else notify('there is no annotation at the cursor.');
		}),
	});
}
