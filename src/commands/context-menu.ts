// Editor context menu (right-click, and long-press on mobile): "Annotate selection" when text is
// selected; "Edit comment" and "Remove annotation" when the cursor is on an Annotation.
import type { Plugin } from 'obsidian';
import type { ReviewMarksSettings } from '../settings';
import { annotatable } from './annotatable';
import { annotateSelection } from './annotate-selection';
import { editComment } from './edit-comment';
import { annotationIdAtCursor, removeAnnotation } from './remove-annotation';

export function registerContextMenu(plugin: Plugin, settings: () => ReviewMarksSettings): void {
	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu, editor) => {
			if (!annotatable(editor)) return;
			if (editor.somethingSelected()) {
				menu.addItem((item) =>
					item
						.setTitle('Annotate selection')
						.setIcon('highlighter')
						.onClick(() => annotateSelection(editor, settings())),
				);
			}
			const id = annotationIdAtCursor(editor);
			if (!id) return;
			menu.addItem((item) =>
				item
					.setTitle('Edit comment')
					.setIcon('message-square')
					.onClick(() => editComment(editor, id, settings())),
			);
			menu.addItem((item) =>
				item
					.setTitle('Remove annotation')
					.setIcon('eraser')
					.onClick(() => void removeAnnotation(editor, id)),
			);
		}),
	);
}
