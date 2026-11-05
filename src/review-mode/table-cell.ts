// Review Mode in a Live Preview table cell: clicking a cell opens a small editor holding only that
// cell's text. Its selection is converted to note offsets here, so the Annotation is created in the
// note's own editor, never in the cell editor's copy. Pure.
import type { MappingFailure, SourceRange } from '../selection-mapping/selection-mapping';

/** The table notice, worded without dragging. Completes "Review Marks: …". */
export const TABLE_CELL_UNAVAILABLE = "can't annotate this table cell here. Select the text and use Annotate selection.";

/**
 * The note range of `range`, a selection in a cell editor whose text is `cellText`. `cell` is the
 * cell content's source range in the note `text`. Fails unless the cell editor holds exactly the
 * cell's source, so an offset in it is an offset in the note.
 */
export function cellToNote(text: string, cell: SourceRange, cellText: string, range: SourceRange): SourceRange | MappingFailure {
	const from = Math.min(range.from, range.to);
	const to = Math.max(range.from, range.to);
	if (text.slice(cell.from, cell.to) !== cellText || from < 0 || to > cellText.length) {
		return { failure: 'not-found', message: TABLE_CELL_UNAVAILABLE };
	}
	return { from: cell.from + from, to: cell.from + to };
}
