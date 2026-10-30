import { describe, expect, it } from 'vitest';
import { hiddenComments, linkSpans, syntaxRanges } from './index';

const shown = (text: string) => linkSpans(text).map((l) => [l.kind, text.slice(l.from, l.to), text.slice(l.textFrom, l.textTo)]);

describe('linkSpans', () => {
	it('finds wikilinks, aliases and embeds with the text each renders', () => {
		expect(shown('See [[Note]], [[Note|the note]], [[A\\|B]] and ![[Pic.png]].')).toEqual([
			['wikilink', '[[Note]]', 'Note'],
			['wikilink', '[[Note|the note]]', 'the note'],
			['wikilink', '[[A\\|B]]', 'B'],
			['embed', '![[Pic.png]]', ''],
		]);
	});

	it('finds Markdown links and images, with brackets and parentheses inside', () => {
		expect(shown('A [link [x]](https://a.b/(c)) and ![alt](p.png).')).toEqual([
			['markdown-link', '[link [x]](https://a.b/(c))', 'link [x]'],
			['image', '![alt](p.png)', ''],
		]);
	});

	it('finds autolinks, bare URLs and footnote references, review markers flagged', () => {
		expect(shown('<https://a.b> or https://c.d/e. Note[^1] and {x}[^r2], not [^3]: def')).toEqual([
			['autolink', '<https://a.b>', 'https://a.b'],
			['url', 'https://c.d/e', 'https://c.d/e'],
			['footnote', '[^1]', '1'],
			['footnote', '[^r2]', 'r2'],
		]);
		expect(linkSpans('{x}[^r2]')[0]?.review).toBe(true);
		expect(linkSpans('x[^r]')[0]?.review).toBe(false);
	});

	it('keeps review markers out of the link ranges a Target must not end in', () => {
		expect(syntaxRanges('{x}[^r2] and y[^1]').map((r) => [r.kind, r.from, r.to])).toEqual([['link', 14, 18]]);
	});
});

describe('hiddenComments', () => {
	it('finds Obsidian %% comments and HTML comments, across lines', () => {
		const text = 'A %%hidden%% b <!-- also\nhidden --> c.';
		expect(hiddenComments(text).map((r) => text.slice(r.from, r.to))).toEqual(['%%hidden%%', '<!-- also\nhidden -->']);
	});
});
