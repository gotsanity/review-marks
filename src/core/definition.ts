/**
 * Tidies a Comment as typed: LF line breaks, no leading blank lines, no trailing whitespace.
 */
export function normalizeComment(comment: string): string {
	return comment.replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '').trimEnd();
}

/** The definition block for a Comment: `[^id]: first line`, then each further line indented 4 spaces. */
export function definitionText(id: string, comment: string): string {
	const lines = normalizeComment(comment).split('\n');
	return lines
		.map((line, i) => {
			if (i === 0) return line ? `[^${id}]: ${line}` : `[^${id}]:`;
			return line.trim() === '' ? '' : '    ' + line;
		})
		.join('\n');
}

/**
 * The start of a Comment for a badge: its first line, cut to `length` characters. An ellipsis
 * marks a cut or further lines.
 */
export function excerpt(comment: string, length: number): string {
	const first = comment.split('\n')[0] ?? '';
	if (first.length <= length && !comment.includes('\n')) return first;
	return first.slice(0, length).trimEnd() + '…';
}
