/** Leading list, quote, task and heading markers of a line, where a `{` must not go. */
const BLOCK_PREFIX = /^(?:[ \t]*(?:>[ \t]?|[-*+][ \t]+(?:\[.\][ \t]+)?|\d+[.)][ \t]+))*[ \t]*(?:#{1,6}[ \t]+)?/;

/** Length of a line's leading list, quote, task and heading markers and indentation. */
export function blockPrefixLength(line: string): number {
	return BLOCK_PREFIX.exec(line)?.[0].length ?? 0;
}

/** Is this line a table row? */
export function isTableLine(line: string): boolean {
	return /^\s*\|/.test(line);
}

const ATX_HEADING = /^#{1,6}(?:[ \t]|$)/gm;

/** Offsets of the line starts of ATX headings (any level). */
export function headingStarts(text: string): number[] {
	return [...text.matchAll(ATX_HEADING)].map((m) => m.index);
}

/** Is this line an ATX heading (any level)? */
export function isHeadingLine(line: string): boolean {
	return /^#{1,6}(?:[ \t]|$)/.test(line);
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * For each line, whether it is frontmatter or inside a fenced code block (fences included), where
 * a `#` line is not a heading and a `[^rN]:` line is not a definition. An unclosed fence runs to
 * the end of the note.
 */
export function codeLines(lines: readonly string[]): boolean[] {
	const out = lines.map(() => false);
	let i = 0;
	if (lines[0] === '---') {
		const close = lines.findIndex((l, j) => j > 0 && (l === '---' || l === '...'));
		if (close > 0) {
			out.fill(true, 0, close + 1);
			i = close + 1;
		}
	}
	for (; i < lines.length; i++) {
		const open = FENCE.exec(lines[i] ?? '');
		if (!open) continue;
		const fence = open[1] ?? '';
		let j = i + 1;
		while (j < lines.length) {
			const close = FENCE.exec(lines[j] ?? '');
			if (close && close[1]![0] === fence[0] && close[1]!.length >= fence.length && lines[j]!.trim() === close[0].trim()) break;
			j++;
		}
		out.fill(true, i, Math.min(j, lines.length - 1) + 1);
		i = j;
	}
	return out;
}
