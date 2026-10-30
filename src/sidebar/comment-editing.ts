// Editing a Comment in the sidebar: a textarea per Annotation that saves when it loses focus (or
// on Mod+Enter, see the view's Scope), restores on Escape, and refuses an empty Comment.
import { normalizeComment } from '../core';
import { notify } from '../notice';

export const EMPTY_COMMENT_MESSAGE = 'a comment cannot be empty. To delete it, use Remove annotation.';

/** Grows a textarea to fit its text. */
export function fit(ta: HTMLTextAreaElement): void {
	ta.setCssProps({ '--rm-sb-comment-height': 'auto' });
	ta.setCssProps({ '--rm-sb-comment-height': `${ta.scrollHeight + 2}px` });
}

/**
 * Adds the Comment textarea of Annotation `id` to `parent`. `onSave` gets the new Comment,
 * normalized, never empty and never unchanged.
 */
export function commentField(
	parent: HTMLElement,
	id: string,
	comment: string,
	onSave: (ta: HTMLTextAreaElement) => void,
): HTMLTextAreaElement {
	const ta = parent.createEl('textarea', {
		cls: 'rm-sb-comment',
		attr: { rows: '1', placeholder: 'Add a comment…', 'aria-label': `Comment [^${id}]` },
	});
	ta.dataset.rmId = id;
	ta.dataset.saved = comment;
	ta.value = comment;
	ta.addEventListener('input', () => fit(ta));
	ta.addEventListener('blur', () => onSave(ta));
	ta.addEventListener('keydown', (e) => {
		if (e.key !== 'Escape') return;
		e.preventDefault();
		ta.value = ta.dataset.saved ?? '';
		fit(ta);
		ta.blur();
	});
	ta.win.requestAnimationFrame(() => fit(ta));
	return ta;
}

/**
 * The Comment to save from `ta`, or null if there is nothing to save. An emptied Comment is
 * refused with a notice and the textarea goes back to the saved one. A Comment to save is
 * recorded as saved at once, so the refresh its write triggers sees the textarea as saved.
 */
export function takeEdit(ta: HTMLTextAreaElement): string | null {
	const comment = normalizeComment(ta.value);
	if (comment === normalizeComment(ta.dataset.saved ?? '')) return null;
	if (comment === '') {
		notify(EMPTY_COMMENT_MESSAGE);
		ta.value = ta.dataset.saved ?? '';
		fit(ta);
		return null;
	}
	ta.dataset.saved = comment;
	return comment;
}

/** Replaces the saved Comment of a textarea that has no unsaved draft. */
export function updateSaved(ta: HTMLTextAreaElement, comment: string): void {
	const saved = ta.dataset.saved ?? '';
	if (comment === saved) return;
	if (ta.value === saved) {
		ta.value = comment;
		fit(ta);
	}
	ta.dataset.saved = comment;
}
