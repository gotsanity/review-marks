import type { Annotation, AnnotationDoc, Change, Definition, Refusal } from './types';

export interface RemovePlan {
	/** In offsets of `doc.text`, sorted. */
	changes: Change[];
}

/** The Annotation with this ID, or its definition if it has no marker. */
function find(doc: AnnotationDoc, id: string): { annotation: Annotation | null; definition: Definition | null } | null {
	const annotation = doc.annotations.find((a) => a.id === id);
	if (annotation) return { annotation, definition: annotation.definition };
	const orphan = doc.orphanDefinitions.find((d) => d.id === id);
	return orphan ? { annotation: null, definition: orphan } : null;
}

/**
 * Deletes a definition with its line break, and the blank line it leaves when it stood alone
 * between blank lines. At the end of the note, the blank lines before it go too.
 */
function definitionRemoval(text: string, d: Definition): Change {
	let from = d.from;
	let to = d.to;
	if (text[to] === '\n') to++;
	if (to >= text.length) {
		while (from > 1 && text[from - 1] === '\n' && text[from - 2] === '\n') from--;
	} else if (text[to] === '\n' && (from === 0 || (text[from - 1] === '\n' && text[from - 2] === '\n'))) {
		to++;
	}
	return { from, to, insert: '' };
}

/**
 * Plans removing an Annotation: its `{`, its `}[^rN]` and its definition go, the Target text
 * stays. A definition with no marker is removed on its own.
 */
export function planRemove(doc: AnnotationDoc, id: string): RemovePlan | Refusal {
	const found = find(doc, id);
	if (!found) return { refusal: 'not-found', message: `there is no annotation [^${id}] in this note.` };
	const changes: Change[] = [];
	const a = found.annotation;
	if (a) changes.push({ from: a.open, to: a.open + 1, insert: '' }, { from: a.close, to: a.markerEnd, insert: '' });
	if (found.definition) changes.push(definitionRemoval(doc.text, found.definition));
	return { changes: changes.sort((x, y) => x.from - y.from) };
}
