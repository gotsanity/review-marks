// Live Preview Backspace just after an Annotation's hidden `}[^rN]`: the core's `backspaceAt`
// deletes the Target's last character instead of the invisible `]`, or removes the Annotation if
// the Target would become empty. With the syntax showing, and in Source mode, Backspace is normal.
import { editorLivePreviewField } from 'obsidian';
import { EditorSelection, Prec, findClusterBreak, type Extension } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import { backspaceAt, isTableLine, parse } from '../core';
import { dispatchAsOneStep } from '../apply/editor-target';
import { annotationsField } from './live-preview';

function run(view: EditorView): boolean {
	const { state } = view;
	if (!state.field(editorLivePreviewField, false)) return false;
	if (state.selection.ranges.length !== 1 || !state.selection.main.empty) return false;
	const pos = state.selection.main.head;
	const ending = state.field(annotationsField, false)?.find((a) => a.markerEnd === pos);
	// Table rows are drawn by Obsidian's table widget, whose cell editors show the raw syntax.
	if (!ending || isTableLine(state.doc.lineAt(ending.close).text)) return false;

	const plan = backspaceAt(parse(state.doc.toString()), pos, (t) => findClusterBreak(t, t.length, false));
	if (!plan) return false;
	if (plan.kind === 'remove') {
		dispatchAsOneStep(view, plan.changes, plan.caret);
	} else {
		// A plain delete, so the history joins it with the Backspaces around it.
		view.dispatch({
			changes: plan.changes,
			selection: EditorSelection.cursor(plan.caret),
			userEvent: 'delete.backward',
			scrollIntoView: true,
		});
	}
	return true;
}

/** Register with the editor extensions. */
export const backspaceExtension: Extension = Prec.highest(keymap.of([{ key: 'Backspace', run }]));
