// Which source characters show up in rendered HTML. Pure text: no DOM, no Obsidian. The syntax
// itself (code, links, comments, block markers) is found by the core; this only says what of it
// renders.
import {
	blockPrefixLength,
	codeBlocks,
	codeMask,
	codeSpans,
	hiddenComments,
	isDelimiterRow,
	isTableLine,
	lineStarts,
	linkSpans,
	parse,
} from '../core';

/** Never rendered: block markers, link targets, footnote brackets, definitions. */
export const HIDDEN = 0;
/** Rendered as itself. */
export const TEXT = 1;
/** Markup that may or may not be rendered: `*_~=` and backticks, `\`, `|`, `#`, our braces, footnote labels. */
export const SOFT = 2;

const SOFT_CHARS = '*_~=`\\|#{}';

/** A link, embed or wikilink in source offsets. A selection end inside one moves to its edge. */
export interface LinkRange {
	from: number;
	to: number;
}

export interface Visibility {
	/** One of HIDDEN, TEXT or SOFT per character of the text. */
	kind: Uint8Array;
	links: LinkRange[];
}

/** Classifies every character of LF note text by whether it renders. */
export function visibility(text: string): Visibility {
	const kind = new Uint8Array(text.length).fill(TEXT);
	const set = (from: number, to: number, k: number) => kind.fill(k, Math.max(0, from), Math.min(text.length, to));
	for (let i = 0; i < text.length; i++) if (SOFT_CHARS.includes(text[i] ?? '')) kind[i] = SOFT;

	// Lines: block prefixes and table delimiter rows, outside code blocks.
	const lines = text.split('\n');
	const starts = lineStarts(text);
	const lineEnd = (i: number) => (starts[i] ?? 0) + (lines[i]?.length ?? 0);
	const blocks = codeBlocks(lines);
	const inBlock = new Uint8Array(lines.length);
	for (const b of blocks) inBlock.fill(1, b.first, b.last + 1);
	lines.forEach((line, i) => {
		if (inBlock[i]) return;
		const start = starts[i] ?? 0;
		if (isTableLine(line) && isDelimiterRow(line)) set(start, lineEnd(i), HIDDEN);
		else set(start, start + blockPrefixLength(line), HIDDEN);
	});
	// Frontmatter never renders; a fenced block renders its content as is, but not its fences.
	for (const b of blocks) {
		if (b.kind === 'frontmatter') {
			set(starts[b.first] ?? 0, lineEnd(b.last), HIDDEN);
			continue;
		}
		set(starts[b.first] ?? 0, lineEnd(b.last), TEXT);
		set(starts[b.first] ?? 0, lineEnd(b.first), HIDDEN);
		if (b.closed && b.last > b.first) set(starts[b.last] ?? 0, lineEnd(b.last), HIDDEN);
	}

	// Code spans render their content as is; only the backticks are markup.
	for (const s of codeSpans(text)) set(s.from + s.ticks, s.to - s.ticks, TEXT);

	const inCode = codeMask(text);
	for (const c of hiddenComments(text, inCode)) set(c.from, c.to, HIDDEN);

	const links: LinkRange[] = [];
	for (const l of linkSpans(text, inCode)) {
		if (l.kind === 'footnote') {
			// The brackets never render, the label may (`r8` in a Live Preview table).
			set(l.from, l.textFrom, HIDDEN);
			set(l.textTo, l.to, HIDDEN);
			set(l.textFrom, l.textTo, SOFT);
			continue;
		}
		set(l.from, l.textFrom, HIDDEN);
		set(l.textTo, l.to, HIDDEN);
		links.push({ from: l.from, to: l.to });
	}

	// Review definitions never render in the note body.
	const doc = parse(text);
	for (const d of [...doc.annotations.flatMap((a) => (a.definition ? [a.definition] : [])), ...doc.orphanDefinitions]) {
		set(d.from, d.to, HIDDEN);
	}
	return { kind, links };
}
