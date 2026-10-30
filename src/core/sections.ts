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
