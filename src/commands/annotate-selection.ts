// "Annotate selection": the new Annotation appears at once (outside the undo history), the inline
// comment box opens under it, and saving writes Annotation and Comment as one undo step.
import { Notice, type Editor, type Plugin } from 'obsidian';
import { isRefusal, parse, planCreate, type Refusal } from '../core';
import { cancelProvisional, commitProvisional, startProvisional } from '../apply/provisional';
import { openCommentBox } from '../comment-box/comment-box';
import { editorViewOf, keepScroll } from '../guards';
import type { ReviewMarksSettings } from '../settings';

function showRefusal(refusal: Refusal): void {
	new Notice(`Review Marks: ${refusal.message}`);
}

/** Creates an Annotation over the editor's selection and opens the comment box for it. */
export function annotateSelection(editor: Editor, settings: ReviewMarksSettings): void {
	const view = editorViewOf(editor);
	const from = editor.posToOffset(editor.getCursor('from'));
	const to = editor.posToOffset(editor.getCursor('to'));
	const placement = settings.placement;

	if (!view) {
		// No CodeMirror view: fall back to a plain create with an empty Comment.
		const plan = planCreate(parse(editor.getValue()), { from, to, comment: '', placement });
		if (isRefusal(plan)) showRefusal(plan);
		else editor.transaction({ changes: plan.changes.map((c) => ({ from: editor.offsetToPos(c.from), to: editor.offsetToPos(c.to), text: c.insert })) });
		return;
	}

	const plan = planCreate(parse(view.state.doc.toString()), { from, to, comment: '', placement });
	if (isRefusal(plan)) {
		showRefusal(plan);
		return;
	}
	startProvisional(view, plan);
	openCommentBox({
		view,
		id: plan.id,
		initial: '',
		onSave: (comment) => {
			const saved = commitProvisional(view, comment, placement);
			if (saved && isRefusal(saved)) showRefusal(saved);
			// Back to the note, just after the marker: the syntax stays hidden and nothing scrolls.
			keepScroll(view, () => view.focus());
		},
		onCancel: () => {
			cancelProvisional(view);
			keepScroll(view, () => view.focus());
		},
	});
}

/** Registers the command. No default hotkey, per the plugin guidelines. */
export function registerAnnotateSelection(plugin: Plugin, settings: () => ReviewMarksSettings): void {
	plugin.addCommand({
		id: 'annotate-selection',
		name: 'Annotate selection',
		editorCallback: (editor) => annotateSelection(editor, settings()),
	});
}
