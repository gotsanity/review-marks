// Notes the plugin leaves alone: Excalidraw drawings, whose text elements our syntax would corrupt.
import type { Editor } from 'obsidian';
import { isExcalidraw } from '../core';

/** Can this editor's note have Annotations? */
export function annotatable(editor: Editor): boolean {
	return !isExcalidraw(editor.getValue());
}

/** An `editorCheckCallback` that hides the command in notes the plugin leaves alone. */
export function whenAnnotatable(run: (editor: Editor) => void): (checking: boolean, editor: Editor) => boolean {
	return (checking, editor) => {
		if (!annotatable(editor)) return false;
		if (!checking) run(editor);
		return true;
	};
}
