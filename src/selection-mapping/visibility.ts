// Which source characters show up in rendered HTML. Pure text: no DOM, no Obsidian.
import { blockPrefixLength, isDelimiterRow, isTableLine, parse } from '../core';

/** Never rendered: block markers, link targets, footnote brackets, definitions. */
export const HIDDEN = 0;
/** Rendered as itself. */
export const TEXT = 1;
/** Markup that may or may not be rendered: `*_~=` and backticks, `\`, `|`, `#`, our braces, footnote labels. */
export const SOFT = 2;

const SOFT_CHARS = '*_~=`\\|#{}';

/** A link, embed or wikilink in source offsets. A selection end inside one moves to its edge. */
export interface LinkSpan {
	from: number;
	to: number;
}

export interface Visibility {
	/** One of HIDDEN, TEXT or SOFT per character of the text. */
	kind: Uint8Array;
	links: LinkSpan[];
}

/** Classifies every character of LF note text by whether it renders. */
export function visibility(text: string): Visibility {
	const kind = new Uint8Array(text.length).fill(TEXT);
	const set = (from: number, to: number, k: number) => kind.fill(k, Math.max(0, from), Math.min(text.length, to));
	for (let i = 0; i < text.length; i++) if (SOFT_CHARS.includes(text[i] ?? '')) kind[i] = SOFT;

	// Lines: block prefixes, table delimiter rows and code fences.
	let inFence = false;
	for (let start = 0; start <= text.length; ) {
		const nl = text.indexOf('\n', start);
		const end = nl < 0 ? text.length : nl;
		const line = text.slice(start, end);
		if (/^[ \t]*(?:>[ \t]?)*(?:`{3,}|~{3,})/.test(line)) {
			set(start, end, HIDDEN);
			inFence = !inFence;
		} else if (inFence) {
			set(start, end, TEXT);
		} else if (isTableLine(line) && isDelimiterRow(line)) {
			set(start, end, HIDDEN);
		} else {
			set(start, start + blockPrefixLength(line), HIDDEN);
		}
		start = end + 1;
	}

	const frontmatter = /^---\n[\s\S]*?\n---(?=\n|$)/.exec(text);
	if (frontmatter) set(0, frontmatter[0].length, HIDDEN);

	// Code spans render their content as is; only the backticks are markup.
	const code = new Uint8Array(text.length);
	for (const m of text.matchAll(/(`+)(?!`)([^\n]*?[^`\n])\1(?!`)/g)) {
		const ticks = m[1]?.length ?? 1;
		set(m.index + ticks, m.index + m[0].length - ticks, TEXT);
		code.fill(1, m.index, m.index + m[0].length);
	}
	const each = (re: RegExp, f: (m: RegExpExecArray) => void) => {
		for (const m of text.matchAll(re)) if (!code[m.index]) f(m);
	};

	const links: LinkSpan[] = [];
	each(/%%[\s\S]*?%%|<!--[\s\S]*?-->/g, (m) => set(m.index, m.index + m[0].length, HIDDEN));
	// Footnote references: the brackets never render, the label may (`r8` in a Live Preview table).
	each(/\[\^([^\]\s]+)\](?!:)/g, (m) => {
		set(m.index, m.index + 2, HIDDEN);
		set(m.index + m[0].length - 1, m.index + m[0].length, HIDDEN);
		set(m.index + 2, m.index + m[0].length - 1, SOFT);
	});
	each(/!\[\[[^\]\n]*\]\]|!\[[^\]\n]*\]\([^)\n]*\)/g, (m) => {
		set(m.index, m.index + m[0].length, HIDDEN);
		links.push({ from: m.index, to: m.index + m[0].length });
	});
	each(/\[\[([^\]\n]*)\]\]/g, (m) => {
		if (text[m.index - 1] === '!') return;
		const from = m.index;
		const to = from + m[0].length;
		const bar = /\\?\|/.exec(m[1] ?? '');
		set(from, bar ? from + 2 + bar.index + bar[0].length : from + 2, HIDDEN);
		set(to - 2, to, HIDDEN);
		links.push({ from, to });
	});
	each(/\[([^\]\n]*)\]\(([^)\n]*)\)/g, (m) => {
		if (text[m.index - 1] === '!' || text[m.index - 1] === ']' || (m[1] ?? '').startsWith('^')) return;
		const from = m.index;
		const to = from + m[0].length;
		set(from, from + 1, HIDDEN);
		set(from + 1 + (m[1]?.length ?? 0), to, HIDDEN);
		links.push({ from, to });
	});

	// Review definitions never render in the note body.
	const doc = parse(text);
	for (const d of [...doc.annotations.flatMap((a) => (a.definition ? [a.definition] : [])), ...doc.orphanDefinitions]) {
		set(d.from, d.to, HIDDEN);
	}
	return { kind, links };
}
