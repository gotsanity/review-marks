// "Annotate selection": the new Annotation appears at once (outside the undo history), the inline
// comment box opens under it, and saving writes Annotation and Comment as one undo step.
import { Notice, type Editor, type Plugin } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import { isRefusal, parse, planCreate, type Refusal } from '../core';
import { cancelProvisional, commitProvisional, startProvisional } from '../apply/provisional';
import { openCommentBox } from '../comment-box/comment-box';
import { editorViewOf, keepScroll } from '../guards';
import type { ReviewMarksSettings } from '../settings';
import { whenAnnotatable } from './annotatable';

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

	annotateRange(view, from, to, settings);
}

/**
 * Creates an Annotation over `[from, to)` of the view's doc, outside the undo history, and opens
 * the comment box for it. Saving writes it as one undo step; cancelling leaves no trace.
 */
export function annotateRange(view: EditorView, from: number, to: number, settings: ReviewMarksSettings): void {
	const placement = settings.placement;
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
		editorCheckCallback: whenAnnotatable((editor) => annotateSelection(editor, settings())),
	});
}
