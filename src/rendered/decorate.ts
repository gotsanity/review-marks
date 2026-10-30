// Decorates already-rendered HTML for a known slice of the source: a Live Preview table cell
// (or a Reading view block). No Obsidian imports; tested with a fake DOM.
//
// How: Obsidian renders `{` and `}` as literal text, so the n-th brace of the source slice is the
// n-th brace of the rendered text. Line them up, hide each Annotation's braces and footnote
// reference, wrap the text between them, and add the badge. If the braces don't line up, the
// HTML is left as it is (fail closed), so the reader sees the raw syntax rather than a wrong
// highlight.
import { codeMask, type Annotation } from '../core';
import { isTableWidgetChrome } from '../guards';

/** Rendered content that isn't part of the slice's text (with a Live Preview table's own controls). */
const SKIP = '.rm-badge, .cm-editor, .math, .internal-embed, .footnotes';
/** Rendered content whose braces aren't markup. */
const LITERAL = 'code, pre';

const HIDDEN = 'rm-hidden';
const TARGET = 'rm-target';

interface Piece {
	from: number;
	to: number;
	hide?: { closes?: string };
	target?: Annotation;
}

interface Spot {
	node: number;
	index: number;
}

export function textNodes(root: HTMLElement): { nodes: Text[]; braces: (Spot & { ch: string })[] } {
	const nodes: Text[] = [];
	const braces: (Spot & { ch: string })[] = [];
	const walker = root.doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const t = n as Text;
		const parent = t.parentElement;
		const skipped = parent?.closest(SKIP);
		if (skipped && skipped !== root && root.contains(skipped)) continue;
		if (parent && root.contains(parent) && isTableWidgetChrome(parent)) continue;
		const literal = parent?.closest(LITERAL);
		if (!(literal && root.contains(literal))) {
			for (let i = 0; i < t.data.length; i++) {
				const ch = t.data[i];
				if (ch === '{' || ch === '}') braces.push({ node: nodes.length, index: i, ch });
			}
		}
		nodes.push(t);
	}
	return { nodes, braces };
}

/** The code mask of the last note seen: every section of a note brings the same text. */
let lastMask: { text: string; mask: Uint8Array } | null = null;
function codeOf(text: string): Uint8Array {
	if (lastMask?.text !== text) lastMask = { text, mask: codeMask(text) };
	return lastMask.mask;
}

/** Offsets of the braces in `text[from, to)` that render as brace characters (not in code). */
export function sourceBraces(text: string, from: number, to: number): number[] {
	const inCode = codeOf(text);
	const out: number[] = [];
	for (let i = from; i < to; i++) {
		if (inCode[i]) continue;
		const c = text[i];
		if (c === '\\') {
			i++;
			if (text[i] === '{' || text[i] === '}') out.push(i);
		} else if (c === '{' || c === '}') out.push(i);
	}
	return out;
}

/** Undoes `decorateRendered`. */
export function undecorate(root: HTMLElement): void {
	root.querySelectorAll('.rm-badge').forEach((b) => b.remove());
	root.querySelectorAll(`.${HIDDEN}:not(span), .${TARGET}:not(span)`).forEach((el) => el.classList.remove(HIDDEN, TARGET));
	root.querySelectorAll(`span.${HIDDEN}, span.${TARGET}`).forEach((s) => s.replaceWith(...Array.from(s.childNodes)));
	root.normalize();
}

/**
 * Decorates `root`, rendered from `text[slice.from, slice.to)`, for the `annotations` that
 * overlap the slice. Targets that start or end outside the slice cover it from its start or to
 * its end. `badge` makes the badge shown after an Annotation's marker, or null for none.
 * Returns whether anything was decorated; on a brace mismatch nothing is.
 */
export function decorateRendered(
	root: HTMLElement,
	text: string,
	slice: { from: number; to: number },
	annotations: readonly Annotation[],
	badge: (a: Annotation) => HTMLElement | null,
): boolean {
	if (root.querySelector(`.${HIDDEN}, .${TARGET}, .rm-badge`)) undecorate(root);
	const { from, to } = slice;
	const hits = annotations.filter((a) => a.open < to && a.markerEnd > from);
	if (hits.length === 0) return false;

	const { nodes, braces } = textNodes(root);
	const src = sourceBraces(text, from, to);
	if (nodes.length === 0 || src.length !== braces.length) return false;
	const at = new Map<number, Spot>();
	for (let k = 0; k < src.length; k++) {
		const s = src[k] as number;
		const d = braces[k];
		if (!d || text[s] !== d.ch) return false;
		at.set(s, d);
	}

	const pieces = new Map<number, Piece[]>();
	const add = (node: number, p: Piece) => {
		const list = pieces.get(node) ?? [];
		list.push(p);
		pieces.set(node, list);
	};
	const lastNode = nodes.length - 1;
	const badges: { a: Annotation; after: Element | string }[] = [];

	for (const a of hits) {
		const open = a.open >= from ? at.get(a.open) : { node: 0, index: -1 };
		const close = a.close < to ? at.get(a.close) : { node: lastNode, index: nodes[lastNode]?.length ?? 0 };
		if (!open || !close) return false;
		if (a.open >= from) add(open.node, { from: open.index, to: open.index + 1, hide: {} });
		if (a.close < to) {
			const node = nodes[close.node] as Text;
			const rest = node.data.slice(close.index + 1);
			const ref = new RegExp(`^(?:\\[\\^${a.id}\\]|${a.id}(?![0-9]))`).exec(rest);
			add(close.node, { from: close.index, to: close.index + 1 + (ref?.[0].length ?? 0), hide: { closes: a.id } });
			const next = !ref && close.index + 1 === node.length ? node.nextSibling : null;
			badges.push({ a, after: next instanceof Element && next.tagName === 'SUP' ? next : a.id });
		}
		for (let k = open.node; k <= close.node; k++) {
			const s = k === open.node ? open.index + 1 : 0;
			const e = k === close.node ? close.index : (nodes[k]?.length ?? 0);
			if (e > s && (nodes[k]?.data.slice(s, e).trim() ?? '') !== '') add(k, { from: s, to: e, target: a });
		}
	}

	// Rewrite each touched text node once, so recorded indexes never go stale.
	const doc = root.doc;
	const closers = new Map<string, Element>();
	for (const [n, list] of pieces) {
		const node = nodes[n] as Text;
		const cuts = new Set<number>([0, node.length]);
		for (const p of list) {
			cuts.add(Math.max(0, p.from));
			cuts.add(Math.min(node.length, p.to));
		}
		const points = [...cuts].sort((x, y) => x - y);
		const parent = node.parentNode;
		if (!parent) continue;
		for (let i = 0; i + 1 < points.length; i++) {
			const s = points[i] as number;
			const e = points[i + 1] as number;
			const part = node.data.slice(s, e);
			const cover = list.filter((p) => p.from <= s && p.to >= e);
			const hide = cover.find((p) => p.hide);
			// The innermost Target wins.
			const target = cover
				.filter((p) => p.target)
				.map((p) => p.target as Annotation)
				.sort((x, y) => x.close - x.open - (y.close - y.open))[0];
			if (hide || target) {
				const span = parent.createSpan({ cls: hide ? HIDDEN : TARGET, text: part });
				if (!hide && target) span.dataset.rmId = target.id;
				if (hide?.hide?.closes) closers.set(hide.hide.closes, span);
				parent.insertBefore(span, node);
			} else parent.insertBefore(doc.createTextNode(part), node);
		}
		node.remove();
	}

	for (const b of badges) {
		if (typeof b.after !== 'string') b.after.classList.add(HIDDEN);
		const after = typeof b.after === 'string' ? closers.get(b.after) : b.after;
		const el = badge(b.a);
		if (after && el) after.after(el);
	}
	return true;
}
