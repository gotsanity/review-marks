import { planRemove } from './plan-remove';
import { isRefusal, type Annotation, type AnnotationDoc, type Change } from './types';

export interface BackspacePlan {
	/** `delete` takes the Target's last character; `remove` takes the whole Annotation. */
	kind: 'delete' | 'remove';
	/** In offsets of `doc.text`, sorted. */
	changes: Change[];
	/** Where the cursor goes, in offsets of the text after the changes. */
	caret: number;
}

/** Where the last character of `s` starts: one code point back, a surrogate pair counted whole. */
function lastCodePointStart(s: string): number {
	const low = s.charCodeAt(s.length - 1);
	const high = s.charCodeAt(s.length - 2);
	return low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff ? s.length - 2 : s.length - 1;
}

/**
 * The Annotation whose marker ends at `pos`. Of nested ones ending together,
 * `{x {ab}[^r1]}[^r2]|`, the innermost.
 */
function innermostEndingAt(annotations: readonly Annotation[], pos: number): Annotation | undefined {
	let found: Annotation | undefined;
	let end = pos;
	for (let a = annotations.find((x) => x.markerEnd === end); a; a = annotations.find((x) => x.markerEnd === end)) {
		found = a;
		end = a.close;
	}
	return found;
}

/**
 * Backspace with the cursor just after a `}[^rN]`, where Live Preview hides the syntax: deletes
 * the last character of the Target instead of the invisible `]`. If the Target would become
 * empty, the whole Annotation goes: braces, marker and definition. Null means a normal Backspace.
 *
 * `lastCluster(target)` gives where the Target's last character starts; the editor passes its own
 * grapheme rule. By default it is one code point.
 */
export function backspaceAt(
	doc: AnnotationDoc,
	pos: number,
	lastCluster: (target: string) => number = lastCodePointStart,
): BackspacePlan | null {
	const a = innermostEndingAt(doc.annotations, pos);
	if (!a) return null;

	const start = a.open + 1;
	const target = doc.text.slice(start, a.close);
	if (!target) return null;
	let from = start + lastCluster(target);
	// Don't leave a lone `\` that would escape the `}`.
	if (from > start && doc.text[from - 1] === '\\') from--;

	if (from > start) {
		return { kind: 'delete', changes: [{ from, to: a.close, insert: '' }], caret: pos - (a.close - from) };
	}
	const plan = planRemove(doc, a.id);
	if (isRefusal(plan)) return null;
	const open = a.open;
	const markerEnd = a.markerEnd;
	const changes = [
		{ from: open, to: markerEnd, insert: '' },
		...plan.changes.filter((c) => c.from < open || c.from >= markerEnd),
	];
	const removedBefore = changes.filter((c) => c.to <= open).reduce((n, c) => n + c.to - c.from, 0);
	return { kind: 'remove', changes: changes.sort((x, y) => x.from - y.from), caret: open - removedBefore };
}
