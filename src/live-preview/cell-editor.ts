// Marks the small editors Obsidian opens inside a Live Preview table cell. Their text is just the
// cell, without the note's definitions, so they show the raw syntax rather than a badge.
import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView } from '@codemirror/view';
import { isTableCellEditor } from '../guards';

export const setCellEditor = StateEffect.define<boolean>();

const cellEditorField = StateField.define<boolean>({
	create: () => false,
	update(value, tr) {
		for (const e of tr.effects) if (e.is(setCellEditor)) value = e.value;
		return value;
	},
});

/** Is this the state of a table cell's editor? */
export function inTableCell(state: EditorState): boolean {
	return state.field(cellEditorField, false) === true;
}

/** Tracks whether the editor sits in a table cell. Its DOM is attached only after it is created. */
export const cellEditorTracking: Extension = [
	cellEditorField,
	ViewPlugin.define((view: EditorView) => {
		let queued = false;
		const check = () => {
			if (queued || inTableCell(view.state)) return;
			queued = true;
			queueMicrotask(() => {
				queued = false;
				if (view.dom.isConnected && !inTableCell(view.state) && isTableCellEditor(view)) {
					view.dispatch({ effects: setCellEditor.of(true) });
				}
			});
		};
		check();
		return { update: check };
	}),
];
