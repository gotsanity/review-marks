// "Go to next annotation" and "Go to previous annotation", in reading order, wrapping around.
// In the editor the cursor goes to the start of the Target, centred. In Reading view the note
// scrolls to the Target and it flashes.
import { MarkdownView, type Plugin } from 'obsidian';
import { notify } from '../notice';
import { adjacentAnnotation, isExcalidraw, lineOfOffset, lineStarts, normalizeLineEndings, parse } from '../core';
import { scrollPreviewTo } from '../guards';

type Direction = 'next' | 'previous';

/** The last Annotation reached in each Reading view, so repeated steps don't depend on scroll. */
const lastInPreview = new WeakMap<MarkdownView, string>();

function goInEditor(view: MarkdownView, direction: Direction): boolean {
	const { editor } = view;
	const target = adjacentAnnotation(parse(editor.getValue()), editor.posToOffset(editor.getCursor('head')), direction);
	if (!target) return false;
	const at = editor.offsetToPos(target.open + 1);
	editor.setCursor(at);
	editor.scrollIntoView({ from: at, to: at }, true);
	editor.focus();
	return true;
}

function goInPreview(view: MarkdownView, direction: Direction): boolean {
	const text = normalizeLineEndings(view.data);
	const doc = parse(text);
	const starts = lineStarts(text);
	const last = doc.annotations.find((a) => a.id === lastInPreview.get(view));
	let from: number;
	if (last) from = last.open + 1;
	else {
		// From the top of what is on screen: "next" may land on its first line.
		const top = starts[Math.floor(view.previewMode.getScroll())] ?? text.length;
		from = direction === 'next' ? top - 1 : top;
	}
	const target = adjacentAnnotation(doc, from, direction);
	if (!target) return false;
	lastInPreview.set(view, target.id);
	scrollPreviewTo(view.previewMode, lineOfOffset(starts, target.open + 1), target.id);
	return true;
}

function go(plugin: Plugin, direction: Direction, checking: boolean): boolean {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!view || isExcalidraw(normalizeLineEndings(view.getViewData()))) return false;
	if (checking) return true;
	const moved = view.getMode() === 'preview' ? goInPreview(view, direction) : goInEditor(view, direction);
	if (!moved) notify('this note has no annotations.');
	return true;
}

/** Registers both commands. No default hotkeys, per the plugin guidelines. */
export function registerNavigation(plugin: Plugin): void {
	plugin.addCommand({
		id: 'go-to-next-annotation',
		name: 'Go to next annotation',
		checkCallback: (checking) => go(plugin, 'next', checking),
	});
	plugin.addCommand({
		id: 'go-to-previous-annotation',
		name: 'Go to previous annotation',
		checkCallback: (checking) => go(plugin, 'previous', checking),
	});
}
