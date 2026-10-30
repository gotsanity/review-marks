import { codeMask } from './code';
import { definitionText } from './definition';
import { blockPrefixLength, headingStarts, isTableLine } from './sections';
import { cellBorders } from './tables';
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

/** Trims the selection, moves its start past list, quote and heading markers, and its end back before them. */
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
	const endLine = lineStartOf(text, t);
	if (endLine > f && t - endLine <= blockPrefixLength(lineAt(text, t))) {
		t = endLine;
		trim();
	}
	return { from: f, to: Math.max(f, t) };
}

/** Why `[f, t)` can't be a Target, or null if it can. */
function checkTarget(doc: AnnotationDoc, f: number, t: number): Refusal | null {
	const { text } = doc;
	if (f >= t) return refuse('empty-selection', 'select the text to annotate first.');

	const span = text.slice(f, t);
	const inCode = codeMask(text);
	const onCodeLine = (at: number) => inCode[lineStartOf(text, at)] === 1;
	const insideSpan = (at: number) => inCode[at - 1] === 1 && inCode[at] === 1;
	if (onCodeLine(f) || onCodeLine(t - 1) || insideSpan(f) || insideSpan(t)) {
		return refuse('in-code', "a Target can't start or end in code.");
	}
	if (span.includes('\n')) {
		for (let at = lineStartOf(text, f); at < t; at = text.indexOf('\n', at) + 1 || t) {
			if (isTableLine(lineAt(text, at))) return refuse('crosses-blocks', "a Target can't span table rows.");
		}
	}
	if (isTableLine(lineAt(text, f)) && cellBorders(span).length > 0) {
		return refuse('crosses-table-cells', 'a Target must stay within one table cell.');
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
		if (inCode[i]) continue;
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
	// Headings and `[^rN]:` lines in fenced code or frontmatter are not markup.
	const inCode = codeMask(text);
	const reviewDefs = [
		...doc.annotations.flatMap((a) => (a.definition ? [a.definition] : [])),
		...doc.orphanDefinitions,
	].filter((d) => !inCode[d.from]);
	const reviewDefEnds = new Set(reviewDefs.map((d) => d.to));

	/** Joins the list of review definitions ending at `end`, before the first one whose marker comes later. */
	const joinList = (end: number): Change => {
		const byEnd = new Map(reviewDefs.map((d) => [d.to, d]));
		const markerOf = new Map(doc.annotations.map((a) => [a.definition, a.close]));
		let before: number | null = null;
		for (let d = byEnd.get(end); d; d = byEnd.get(d.from - 1)) {
			const close = markerOf.get(d);
			if (close !== undefined && close > targetEnd) before = d.from;
		}
		return before === null ? { from: end, to: end, insert: '\n' + def } : { from: before, to: before, insert: def + '\n' };
	};

	if (placement === 'end-of-note' && reviewDefEnds.size > 0) return joinList(Math.max(...reviewDefEnds));

	const sectionEnd =
		placement === 'end-of-section' ? (headingStarts(text).find((h) => h > targetEnd && !inCode[h]) ?? text.length) : text.length;
	let at = sectionEnd;
	while (at > targetEnd && isWhitespace(text[at - 1])) at--;

	if (reviewDefEnds.has(at)) {
		const joined = joinList(at);
		if (joined.from !== at) return joined;
	}
	let insert = (reviewDefEnds.has(at) ? '\n' : '\n\n') + def;
	if (sectionEnd < text.length) {
		const gapNewlines = text.slice(at, sectionEnd).split('\n').length - 1;
		insert += '\n'.repeat(Math.max(0, 2 - gapNewlines));
	}
	return { from: at, to: at, insert };
}

/**
 * Plans a new Annotation over a selection, which may span blocks or sit in a heading but can't
 * start or end in code: `{` before the Target, `}[^rN]` after it, and the definition at the end
 * of the section where the Target ends (before the next heading of any level, among any
 * review definitions already there in the reading order of their markers) or at the end of the note.
 * The new ID is the highest + 1.
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
