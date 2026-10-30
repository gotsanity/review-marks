// What the sidebar's controls do to the listed note: fix IDs, save a Comment, remove an
// Annotation, and show a Target in the note.
import { MarkdownView, Platform, type App } from 'obsidian';
import { isRefusal, normalizeLineEndings, parse, planEditComment, planFixIds, planRemove, type Placement } from '../core';
import { editorViewOf, scrollToAnnotation } from '../guards';
import { notify } from '../notice';
import type { TrackedNote } from './tracked-note';

/** Gives each later use of a duplicate ID a new one, as one undo step. */
export async function fixIds(note: TrackedNote): Promise<void> {
	const file = note.file;
	if (!file) return;
	const plan = await note.changeTarget(file).apply(planFixIds);
	if (isRefusal(plan)) notify(plan.message);
}

/** Writes a Comment (already normalized, never empty) as one undo step. */
export async function saveComment(note: TrackedNote, id: string, comment: string, placement: Placement): Promise<void> {
	const file = note.file;
	if (!file) return;
	const plan = await note.changeTarget(file).apply((doc) => planEditComment(doc, { id, comment, placement }));
	if (isRefusal(plan)) notify(plan.message);
}

/** Removes an Annotation, keeping its Target text, as one undo step. */
export async function removeAnnotation(note: TrackedNote, id: string): Promise<void> {
	const file = note.file;
	if (!file) return;
	const plan = await note.changeTarget(file).apply((doc) => planRemove(doc, id));
	if (isRefusal(plan)) notify(plan.message);
}

/**
 * Shows the Target in the note. `enter` false (click): scrolls there and focus stays in the
 * sidebar. `enter` true (double-click): the cursor goes to the Target and the note takes focus.
 */
export async function jump(app: App, note: TrackedNote, id: string, enter: boolean): Promise<void> {
	const file = note.file;
	if (!file) return;
	let view = note.markdownView();
	if (!view) {
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(file, { active: enter });
		if (!(leaf.view instanceof MarkdownView)) return;
		view = leaf.view;
		note.leaf = leaf;
	} else if (!view.containerEl.isShown()) await app.workspace.revealLeaf(view.leaf);
	const doc = parse(normalizeLineEndings(view.editor.getValue()));
	const a = doc.annotations.find((x) => x.id === id);
	const def = a ? a.definition : (doc.orphanDefinitions.find((d) => d.id === id) ?? null);
	if (!a && !def) return;
	const at = a ? a.open + 1 : (def as { from: number }).from;
	if (Platform.isMobile) app.workspace.rightSplit.collapse();
	if (enter) app.workspace.setActiveLeaf(view.leaf, { focus: true });

	if (enter && view.getMode() !== 'preview') {
		const { editor } = view;
		editor.setCursor(editor.offsetToPos(at));
		const cm = editorViewOf(editor);
		if (cm) cm.focus();
		else editor.focus();
	}
	await scrollToAnnotation(view, at, { id });
}
