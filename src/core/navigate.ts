import type { Annotation, AnnotationDoc, Definition } from './types';

/** What the cursor is on: an Annotation, or a definition whose marker is missing. */
export type AnnotationAtCursor = { id: string; annotation: Annotation | null; definition: Definition | null };

/**
 * The Annotation at an offset: the innermost one whose `{` … `}[^rN]` contains it (from just
 * before `{` to just after the marker), else the one whose definition contains it.
 */
export function annotationAt(doc: AnnotationDoc, pos: number): AnnotationAtCursor | null {
	const around = doc.annotations
		.filter((a) => a.open <= pos && pos <= a.markerEnd)
		.sort((x, y) => x.markerEnd - x.open - (y.markerEnd - y.open))[0];
	if (around) return { id: around.id, annotation: around, definition: around.definition };
	const byDefinition = doc.annotations.find((a) => a.definition && a.definition.from <= pos && pos <= a.definition.to);
	if (byDefinition) return { id: byDefinition.id, annotation: byDefinition, definition: byDefinition.definition };
	const orphan = doc.orphanDefinitions.find((d) => d.from <= pos && pos <= d.to);
	return orphan ? { id: orphan.id, annotation: null, definition: orphan } : null;
}

/**
 * The Annotation whose Target starts next after `pos`, or last before it, in reading order.
 * Wraps around at either end. Null if the note has none.
 */
export function adjacentAnnotation(doc: AnnotationDoc, pos: number, direction: 'next' | 'previous'): Annotation | null {
	const list = doc.annotations;
	if (direction === 'next') return list.find((a) => a.open + 1 > pos) ?? list[0] ?? null;
	return [...list].reverse().find((a) => a.open + 1 < pos) ?? list[list.length - 1] ?? null;
}
