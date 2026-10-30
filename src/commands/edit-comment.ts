// "Edit comment": opens the inline comment box on an existing Annotation. Saving rewrites its
// definition as one undo step; Esc closes the box with no change; an empty save is refused.
import type { Editor, Plugin } from 'obsidian';
import { notify } from '../notice';
import { isRefusal, parse, planEditComment } from '../core';
import { EditorChangeTarget } from '../apply/editor-target';
import { openCommentBox } from '../comment-box/comment-box';
import { editorViewOf, keepScroll } from '../guards';
import { annotationIdAtCursor } from './remove-annotation';
import type { ReviewMarksSettings } from '../settings';

const EMPTY_MESSAGE = 'a comment cannot be empty. To delete it, use Remove annotation.';

/** Opens the comment box for the Annotation with this ID in the editor's note. */
export function editComment(editor: Editor, id: string, settings: ReviewMarksSettings): void {
	const view = editorViewOf(editor);
	if (!view) {
		notify('comments can only be edited in an open note.');
		return;
	}
	const doc = parse(view.state.doc.toString());
	const current = doc.annotations.find((a) => a.id === id)?.definition ?? doc.orphanDefinitions.find((d) => d.id === id);
	openCommentBox({
		view,
		id,
		initial: current?.comment ?? '',
		onSave: (comment) => {
			void new EditorChangeTarget(view)
				.apply((d) => planEditComment(d, { id, comment, placement: settings.placement }))
				.then((plan) => {
					if (isRefusal(plan)) notify(plan.message);
				});
			keepScroll(view, () => view.focus());
		},
		onCancel: () => keepScroll(view, () => view.focus()),
		onEmptySave: () => notify(EMPTY_MESSAGE),
	});
}

/** Registers "Edit comment at cursor": from the Target, the marker or the definition. No default hotkey. */
export function registerEditComment(plugin: Plugin, settings: () => ReviewMarksSettings): void {
	plugin.addCommand({
		id: 'edit-comment-at-cursor',
		name: 'Edit comment at cursor',
		editorCallback: (editor) => {
			const id = annotationIdAtCursor(editor);
			if (id) editComment(editor, id, settings());
			else notify('there is no annotation at the cursor.');
		},
	});
}
