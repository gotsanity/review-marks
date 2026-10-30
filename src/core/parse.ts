import type { Annotation, AnnotationDoc, Definition } from './types';
import { isExcalidraw, notMarkupMask } from './collisions';

const DEFINITION_LINE = /^\[\^(r\d+)\]:[ \t]?(.*)$/;
const CONTINUATION = /^( {4}|\t)/;
const MARKER = /\}\[\^(r\d+)\](?!:)/y;

/** Converts CRLF and CR line breaks to LF. The core works on LF text only. */
export function normalizeLineEndings(text: string): string {
	return text.replace(/\r\n?/g, '\n');
}

/** Offsets where each line starts. */
export function lineStarts(text: string): number[] {
	const out = [0];
	for (let i = 0; i < text.length; i++) if (text[i] === '\n') out.push(i + 1);
	return out;
}

/** The 0-based line that `offset` is on, given the note's `lineStarts`. */
export function lineOfOffset(starts: readonly number[], offset: number): number {
	let lo = 0;
	let hi = starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if ((starts[mid] ?? 0) <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/** Every review definition (`[^rN]: …` plus continuation lines) outside code, in file order. */
function parseDefinitions(text: string, inCode: Uint8Array): Definition[] {
	const lines = text.split('\n');
	const starts = lineStarts(text);
	const out: Definition[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (inCode[starts[i] ?? 0]) continue;
		const m = DEFINITION_LINE.exec(lines[i] ?? '');
		if (!m) continue;
		const parts = [m[2] ?? ''];
		let last = i;
		for (let j = i + 1; j < lines.length; j++) {
			const line = lines[j] ?? '';
			if (CONTINUATION.test(line)) {
				parts.push(line.replace(CONTINUATION, ''));
				last = j;
			} else if (line.trim() === '' && CONTINUATION.test(lines[j + 1] ?? '')) {
				parts.push('');
			} else break;
		}
		const from = starts[i] ?? 0;
		const to = (starts[last] ?? 0) + (lines[last] ?? '').length;
		out.push({ id: m[1] ?? '', from, to, comment: parts.join('\n').trimEnd() });
		i = last;
	}
	return out;
}

/** A paired `{` … `}[^rN]`, whether or not its ID was used before. */
export interface MarkerOccurrence {
	id: string;
	open: number;
	close: number;
	markerEnd: number;
}

/**
 * Every review definition and every paired marker of the note in file order, duplicate IDs
 * included. Nothing in an Excalidraw drawing.
 */
export function scan(text: string): { definitions: Definition[]; markers: MarkerOccurrence[] } {
	if (isExcalidraw(text)) return { definitions: [], markers: [] };
	const skip = notMarkupMask(text);
	const definitions = parseDefinitions(text, skip);
	for (const d of definitions) skip.fill(1, d.from, d.to);

	const markers: MarkerOccurrence[] = [];
	const stack: number[] = [];
	for (let i = 0; i < text.length; i++) {
		if (skip[i]) continue;
		const c = text[i];
		if (c === '\\') {
			i++;
		} else if (c === '{') {
			stack.push(i);
		} else if (c === '}') {
			const open = stack.pop();
			MARKER.lastIndex = i;
			const m = MARKER.exec(text);
			if (!m || open === undefined) continue;
			const markerEnd = i + m[0].length;
			markers.push({ id: m[1] ?? '', open, close: i, markerEnd });
			i = markerEnd - 1;
		}
	}
	return { definitions, markers };
}

/**
 * Parses every Annotation in LF note text.
 *
 * A Target is `{` … `}[^rN]`, across blocks if need be: braces pair like brackets, so plain
 * `{pairs}` inside a Target stay balanced. Braces without a marker are plain text, `\{` and `\}`
 * are escaped, and definitions, code and Templater tags are never scanned for Targets.
 * When an ID is used twice, the first marker and the first definition win. An Excalidraw drawing
 * has no Annotations.
 */
export function parse(text: string): AnnotationDoc {
	const { definitions, markers } = scan(text);
	const firstDef = new Map<string, Definition>();
	for (const d of definitions) if (!firstDef.has(d.id)) firstDef.set(d.id, d);

	const annotations: Annotation[] = [];
	const seen = new Set<string>();
	for (const m of markers) {
		if (seen.has(m.id)) continue;
		seen.add(m.id);
		annotations.push({ ...m, definition: firstDef.get(m.id) ?? null });
	}
	annotations.sort((a, b) => a.open - b.open);
	const orphanDefinitions = [...firstDef.values()].filter((d) => !seen.has(d.id));
	return { text, annotations, orphanDefinitions };
}
