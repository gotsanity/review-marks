// "Remove annotation at cursor": braces, marker and definition go, the Target text stays, as
// one undo step.
import type { Editor, Plugin } from 'obsidian';
import { notify } from '../notice';
import { annotationAt, isRefusal, parse, planRemove } from '../core';
import { EditorChangeTarget } from '../apply/editor-target';
import { editorViewOf } from '../guards';

/** Removes the Annotation with this ID from the note in the editor. */
export async function removeAnnotation(editor: Editor, id: string): Promise<void> {
	const view = editorViewOf(editor);
	if (view) {
		const plan = await new EditorChangeTarget(view).apply((doc) => planRemove(doc, id));
		if (isRefusal(plan)) notify(plan.message);
		return;
	}
	const plan = planRemove(parse(editor.getValue()), id);
	if (isRefusal(plan)) notify(plan.message);
	else editor.transaction({ changes: plan.changes.map((c) => ({ from: editor.offsetToPos(c.from), to: editor.offsetToPos(c.to), text: c.insert })) });
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
		editorCallback: (editor) => {
			const id = annotationIdAtCursor(editor);
			if (id) void removeAnnotation(editor, id);
			else notify('there is no annotation at the cursor.');
		},
	});
}
