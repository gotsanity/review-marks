// Pipe tables: rows, cells and the borders a Target must not cross.
import { isTableLine } from './sections';

/** Offsets of the unescaped `|` cell borders in `s`. `\|` (as in `[[note\|alias]]`) is not a border. */
export function cellBorders(s: string): number[] {
	const out: number[] = [];
	for (let i = 0; i < s.length; i++) {
		if (s[i] === '\\') i++;
		else if (s[i] === '|') out.push(i);
	}
	return out;
}

/** Is this line a table's `|---|:--:|` delimiter row? */
export function isDelimiterRow(line: string): boolean {
	return isTableLine(line) && line.includes('-') && /^[\s|:-]+$/.test(line);
}

/** One cell of a table row: its content in line offsets, padding trimmed. Empty cells have `from === to`. */
export interface CellRange {
	from: number;
	to: number;
}

/** The cells of a table row, in order, with their padding trimmed. Leading and trailing `|` are optional. */
export function tableCells(line: string): CellRange[] {
	const borders = cellBorders(line);
	const cuts = [-1, ...borders, line.length];
	const cells: CellRange[] = [];
	for (let k = 0; k + 1 < cuts.length; k++) {
		let from = (cuts[k] ?? 0) + 1;
		let to = cuts[k + 1] ?? line.length;
		while (from < to && /\s/.test(line[from] ?? '')) from++;
		while (to > from && /\s/.test(line[to - 1] ?? '')) to--;
		cells.push({ from, to });
	}
	const first = borders[0];
	const last = borders[borders.length - 1];
	if (last !== undefined && line.slice(last + 1).trim() === '') cells.pop();
	if (first !== undefined && line.slice(0, first).trim() === '') cells.shift();
	return cells;
}
