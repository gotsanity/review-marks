// Decorates rendered HTML for a known slice of the source, with the plan from align.ts: Reading
// view sections now, and table cells later. Fails closed: if the HTML doesn't line up with the
// source, the slice stays as Obsidian rendered it.
import { excerpt, type AnnotationDoc } from '../core';
import { badgeText } from '../live-preview/badge';
import { planRendered } from './align';

/**
 * Rendered parts whose text doesn't come from the slice's source text (or isn't shown as text),
 * so their braces don't count. Obsidian publishes no DOM contract: keep this list in one place.
 */
const SKIP = [
	'sup.footnote-ref',
	'.footnotes',
	'.rm-badge',
	'.frontmatter',
	'.math',
	'.internal-embed',
	'.markdown-embed',
	'.collapse-indicator',
	'.copy-code-button',
].join(', ');

export interface DecorateOptions {
	showBadge: boolean;
	excerptLength: number;
}

function textNodes(root: HTMLElement): Text[] {
	const out: Text[] = [];
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const skipped = n.parentElement?.closest(SKIP);
		if (!skipped || !root.contains(skipped)) out.push(n as Text);
	}
	return out;
}

function isFootnoteRef(node: Node | null): node is HTMLElement {
	return node?.nodeName === 'SUP' && (node as HTMLElement).classList.contains('footnote-ref');
}

/**
 * Highlights the Annotations of `doc` in `root`, the rendered HTML of the source `from..to`: hides
 * their braces and footnote references and adds a badge after each Target that ends here.
 * Returns true if anything was decorated.
 *
 * New nodes come from Obsidian's global `createSpan`/`createFragment` (the 1.7.2 typings have no
 * `doc.win` versions); a node is adopted when it is inserted into a popout window's document.
 */
export function decorateRendered(
	root: HTMLElement,
	doc: AnnotationDoc,
	from: number,
	to: number,
	options: DecorateOptions,
): boolean {
	// Already decorated: its hidden braces are still text, so a second pass would wrap them again.
	if (root.querySelector('.rm-target, .rm-hidden')) return false;
	const nodes = textNodes(root);
	const plan = planRendered(doc, from, to, nodes.map((n) => n.data));
	if (!plan || plan.size === 0) return false;

	const badgeAnchors: { id: string; after: Element }[] = [];
	for (const [index, segments] of plan) {
		const node = nodes[index];
		if (!node) continue;
		const next = node.nextSibling;
		const fragment = createFragment();
		segments.forEach((segment, i) => {
			if (segment.kind === 'text') {
				fragment.append(segment.text);
				return;
			}
			if (segment.kind === 'target') {
				fragment.append(
					createSpan({
						cls: segment.nested ? 'rm-target rm-nested' : 'rm-target',
						text: segment.text,
						attr: { 'data-rm-id': segment.id ?? '' },
					}),
				);
				return;
			}
			const el = createSpan({ cls: 'rm-hidden', text: segment.text });
			fragment.append(el);
			if (!segment.closes) return;
			let after: Element = el;
			if (!segment.markerInline && i === segments.length - 1 && isFootnoteRef(next)) {
				next.classList.add('rm-hidden');
				after = next;
			}
			badgeAnchors.push({ id: segment.closes, after });
		});
		node.replaceWith(fragment);
	}

	if (options.showBadge) {
		for (const { id, after } of badgeAnchors) {
			const comment = doc.annotations.find((a) => a.id === id)?.definition?.comment ?? null;
			const text = badgeText(id, comment, false, (c) => excerpt(c, options.excerptLength));
			after.after(createSpan({ cls: 'rm-badge', text, attr: { 'data-rm-id': id } }));
		}
	}
	return true;
}
