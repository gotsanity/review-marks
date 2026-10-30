// Cleans HTML rendered outside the note's own views: PDF export and `MarkdownRenderer.render`
// (what "Copy document as HTML" uses). These renders have no section info, so each Annotation
// is found from its rendered footnote reference instead. No Obsidian imports; tested with a fake DOM.
//
// How: a `}` directly followed by a review reference closes that Annotation. The source says how
// many rendered braces sit inside its Target, which locates the `{`. If the braces between don't
// match the source, that Annotation is left as rendered (fail closed).
import { footnoteListLabels, footnoteOrder, isReviewLabel, type AnnotationDoc } from '../core';
import { sourceBraces, textNodes } from './decorate';

/** The review label of the footnote reference `node`, if it is one. */
function referenceLabel(node: Node | null): string | null {
	if (!(node instanceof Element) || node.tagName !== 'SUP') return null;
	const label = node.querySelector('a[data-footref]')?.getAttribute('data-footref') ?? '';
	return isReviewLabel(label) ? label : null;
}

/**
 * Strips review footnotes: their references, their items in the footnote list (and the list if
 * nothing else is left), and renumbers the author's references to match the shorter list.
 * The list is matched to the note by count, as in Reading view; if it disagrees it is left alone.
 */
function stripComments(root: HTMLElement, doc: AnnotationDoc): void {
	const ids = new Set(doc.annotations.map((a) => a.id));
	const order = footnoteOrder(doc.text);
	const kept = order.filter((label) => !(isReviewLabel(label) && ids.has(label)));

	for (const sup of Array.from(root.querySelectorAll('sup'))) {
		const label = sup.querySelector('a[data-footref]')?.getAttribute('data-footref');
		if (!label) continue;
		const link = sup.querySelector('a[data-footref]');
		if (isReviewLabel(label) && ids.has(label)) sup.remove();
		else if (link && kept.includes(label)) {
			link.textContent = (link.textContent ?? '').replace(/^\[\d+/, `[${kept.indexOf(label) + 1}`);
		}
	}

	for (const list of Array.from(root.querySelectorAll('section.footnotes'))) {
		const items = Array.from(list.querySelectorAll(':scope > ol > li'));
		const labels = footnoteListLabels(doc.text, items.length);
		if (!labels || !items.every((li, i) => li.id.startsWith(`fn-${i + 1}-`))) continue;
		items.forEach((li, i) => {
			const label = labels[i] ?? '';
			if (isReviewLabel(label) && ids.has(label)) li.remove();
		});
		if (!list.querySelector(':scope > ol > li')) list.remove();
	}
}

/**
 * Removes every Annotation's braces from `root`, rendered from the note `doc`. Comments stay as
 * Obsidian's numbered footnotes, or with `strip` are removed too, leaving the Target as plain text.
 */
export function cleanExport(root: HTMLElement, doc: AnnotationDoc, strip: boolean): void {
	const { nodes, braces } = textNodes(root);
	const cuts: { node: Text; index: number; length: number }[] = [];

	braces.forEach((close, k) => {
		if (close.ch !== '}') return;
		const node = nodes[close.node] as Text;
		// A reference with no definition is printed as text: `}[^r1]`.
		const literal = /^\[\^(r\d+)\]/.exec(node.data.slice(close.index + 1));
		const label = literal ? literal[1] : close.index === node.length - 1 ? referenceLabel(node.nextSibling) : null;
		const a = label ? doc.annotations.find((x) => x.id === label) : undefined;
		if (!a || (literal && a.definition)) return;
		const inner = sourceBraces(doc.text, a.open + 1, a.close);
		const first = k - inner.length - 1;
		if (braces[first]?.ch !== '{') return;
		if (!inner.every((s, t) => braces[first + 1 + t]?.ch === doc.text[s])) return;
		const open = braces[first];
		if (!open) return;
		cuts.push({ node: nodes[open.node] as Text, index: open.index, length: 1 });
		cuts.push({ node, index: close.index, length: 1 + (literal?.[0].length ?? 0) });
	});

	// Last cut first, so earlier indexes in the same text node stay valid.
	cuts.sort((x, y) => y.index - x.index);
	for (const cut of cuts) cut.node.deleteData(cut.index, cut.length);
	if (strip) stripComments(root, doc);
}
