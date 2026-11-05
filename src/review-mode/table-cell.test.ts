import { describe, expect, it } from 'vitest';
import { cellToNote } from './table-cell';

// The second row starts at 28, so "Doreth Kell" spans 30 to 41 and "failed the save" 44 to 59.
const TEXT = '| Name | Result |\n|---|---|\n| Doreth Kell | failed the save |\n';
const at = (s: string) => ({ from: TEXT.indexOf(s), to: TEXT.indexOf(s) + s.length });

describe('cellToNote', () => {
	it('adds the cell’s source start to an offset in the first cell of a row', () => {
		expect(cellToNote(TEXT, at('Doreth Kell'), 'Doreth Kell', { from: 7, to: 11 })).toEqual({ from: 37, to: 41 });
	});

	it('converts a selection in a cell that isn’t the first in its row, made right to left', () => {
		expect(cellToNote(TEXT, at('failed the save'), 'failed the save', { from: 15, to: 11 })).toEqual({ from: 55, to: 59 });
	});

	describe('fails with the table notice', () => {
		const failure = {
			failure: 'not-found',
			message: "can't annotate this table cell here. Select the text and use Annotate selection.",
		};

		it('when the cell editor’s text isn’t the cell’s source (the table changed under it)', () => {
			expect(cellToNote(TEXT, at('Doreth Kell'), 'Doreth Kel', { from: 0, to: 3 })).toEqual(failure);
		});

		it('when the selection runs past the cell’s text', () => {
			expect(cellToNote(TEXT, at('Doreth Kell'), 'Doreth Kell', { from: 7, to: 12 })).toEqual(failure);
		});
	});
});
