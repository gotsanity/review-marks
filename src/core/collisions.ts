// Other plugins' syntax in a note: Templater tags, whose braces are JavaScript, and Excalidraw
// drawings, which the plugin leaves alone.
import { codeMask } from './code';
import { blockPrefixLength } from './sections';

/** Ranges `[from, to)` of Templater tags `<% … %>` outside code, delimiters included. Unclosed tags are text. */
export function templaterTags(text: string, inCode: Uint8Array = codeMask(text)): { from: number; to: number }[] {
	const out: { from: number; to: number }[] = [];
	for (let i = text.indexOf('<%'); i >= 0; i = text.indexOf('<%', i)) {
		if (inCode[i]) {
			i += 2;
			continue;
		}
		const close = text.indexOf('%>', i + 2);
		if (close < 0) break;
		out.push({ from: i, to: close + 2 });
		i = close + 2;
	}
	return out;
}

/**
 * Marks every offset where `{`, `}` and `[^rN]` are not Annotation syntax: code (see `codeMask`)
 * and Templater tags, which hold JavaScript with braces of their own.
 */
export function notMarkupMask(text: string): Uint8Array {
	const mask = codeMask(text);
	for (const t of templaterTags(text, mask)) mask.fill(1, t.from, t.to);
	return mask;
}

/** Syntax of other plugins and of Markdown that a Target's `{` or `}[^rN]` must not land in. */
export type SyntaxKind = 'math' | 'template' | 'dataview' | 'link' | 'html';

export interface SyntaxRange {
	kind: SyntaxKind;
	from: number;
	to: number;
	/** A whole-line Dataview field: its line's start and end count as inside too. */
	wholeLine?: boolean;
}

const regexRanges = (text: string, re: RegExp, kind: SyntaxKind): SyntaxRange[] =>
	[...text.matchAll(re)].map((m) => ({ kind, from: m.index, to: m.index + m[0].length }));

/** Is the `$` at `i` escaped by an odd run of backslashes? */
function escaped(text: string, i: number): boolean {
	let n = 0;
	while (text[i - 1 - n] === '\\') n++;
	return n % 2 === 1;
}

/**
 * Inline `$…$` and block `$$…$$` math. Inline math opens on a `$` not followed by a space and
 * closes on the next `$` not preceded by a space nor followed by a digit, within its paragraph.
 */
function mathRanges(text: string, skip: Uint8Array): SyntaxRange[] {
	const out: SyntaxRange[] = [];
	const isDollar = (j: number) => text[j] === '$' && !skip[j] && !escaped(text, j);
	for (let i = 0; i < text.length; i++) {
		if (!isDollar(i)) continue;
		if (text[i + 1] === '$') {
			let j = i + 2;
			while (j < text.length && !(isDollar(j) && text[j + 1] === '$')) j++;
			if (j >= text.length) break;
			out.push({ kind: 'math', from: i, to: j + 2 });
			i = j + 1;
			continue;
		}
		if (/\s/.test(text[i + 1] ?? ' ')) continue;
		for (let j = i + 1; j < text.length; j++) {
			if (text[j] === '\n' && /^[ \t]*(\n|$)/.test(text.slice(j + 1, j + 80))) break;
			if (!isDollar(j) || /\s/.test(text[j - 1] ?? '') || /\d/.test(text[j + 1] ?? '')) continue;
			out.push({ kind: 'math', from: i, to: j + 1 });
			i = j;
			break;
		}
	}
	return out;
}

/** Dataview's bracketed inline fields `[key:: value]` and `(key:: value)`, up to the matching bracket. */
function bracketedFields(text: string): SyntaxRange[] {
	const out: SyntaxRange[] = [];
	const KEY = /[[(][^[\]()\n]+?::/y;
	for (let i = 0; i < text.length; i++) {
		const open = text[i];
		if (open !== '[' && open !== '(') continue;
		KEY.lastIndex = i;
		if (!KEY.test(text)) continue;
		const close = open === '[' ? ']' : ')';
		let depth = 0;
		for (let j = i; j < text.length && text[j] !== '\n'; j++) {
			if (text[j] === open) depth++;
			else if (text[j] === close && --depth === 0) {
				out.push({ kind: 'dataview', from: i, to: j + 1 });
				i = j;
				break;
			}
		}
	}
	return out;
}

/**
 * Dataview's whole-line fields, `key:: value` after any list, quote or emphasis marks, on lines
 * without a bracketed field (Dataview reads those first).
 */
function lineFields(text: string, bracketed: readonly SyntaxRange[]): SyntaxRange[] {
	const out: SyntaxRange[] = [];
	for (const m of text.matchAll(/^.*$/gm)) {
		const end = m.index + m[0].length;
		if (bracketed.some((b) => b.from >= m.index && b.from < end)) continue;
		const body = m[0].slice(blockPrefixLength(m[0]));
		if (/^[*_]*[\p{L}\p{N}_][^:\n[\]()]*?::/u.test(body)) {
			out.push({ kind: 'dataview', from: m.index, to: m.index + m[0].length, wholeLine: true });
		}
	}
	return out;
}

const LINKS = new RegExp(
	[
		/!?\[\[[^\]\n]*\]\]/.source, // wikilinks and embeds
		/!?\[(?:[^[\]\n]|\[[^[\]\n]*\])*\]\([^()\n]*(?:\([^()\n]*\)[^()\n]*)*\)/.source, // [text](url), images
		/<[a-z][a-z0-9+.-]*:[^<>\s]*>/.source, // <autolinks>
		/https?:\/\/[^\s<>()[\]{}]*[^\s<>()[\]{}.,;:!?'"*_~]/.source, // bare URLs
		/\[\^(?!r\d+\])[^\]\s]+\](?!:)/.source, // author footnote references; review markers are ours
	].join('|'),
	'gi',
);
const HTML = /<!--[\s\S]*?-->|<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/gi;

/**
 * Where a Target can't start or end without breaking other syntax: math, Templater `<% %>` and
 * Templates `{{ }}` tags, Dataview fields, links (wikilinks, Markdown links and images,
 * autolinks, bare URLs, footnote references) and HTML tags and comments. Code is never part of
 * any range.
 */
export function syntaxRanges(text: string): SyntaxRange[] {
	const inCode = codeMask(text);
	const bracketed = bracketedFields(text).filter((r) => !inCode[r.from]);
	const all = [
		...mathRanges(text, inCode),
		...templaterTags(text, inCode).map((t) => ({ kind: 'template' as const, ...t })),
		...regexRanges(text, /\{\{[^{}\n]*\}\}/g, 'template'),
		...bracketed,
		...lineFields(text, bracketed),
		...regexRanges(text, LINKS, 'link'),
		...regexRanges(text, HTML, 'html'),
	];
	return all.filter((r) => !inCode[r.from]);
}

/** Is the boundary `at` inside `r`? A plain range's own edges are outside; a whole line's are inside. */
export function boundaryInside(r: SyntaxRange, at: number): boolean {
	return r.wholeLine ? r.from <= at && at <= r.to : r.from < at && at < r.to;
}

/** Is this note an Excalidraw drawing (an `excalidraw-plugin` key in its frontmatter)? */
export function isExcalidraw(text: string): boolean {
	if (!text.startsWith('---\n')) return false;
	for (let at = 4; at < text.length; ) {
		const end = text.indexOf('\n', at);
		const line = text.slice(at, end < 0 ? text.length : end);
		if (line === '---' || line === '...') return false;
		if (/^excalidraw-plugin[ \t]*:/.test(line)) return true;
		if (end < 0) return false;
		at = end + 1;
	}
	return false;
}
