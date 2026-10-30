import type { Annotation, AnnotationDoc, Definition } from './types';

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

/** Every review definition (`[^rN]: …` plus continuation lines), in file order. */
function parseDefinitions(text: string): Definition[] {
	const lines = text.split('\n');
	const starts = lineStarts(text);
	const out: Definition[] = [];
	for (let i = 0; i < lines.length; i++) {
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

/**
 * Parses every Annotation in LF note text.
 *
 * A Target is `{` … `}[^rN]` within one block: braces pair like brackets, so plain `{pairs}`
 * inside a Target stay balanced, and a blank line drops any `{` still open. Braces without a
 * marker are plain text, `\{` and `\}` are escaped, and definitions are never scanned for Targets.
 * When an ID is used twice, the first marker and the first definition win.
 */
export function parse(text: string): AnnotationDoc {
	const definitions = parseDefinitions(text);
	const firstDef = new Map<string, Definition>();
	for (const d of definitions) if (!firstDef.has(d.id)) firstDef.set(d.id, d);

	const inDefinition = new Uint8Array(text.length);
	for (const d of definitions) inDefinition.fill(1, d.from, d.to);

	const annotations: Annotation[] = [];
	const seen = new Set<string>();
	let stack: number[] = [];
	for (let i = 0; i < text.length; i++) {
		if (inDefinition[i]) continue;
		const c = text[i];
		if (c === '\\') {
			i++;
		} else if (c === '\n') {
			const next = text.indexOf('\n', i + 1);
			if (text.slice(i + 1, next < 0 ? text.length : next).trim() === '') stack = [];
		} else if (c === '{') {
			stack.push(i);
		} else if (c === '}') {
			const open = stack.pop();
			MARKER.lastIndex = i;
			const m = MARKER.exec(text);
			if (!m || open === undefined) continue;
			const id = m[1] ?? '';
			const markerEnd = i + m[0].length;
			i = markerEnd - 1;
			if (seen.has(id)) continue;
			seen.add(id);
			annotations.push({ id, open, close: m.index, markerEnd, definition: firstDef.get(id) ?? null });
		}
	}
	annotations.sort((a, b) => a.open - b.open);
	const orphanDefinitions = [...firstDef.values()].filter((d) => !seen.has(d.id));
	return { text, annotations, orphanDefinitions };
}
