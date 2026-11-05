// Annotating from Reading view, shared by annotate-on-drag and Review Mode: finding the note under
// a press, and switching it to Live Preview to create the Annotation there.
import { MarkdownView, type Workspace } from 'obsidian';
import { annotateRange } from '../commands/annotate-selection';
import { inRenderedNoteText, scrollToAnnotation, switchToLivePreview } from '../guards';
import { notify } from '../notice';
import type { ReviewMarksSettings } from '../settings';
import type { SourceRange } from '../selection-mapping/selection-mapping';
import { READING_UNAVAILABLE } from './reading-range';

/**
 * Switches `view` from Reading view to Live Preview with `range` (over the rendered note) at the
 * same height on screen, and creates the Annotation on `target` (offsets of LF note `text`) with
 * its comment box open. Shared by the drag and Review Mode.
 */
export async function annotateInLivePreview(
	view: MarkdownView,
	text: string,
	target: SourceRange,
	range: Range,
	settings: ReviewMarksSettings,
): Promise<void> {
	const top = range.getClientRects()[0]?.top ?? range.getBoundingClientRect().top;
	const cm = await switchToLivePreview(view);
	if (!cm || cm.state.doc.toString() !== text) {
		notify(READING_UNAVAILABLE);
		return;
	}
	await scrollToAnnotation(view, target.from, { top });
	annotateRange(cm, target.from, target.to, settings);
}

/** The note in Reading view whose rendered note text holds `el`, if any. Its inline title, properties and footer don't count. */
export function readingViewAt(workspace: Workspace, el: Element): MarkdownView | null {
	if (!inRenderedNoteText(el)) return null;
	let found: MarkdownView | null = null;
	workspace.iterateAllLeaves((leaf) => {
		const v = leaf.view;
		if (!found && v instanceof MarkdownView && v.getMode() === 'preview' && v.previewMode.containerEl.contains(el)) found = v;
	});
	return found;
}
