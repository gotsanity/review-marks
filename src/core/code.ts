// Code in a note: frontmatter, fenced code blocks and inline code spans, where braces, headings
// and `[^rN]:` lines are not markup.
import { codeLines } from './sections';

/**
 * Marks every offset of `text` that is code: frontmatter and fenced code blocks (whole lines,
 * fences included) and inline code spans (backticks included). An inline span is a run of
 * backticks closed by a run of the same length within its paragraph; `\`` outside code is
 * escaped.
 */
export function codeMask(text: string): Uint8Array {
	const mask = blockMask(text);
	for (const s of spansOutside(text, mask)) mask.fill(1, s.from, s.to);
	return mask;
}

/** An inline code span `[from, to)`, its `ticks` backticks at each end included. */
export interface CodeSpan {
	from: number;
	to: number;
	ticks: number;
}

/** The inline code spans of `text`, outside frontmatter and fenced code blocks (see `codeMask`). */
export function codeSpans(text: string): CodeSpan[] {
	return spansOutside(text, blockMask(text));
}

/** Marks the frontmatter and fenced code block lines of `text`. */
function blockMask(text: string): Uint8Array {
	const mask = new Uint8Array(text.length);
	const lines = text.split('\n');
	const inCode = codeLines(lines);
	let from = 0;
	lines.forEach((line, i) => {
		if (inCode[i]) mask.fill(1, from, from + line.length + 1);
		from += line.length + 1;
	});
	return mask;
}

/** The inline code spans outside the code `mask`. Marks each in `mask` as it is found. */
function spansOutside(text: string, mask: Uint8Array): CodeSpan[] {
	const out: CodeSpan[] = [];
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (mask[i]) continue;
		if (c === '\\') {
			i++;
			continue;
		}
		if (c !== '`') continue;
		let ticks = 1;
		while (text[i + ticks] === '`') ticks++;
		const close = closingRun(text, mask, i + ticks, ticks);
		if (close < 0) {
			i += ticks - 1;
			continue;
		}
		out.push({ from: i, to: close + ticks, ticks });
		mask.fill(1, i, close + ticks);
		i = close + ticks - 1;
	}
	return out;
}

/** Start of the run of exactly `ticks` backticks that closes a span opened before `from`, or -1. */
function closingRun(text: string, mask: Uint8Array, from: number, ticks: number): number {
	for (let j = from; j < text.length; j++) {
		if (mask[j]) return -1;
		if (text[j] === '\n') {
			const end = text.indexOf('\n', j + 1);
			if (text.slice(j + 1, end < 0 ? text.length : end).trim() === '') return -1;
		}
		if (text[j] !== '`') continue;
		let run = 1;
		while (text[j + run] === '`') run++;
		if (run === ticks) return j;
		j += run - 1;
	}
	return -1;
}
