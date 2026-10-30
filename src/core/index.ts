// The annotation core: every format rule, on plain LF text. No Obsidian or editor imports.
export type { Annotation, AnnotationDoc, Change, Definition, Placement, Refusal, RefusalReason } from './types';
export { isRefusal } from './types';
export { parse, normalizeLineEndings } from './parse';
export { applyChanges } from './changes';
export { definitionText, excerpt, normalizeComment } from './definition';
export { blockPrefixLength, isTableLine } from './sections';
export { planCreate, nextId, type CreatePlan, type CreateRequest } from './plan-create';
