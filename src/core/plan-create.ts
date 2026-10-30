import { definitionText } from './definition';
import { blockPrefixLength, headingStarts, isTableLine } from './sections';
import type { AnnotationDoc, Change, Placement, Refusal } from './types';

export interface CreateRequest {
	/** The selection, in offsets of `doc.text`. Either order. */
	from: number;
	to: number;
	comment: string;
	placement: Placement;
}

export interface CreatePlan {
	id: string;
	/** In offsets of `doc.text`, sorted, ready for one transaction. */
	changes: Change[];
	/** The Target the selection was adjusted to, in offsets of `doc.text`. */
	target: { from: number; to: number };
	/** Just after the new `}[^rN]`, in offsets of the text after the changes. */
	caret: number;
}

const ANY_REVIEW_LABEL = /\[\^r(\d+)\]/g;

function refuse(refusal: Refusal['refusal'], message: string): Refusal {
	return { refusal, message };
}

const lineStartOf = (text: string, at: number) => text.lastIndexOf('\n', at - 1) + 1;
function lineAt(text: string, at: number): string {
	const start = lineStartOf(text, at);
	const end = text.indexOf('\n', start);
	return text.slice(start, end < 0 ? text.length : end);
}

/** The highest `rN` used anywhere in the note, plus one. */
export function nextId(text: string): string {
	let max = 0;
	for (const m of text.matchAll(ANY_REVIEW_LABEL)) max = Math.max(max, Number(m[1]));
	return `r${max + 1}`;
}

/** Trims the selection and moves its start past list, quote and heading markers. */
function adjustSelection(text: string, from: number, to: number): { from: number; to: number } {
	let f = Math.min(from, to);
	let t = Math.max(from, to);
	const trim = () => {
		while (f < t && /\s/.test(text[f] ?? '')) f++;
		while (t > f && /\s/.test(text[t - 1] ?? '')) t--;
	};
	trim();
	const prefix = blockPrefixLength(lineAt(text, f));
	if (f - lineStartOf(text, f) < prefix) {
		f = lineStartOf(text, f) + prefix;
		trim();
	}
	return { from: f, to: Math.max(f, t) };
}

/** Why `[f, t)` can't be a Target, or null if it can. */
function checkTarget(doc: AnnotationDoc, f: number, t: number): Refusal | null {
	const { text } = doc;
	if (f >= t) return refuse('empty-selection', 'select the text to annotate first.');

	const span = text.slice(f, t);
	if (/\n[ \t]*\n/.test(span)) return refuse('crosses-blocks', 'a Target must stay within one paragraph.');
	for (let nl = span.indexOf('\n'); nl >= 0; nl = span.indexOf('\n', nl + 1)) {
		const next = lineAt(text, f + nl + 1);
		if (blockPrefixLength(next) > 0 || isTableLine(next)) {
			return refuse('crosses-blocks', 'a Target must stay within one paragraph.');
		}
	}
	if (headingStarts(text).includes(lineStartOf(text, f)) && span.includes('\n')) {
		return refuse('crosses-blocks', 'a Target must stay within one paragraph.');
	}

	const definitions = [
		...doc.annotations.flatMap((a) => (a.definition ? [a.definition] : [])),
		...doc.orphanDefinitions,
	];
	for (const d of definitions) {
		if (f <= d.to && t >= d.from) return refuse('in-definition', `the selection includes the comment of [^${d.id}].`);
	}

	for (const a of doc.annotations) {
		const inMarker = (x: number) => x > a.close && x < a.markerEnd;
		if (inMarker(f) || inMarker(t)) return refuse('overlaps-annotation', `the selection starts or ends inside the marker [^${a.id}].`);
		const startsInside = a.open < f && f < a.markerEnd;
		const endsInside = a.open < t && t < a.markerEnd;
		if (startsInside !== endsInside) return refuse('overlaps-annotation', `the selection overlaps annotation [^${a.id}].`);
	}

	let depth = 0;
	for (let i = f; i < t; i++) {
		const c = text[i];
		if (c === '\\') i++;
		else if (c === '{') depth++;
		else if (c === '}' && --depth < 0) break;
	}
	if (depth !== 0) return refuse('unbalanced-braces', 'the selection has an unmatched { or }.');
	return null;
}

const isWhitespace = (c: string | undefined) => c !== undefined && /\s/.test(c);

/** Where the new definition goes, as one insert. `targetEnd` is where the Target ends. */
export function placeDefinition(doc: AnnotationDoc, targetEnd: number, placement: Placement, def: string): Change {
	const { text } = doc;
	const reviewDefEnds = new Set(
		[...doc.annotations.flatMap((a) => (a.definition ? [a.definition] : [])), ...doc.orphanDefinitions].map((d) => d.to),
	);

	if (placement === 'end-of-note' && reviewDefEnds.size > 0) {
		const at = Math.max(...reviewDefEnds);
		return { from: at, to: at, insert: '\n' + def };
	}

	const sectionEnd =
		placement === 'end-of-section' ? (headingStarts(text).find((h) => h > targetEnd) ?? text.length) : text.length;
	let at = sectionEnd;
	while (at > targetEnd && isWhitespace(text[at - 1])) at--;

	let insert = (reviewDefEnds.has(at) ? '\n' : '\n\n') + def;
	if (sectionEnd < text.length) {
		const gapNewlines = text.slice(at, sectionEnd).split('\n').length - 1;
		insert += '\n'.repeat(Math.max(0, 2 - gapNewlines));
	}
	return { from: at, to: at, insert };
}

/**
 * Plans a new Annotation over a selection: `{` before the Target, `}[^rN]` after it, and the
 * definition at the end of the Target's section (before the next heading of any level, after any
 * review definitions already there) or at the end of the note. The new ID is the highest + 1.
 */
export function planCreate(doc: AnnotationDoc, req: CreateRequest): CreatePlan | Refusal {
	const { text } = doc;
	const target = adjustSelection(text, req.from, req.to);
	const refusal = checkTarget(doc, target.from, target.to);
	if (refusal) return refusal;

	const id = nextId(text);
	const marker = `}[^${id}]`;
	const changes: Change[] = [
		{ from: target.from, to: target.from, insert: '{' },
		{ from: target.to, to: target.to, insert: marker },
		placeDefinition(doc, target.to, req.placement, definitionText(id, req.comment)),
	];
	return { id, changes, target, caret: target.to + 1 + marker.length };
}
