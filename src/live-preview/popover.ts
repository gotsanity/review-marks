// The comment popover for Live Preview's Targets and badges. A plain DOM listener on the content,
// because CodeMirror skips its own event handlers for widgets that ignore events, like the badge.
import { editorInfoField } from 'obsidian';
import { ViewPlugin, type EditorView } from '@codemirror/view';
import type { CommentPopover, CommentRef } from '../popover/popover';
import { annotationsField } from './live-preview';

function resolve(view: EditorView, anchor: HTMLElement): CommentRef | null {
	const id = anchor.getAttribute('data-rm-id');
	const annotation = view.state.field(annotationsField, false)?.find((a) => a.id === id);
	if (!id || !annotation) return null;
	return {
		id,
		comment: annotation.definition?.comment ?? null,
		sourcePath: view.state.field(editorInfoField, false)?.file?.path ?? '',
	};
}

export function livePreviewPopover(popover: CommentPopover) {
	return ViewPlugin.define((view) => {
		const stop = popover.attach(view.contentDOM, (anchor) => resolve(view, anchor));
		return { destroy: stop };
	});
}
