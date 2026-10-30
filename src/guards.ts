// Every fragile or version-dependent API the plugin touches, each with its fallback.
import type { Editor } from 'obsidian';
import type { ChangeDesc, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * The CodeMirror view behind an Obsidian editor. `editor.cm` is untyped but documented in
 * "Communicating with editor extensions". Undefined if it is missing or not a CM6 view.
 */
export function editorViewOf(editor: Editor): EditorView | undefined {
	const cm: unknown = (editor as unknown as { cm?: unknown }).cm;
	return cm instanceof EditorView ? cm : undefined;
}

/**
 * Runs `fn` and puts the scroll position back afterwards, so edits don't move the note.
 * `scrollSnapshot` needs @codemirror/view 6.22; without it, `fn` just runs.
 */
export function keepScroll<T>(view: EditorView, fn: () => T): T {
	if (typeof view.scrollSnapshot !== 'function') return fn();
	const snapshot = view.scrollSnapshot();
	const out = fn();
	view.dispatch({ effects: snapshot });
	return out;
}

/**
 * An effect that keeps the current scroll position through `changes`, for the transaction that
 * makes them, so edits above the viewport don't shift the note. Undefined without
 * `scrollSnapshot` (@codemirror/view 6.22).
 */
export function scrollSnapshotThrough(view: EditorView, changes: ChangeDesc): StateEffect<unknown> | undefined {
	if (typeof view.scrollSnapshot !== 'function') return undefined;
	return view.scrollSnapshot().map(changes);
}
