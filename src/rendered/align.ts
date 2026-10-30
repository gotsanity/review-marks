// Lines rendered HTML up with its Markdown source, for decorating Annotations in it. Pure: the
// rendered HTML comes in as the text of its text nodes, in document order.
//
// Obsidian renders `{` and `}` as literal text, so the n-th brace in the source slice is the n-th
// brace in the rendered text. Pair them up, then hide each Annotation's braces and wrap the text
// between them. A Target that starts or ends outside the slice covers it from its start or to its
// end, which is how a Target crossing rendered sections is drawn.
import type { Annotation, AnnotationDoc } from '../core';

/** One piece of a rewritten text node. */
export interface Segment {
	/** `text` is left as is, `syntax` is hidden, `target` is highlighted. */
	kind: 'text' | 'syntax' | 'target';
	text: string;
	/** The innermost Annotation a `target` piece belongs to. */
	id?: string;
	/** Set on a `target` piece inside more than one Target. */
	nested?: true;
	/** Set on the `syntax` piece holding an Annotation's `}`; its badge goes after it. */
	closes?: string;
	/**
	 * Set when the marker `[^rN]` is plain text after the `}` and hidden with it. Otherwise the
	 * marker was rendered as a footnote reference, the next sibling of this piece.
	 */
	markerInline?: true;
}

interface Interval {
	from: number;
	to: number;
	kind: 'syntax' | 'target';
	annotation: Annotation;
	closes?: true;
	markerInline?: true;
}

interface Point {
	node: number;
	at: number;
}

/** Offsets of the braces in `from..to` that render as text: all of them outside definitions. */
function sourceBraces(doc: AnnotationDoc, from: number, to: number): number[] {
	const definitions = [...doc.annotations.flatMap((a) => (a.definition ? [a.definition] : [])), ...doc.orphanDefinitions];
	const out: number[] = [];
	for (let i = from; i < to; i++) {
		const c = doc.text[i];
		if ((c === '{' || c === '}') && !definitions.some((d) => i >= d.from && i < d.to)) out.push(i);
	}
	return out;
}

/**
 * How to rewrite the rendered text nodes of the source slice `from..to` so its Annotations show.
 * Returns the new pieces of each changed node, keyed by node index; nodes not in the map stay.
 * Returns null when the rendered braces don't match the source, so nothing is decorated rather
 * than the wrong text.
 */
export function planRendered(
	doc: AnnotationDoc,
	from: number,
	to: number,
	nodes: readonly string[],
): Map<number, Segment[]> | null {
	const out = new Map<number, Segment[]>();
	const hits = doc.annotations.filter((a) => a.open < to && a.markerEnd > from);
	if (hits.length === 0) return out;

	const dom: (Point & { ch: string })[] = [];
	nodes.forEach((text, node) => {
		for (let at = 0; at < text.length; at++) {
			const ch = text.charAt(at);
			if (ch === '{' || ch === '}') dom.push({ node, at, ch });
		}
	});
	const src = sourceBraces(doc, from, to);
	if (src.length !== dom.length || nodes.length === 0) return null;
	const brace = new Map<number, Point>();
	for (let k = 0; k < src.length; k++) {
		const offset = src[k] ?? 0;
		const point = dom[k];
		if (!point || doc.text[offset] !== point.ch) return null;
		brace.set(offset, point);
	}

	const intervals = new Map<number, Interval[]>();
	const add = (node: number, iv: Interval) => {
		const list = intervals.get(node) ?? [];
		list.push(iv);
		intervals.set(node, list);
	};
	const last = nodes.length - 1;
	for (const a of hits) {
		const open = a.open >= from ? brace.get(a.open) : { node: 0, at: -1 };
		const close = a.close < to ? brace.get(a.close) : { node: last, at: (nodes[last] ?? '').length };
		if (!open || !close) return null;
		if (a.open >= from) add(open.node, { from: open.at, to: open.at + 1, kind: 'syntax', annotation: a });
		if (a.close < to) {
			const marker = `[^${a.id}]`;
			const inline = (nodes[close.node] ?? '').startsWith(marker, close.at + 1);
			add(close.node, {
				from: close.at,
				to: close.at + 1 + (inline ? marker.length : 0),
				kind: 'syntax',
				annotation: a,
				closes: true,
				...(inline ? { markerInline: true as const } : {}),
			});
		}
		for (let node = open.node; node <= close.node; node++) {
			const text = nodes[node] ?? '';
			const s = node === open.node ? open.at + 1 : 0;
			const e = node === close.node ? close.at : text.length;
			if (e > s && text.slice(s, e).trim() !== '') add(node, { from: s, to: e, kind: 'target', annotation: a });
		}
	}

	for (const [node, list] of intervals) out.set(node, segmentsOf(nodes[node] ?? '', list));
	return out;
}

/** Cuts one text node at every interval boundary and labels each piece. */
function segmentsOf(text: string, list: Interval[]): Segment[] {
	const cuts = new Set([0, text.length]);
	for (const iv of list) {
		cuts.add(Math.max(0, iv.from));
		cuts.add(Math.min(text.length, iv.to));
	}
	const points = [...cuts].sort((x, y) => x - y);
	const out: Segment[] = [];
	for (let i = 0; i + 1 < points.length; i++) {
		const s = points[i] ?? 0;
		const e = points[i + 1] ?? 0;
		const piece = text.slice(s, e);
		const cover = list.filter((iv) => iv.from <= s && iv.to >= e);
		const syntax = cover.find((iv) => iv.kind === 'syntax');
		const targets = cover
			.filter((iv) => iv.kind === 'target')
			.sort((x, y) => x.annotation.close - x.annotation.open - (y.annotation.close - y.annotation.open));
		const innermost = targets[0];
		let segment: Segment;
		if (syntax) {
			segment = { kind: 'syntax', text: piece };
			if (syntax.closes) segment.closes = syntax.annotation.id;
			if (syntax.markerInline) segment.markerInline = true;
		} else if (innermost) {
			segment = { kind: 'target', text: piece, id: innermost.annotation.id };
			if (targets.length > 1) segment.nested = true;
		} else {
			segment = { kind: 'text', text: piece };
		}
		const prev = out[out.length - 1];
		if (prev && segment.kind !== 'syntax' && prev.kind === segment.kind && prev.id === segment.id && prev.nested === segment.nested) {
			prev.text += piece;
		} else out.push(segment);
	}
	return out;
}
