// The badge: the pill after a Target that shows the start of its Comment. One element for Live
// Preview, its tables and Reading view, so the popover finds it the same way everywhere.
import { excerpt, type Annotation } from './core';

/** What the badge says: the excerpt, "…" while a new Comment is typed, or the marker if the definition is missing. */
export function badgeLabel(a: Annotation, excerptLength: number, typing: boolean): string {
	if (typing) return '…';
	const comment = a.definition?.comment ?? null;
	if (comment === null) return `[^${a.id}]?`;
	return excerpt(comment, excerptLength);
}

/** The badge element for Annotation `id`. */
export function createBadge(id: string, label: string): HTMLElement {
	const el = createSpan({ cls: 'rm-badge', text: label });
	el.setAttribute('data-rm-id', id);
	return el;
}
