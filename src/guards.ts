// Every fragile or version-dependent API the plugin touches, each with its fallback.
import type { Editor, MarkdownPreviewView } from 'obsidian';
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
 * Scrolls Reading view to a source line (0-based) and, once the Target with this ID is rendered,
 * centres and flashes it. `applyScroll` is public but its unit (a source line) is undocumented,
 * so the decorated Target's `scrollIntoView` does the real positioning when it can be found.
 */
export function scrollPreviewTo(preview: MarkdownPreviewView, line: number, id: string): void {
	preview.applyScroll(Math.max(0, line - 2));
	const win = preview.containerEl.win;
	let tries = 0;
	const find = () => {
		const el = preview.containerEl.querySelector(`.rm-target[data-rm-id="${id}"]`);
		if (el instanceof HTMLElement) {
			el.scrollIntoView({ block: 'center' });
			flash(el);
			return;
		}
		if (++tries < 10) win.requestAnimationFrame(find);
	};
	win.requestAnimationFrame(find);
}

function flash(el: HTMLElement): void {
	el.removeClass('rm-flash');
	// Restart the animation if it is still running from a previous jump.
	void el.offsetWidth;
	el.addClass('rm-flash');
	el.win.setTimeout(() => el.removeClass('rm-flash'), 1500);
}
