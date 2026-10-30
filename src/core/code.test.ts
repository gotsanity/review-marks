import { describe, expect, it } from 'vitest';
import { codeBlocks, codeLines, codeMask, codeSpans } from './index';

describe('codeBlocks', () => {
	it('finds frontmatter and fenced blocks by line, and whether each fence is closed', () => {
		const lines = ['---', 'tags: x', '---', 'Text.', '```js', 'a {b}', '```', '', '~~~~', 'open'];
		expect(codeBlocks(lines)).toEqual([
			{ kind: 'frontmatter', first: 0, last: 2, closed: true },
			{ kind: 'fence', first: 4, last: 6, closed: true },
			{ kind: 'fence', first: 8, last: 9, closed: false },
		]);
		expect(codeLines(lines)).toEqual([true, true, true, false, true, true, true, false, true, true]);
	});

	it('closes a fence only with the same character, at least as long', () => {
		const lines = ['````', '```', '~~~~', '````'];
		expect(codeBlocks(lines)).toEqual([{ kind: 'fence', first: 0, last: 3, closed: true }]);
	});
});

describe('codeSpans', () => {
	it('finds inline code spans with their backtick runs', () => {
		const text = 'A `b` and ``c ` d`` e.';
		expect(codeSpans(text)).toEqual([
			{ from: 2, to: 5, ticks: 1 },
			{ from: 10, to: 19, ticks: 2 },
		]);
	});

	it('ignores spans in fenced blocks, escaped backticks and unclosed runs', () => {
		const text = '```\n`x`\n```\n\\`y and `z';
		expect(codeSpans(text)).toEqual([]);
	});

	it('does not close a span across a blank line', () => {
		expect(codeSpans('A `b\n\nc` d.')).toEqual([]);
		expect(codeSpans('A `b\nc` d.')).toEqual([{ from: 2, to: 7, ticks: 1 }]);
	});

	it('agrees with codeMask', () => {
		const text = 'A `b` c.';
		expect(Array.from(codeMask(text))).toEqual([0, 0, 1, 1, 1, 0, 0, 0]);
	});
});
