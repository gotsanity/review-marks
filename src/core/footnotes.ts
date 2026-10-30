// Footnotes as Reading view sees them: every footnote, the author's and the review ones.
import { isExcalidraw } from './collisions';

const REVIEW_LABEL = /^r\d+$/;
const DEFINITION = /^\[\^([^\]\s]+)\]:/gm;
const REFERENCE = /\[\^([^\]\s]+)\](?!:)/g;

/** Is this footnote label a review one (`rN`)? */
export function isReviewLabel(label: string): boolean {
	return REVIEW_LABEL.test(label);
}

/**
 * Defined footnote labels in order of their first reference. Reading view numbers its footnote
 * list this way, so item N of the list is `footnoteOrder(text)[N - 1]`.
 */
export function footnoteOrder(text: string): string[] {
	const defined = new Set([...text.matchAll(DEFINITION)].map((m) => m[1] ?? ''));
	const out: string[] = [];
	for (const m of text.matchAll(REFERENCE)) {
		const label = m[1] ?? '';
		if (defined.has(label) && !out.includes(label)) out.push(label);
	}
	return out;
}

/**
 * The footnote label of each item in Reading view's footnote list of `itemCount` items, or null
 * when the count disagrees with the note or the note is an Excalidraw drawing. Callers then leave the list alone: showing a review
 * footnote is harmless, hiding an author's one is not.
 */
export function footnoteListLabels(text: string, itemCount: number): string[] | null {
	if (isExcalidraw(text)) return null;
	const order = footnoteOrder(text);
	return order.length === itemCount ? order : null;
}
