import { describe, expect, it } from 'vitest';
import { isDelimiterRow, tableCells } from './index';

const texts = (line: string) => tableCells(line).map((c) => line.slice(c.from, c.to));

describe('tableCells', () => {
	it('splits a row into trimmed cells, dropping the outer borders', () => {
		expect(texts('| Doreth Kell | Wisdom save | {17 (fail)}[^r9] | Hold Monster |')).toEqual([
			'Doreth Kell',
			'Wisdom save',
			'{17 (fail)}[^r9]',
			'Hold Monster',
		]);
	});

	it('keeps an escaped \\| inside its cell', () => {
		expect(texts('| {[[malas-vance\\|Malas Vance]] (the Peddler)}[^r8] | Duke |')).toEqual([
			'{[[malas-vance\\|Malas Vance]] (the Peddler)}[^r8]',
			'Duke',
		]);
	});

	it('handles rows without outer borders and empty cells', () => {
		expect(texts('a | | b')).toEqual(['a', '', 'b']);
	});

	it('gives offsets in the line', () => {
		expect(tableCells('| ab |  c |')).toEqual([
			{ from: 2, to: 4 },
			{ from: 8, to: 9 },
		]);
	});
});

describe('isDelimiterRow', () => {
	it('tells the delimiter row from a content row', () => {
		expect(isDelimiterRow('|------|:---:|')).toBe(true);
		expect(isDelimiterRow('| Name | Role |')).toBe(false);
	});
});
