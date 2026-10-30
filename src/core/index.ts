// The annotation core: every format rule, on plain LF text. No Obsidian or editor imports.
export type { Annotation, AnnotationDoc, Change, Definition, Placement, Refusal, RefusalReason } from './types';
export { isRefusal } from './types';
export { parse, normalizeLineEndings, lineStarts } from './parse';
export { footnoteListLabels, footnoteOrder, isReviewLabel } from './footnotes';
export { applyChanges } from './changes';
export { definitionText, excerpt, normalizeComment } from './definition';
export { blockPrefixLength, isTableLine } from './sections';
export { codeMask } from './code';
export { cellBorders, isDelimiterRow, tableCells, type CellRange } from './tables';
export { planCreate, nextId, type CreatePlan, type CreateRequest } from './plan-create';
export { planMoveComments, type MovePlan } from './plan-move';
export { lineChanges } from './line-diff';
export { planRemove, type RemovePlan } from './plan-remove';
export { planEditComment, type EditCommentPlan, type EditCommentRequest } from './plan-edit-comment';
export { backspaceAt, type BackspacePlan } from './backspace';
export { annotationAt, adjacentAnnotation, type AnnotationAtCursor } from './navigate';
