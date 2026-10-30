import { definitionText, normalizeComment } from './definition';
import { placeDefinition } from './plan-create';
import type { AnnotationDoc, Change, Placement, Refusal } from './types';

export interface EditCommentRequest {
	id: string;
	comment: string;
	/** Where the definition goes if it is missing. */
	placement: Placement;
}

export interface EditCommentPlan {
	/** In offsets of `doc.text`. */
	changes: Change[];
}

/**
 * Plans replacing an Annotation's Comment: its definition is rewritten in place, or added where a
 * new one would go if it is missing. An empty Comment is refused; removing is a separate action.
 */
export function planEditComment(doc: AnnotationDoc, req: EditCommentRequest): EditCommentPlan | Refusal {
	const { id } = req;
	if (normalizeComment(req.comment) === '') {
		return { refusal: 'empty-comment', message: 'a comment cannot be empty. To delete it, use Remove annotation.' };
	}
	const def = definitionText(id, req.comment);
	const a = doc.annotations.find((x) => x.id === id);
	const existing = a?.definition ?? doc.orphanDefinitions.find((d) => d.id === id);
	if (existing) return { changes: [{ from: existing.from, to: existing.to, insert: def }] };
	if (!a) return { refusal: 'not-found', message: `there is no annotation [^${id}] in this note.` };
	return { changes: [placeDefinition(doc, a.markerEnd, req.placement, def)] };
}
