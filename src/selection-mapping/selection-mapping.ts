// Selection mapping: a DOM Range over rendered Markdown (a Reading view section, a Live Preview
// table cell) back to source offsets. No Obsidian imports; tested with a fake DOM.
//
// How: classify each source character as rendered, markup that may render, or hidden (see
// visibility.ts). Then walk the rendered text and match each non-space character to the next
// source character that can show it, skipping markup. The selected source range runs from the
// first selected character to just after the last, then snaps out so it never splits a link,
// a formatting pair or an Annotation's syntax.
import { parse } from '../core';
import { isTableWidgetChrome } from '../guards';
import { HIDDEN, SOFT, visibility, type Visibility } from './visibility';

/** A rendered block and the source range `[from, to)` it was rendered from. */
export interface RenderedSlice {
	el: HTMLElement;
	from: number;
	to: number;
}

export interface SourceRange {
	from: number;
	to: number;
}

/** Why a selection could not be mapped. `message` completes "Review Marks: …". */
export interface MappingFailure {
	failure: 'outside-note' | 'not-found';
	message: string;
}

/** Rendered content that has no counterpart in the slice's source text (with a Live Preview table's own controls). */
const SKIP =
	'sup.footnote-ref, .rm-badge, .rm-hidden, .footnotes, section.footnotes, .frontmatter, .metadata-container, ' +
	'.internal-embed, .math, .copy-code-button, .rm-cbox, .cm-editor';

/** How many source characters that do render may be skipped to find a match. */
const MAX_SKIP = 12;

interface Hit {
	node: Text;
	index: number;
	/** Source offset of the character. */
	offset: number;
}

function renderedTextNodes(root: HTMLElement): Text[] {
	const out: Text[] = [];
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const parent = n.parentElement;
		const skipped = parent?.closest(SKIP);
		if (skipped && skipped !== root && root.contains(skipped)) continue;
		if (parent && root.contains(parent) && isTableWidgetChrome(parent)) continue;
		out.push(n as Text);
	}
	return out;
}

const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);

/** Every non-space rendered character of the slice that could be matched to a source offset. */
function matchSlice(text: string, vis: Visibility, slice: RenderedSlice): Hit[] {
	const chars: { node: Text; index: number; ch: string }[] = [];
	for (const node of renderedTextNodes(slice.el)) {
		for (let i = 0; i < node.data.length; i++) {
			const ch = node.data[i];
			if (ch !== undefined && !isSpace(ch)) chars.push({ node, index: i, ch });
		}
	}
	// The next offset >= q that can show `ch`, and how many rendered characters were skipped on the way.
	const seek = (q: number, ch: string, maxSkip: number): { at: number; skipped: number } => {
		let skipped = 0;
		for (; q < slice.to; q++) {
			const k = vis.kind[q];
			const c = text[q];
			if (k === HIDDEN || isSpace(c)) continue;
			if (c === ch) return { at: q, skipped };
			if (k === SOFT) continue;
			if (++skipped > maxSkip) break;
		}
		return { at: -1, skipped };
	};
	const hits: Hit[] = [];
	let p = slice.from;
	for (let k = 0; k < chars.length; k++) {
		const c = chars[k];
		if (!c) continue;
		const r = seek(p, c.ch, MAX_SKIP);
		if (r.at < 0) continue;
		if (r.skipped > 0) {
			// Skipping rendered source text: only if the next two rendered characters agree.
			let q = r.at + 1;
			let agree = true;
			for (let j = k + 1; j < Math.min(chars.length, k + 3); j++) {
				const n = seek(q, chars[j]?.ch ?? '', 0);
				if (n.at < 0) {
					agree = false;
					break;
				}
				q = n.at + 1;
			}
			if (!agree) continue;
		}
		hits.push({ node: c.node, index: c.index, offset: r.at });
		p = r.at + 1;
	}
	return hits;
}

function isSelected(range: Range, h: Hit): boolean {
	try {
		return range.comparePoint(h.node, h.index) === 0 && range.comparePoint(h.node, h.index + 1) === 0;
	} catch {
		return false;
	}
}

const MARKUP = '*_~=`';

/**
 * Snaps a source range outwards so it splits nothing: an end inside a link moves to the link's
 * edge, a formatting run (`**`, `` ` ``, …) closed inside the range is taken in with its opener,
 * and a range that covers a Target up to its end takes in the `}[^rN]` marker.
 */
export function snapRange(text: string, range: SourceRange, vis: Visibility = visibility(text)): SourceRange {
	let { from, to } = range;
	for (const l of vis.links) {
		if (from > l.from && from < l.to) from = l.from;
		if (to > l.from && to < l.to) to = l.to;
	}
	for (let changed = true; changed; ) {
		changed = false;
		let s = from;
		while (s > 0 && MARKUP.includes(text[s - 1] ?? ' ')) s--;
		if (s < from && text.slice(from, to).includes(text.slice(s, from))) {
			from = s;
			changed = true;
		}
		let e = to;
		while (e < text.length && MARKUP.includes(text[e] ?? ' ')) e++;
		if (e > to && text.slice(from, to).includes(text.slice(to, e))) {
			to = e;
			changed = true;
		}
	}
	for (const a of parse(text).annotations) {
		if (to === a.close && from <= a.open) to = a.markerEnd;
		if (from === a.open + 1 && to >= a.markerEnd) from = a.open;
	}
	return { from, to };
}

/**
 * Maps a DOM selection over rendered blocks (in document order) to a source range, snapped by
 * `snapRange`. Fails if the selection touches none of the blocks or matches no source text.
 */
export function mapSelection(text: string, slices: readonly RenderedSlice[], range: Range): SourceRange | MappingFailure {
	const touched = slices.filter((s) => {
		try {
			return range.intersectsNode(s.el);
		} catch {
			return false;
		}
	});
	if (touched.length === 0) return { failure: 'outside-note', message: 'the selection is not in the note text.' };

	const vis = visibility(text);
	const hitsOf = new Map<RenderedSlice, Hit[]>();
	const hits = (s: RenderedSlice) => {
		let h = hitsOf.get(s);
		if (!h) hitsOf.set(s, (h = matchSlice(text, vis, s)));
		return h;
	};
	let from = -1;
	for (const s of touched) {
		const first = hits(s).find((h) => isSelected(range, h));
		if (first) {
			from = first.offset;
			break;
		}
	}
	let to = -1;
	for (let i = touched.length - 1; i >= 0 && to < 0; i--) {
		const all = hits(touched[i] as RenderedSlice);
		for (let j = all.length - 1; j >= 0; j--) {
			const h = all[j] as Hit;
			if (isSelected(range, h)) {
				to = h.offset + 1;
				break;
			}
		}
	}
	if (from < 0 || to <= from) return { failure: 'not-found', message: 'could not find the selected text in the note.' };
	return snapRange(text, { from, to }, vis);
}
