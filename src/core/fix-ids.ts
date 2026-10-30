// Duplicate `rN` IDs, as left by applying a template or pasting annotated text: only the first
// use of an ID is read, so later Targets show as plain braces and their Comments are lost.
import { scan } from './parse';
import { nextId } from './plan-create';
import type { AnnotationDoc, Change, Refusal } from './types';

export interface FixIdsPlan {
	changes: Change[];
	/** Each renumbered use of an ID, in file order. */
	renamed: { from: string; to: string }[];
}

/** Every marker and definition of each ID, in file order, keyed in order of first use. */
function usesById(text: string): Map<string, { markers: number[]; definitions: number[]; first: number }> {
	const { markers, definitions } = scan(text);
	// Offsets of the label's `r`: `}[^rN]` and `[^rN]:`.
	const uses = [
		...markers.map((m) => ({ id: m.id, at: m.close + 3, marker: true })),
		...definitions.map((d) => ({ id: d.id, at: d.from + 2, marker: false })),
	].sort((a, b) => a.at - b.at);
	const out = new Map<string, { markers: number[]; definitions: number[]; first: number }>();
	for (const u of uses) {
		const entry = out.get(u.id) ?? { markers: [], definitions: [], first: u.at };
		(u.marker ? entry.markers : entry.definitions).push(u.at);
		out.set(u.id, entry);
	}
	return out;
}

/** IDs used by more than one marker or more than one definition, in order of first use. */
export function duplicateIds(doc: AnnotationDoc): string[] {
	return [...usesById(doc.text)].filter(([, u]) => u.markers.length > 1 || u.definitions.length > 1).map(([id]) => id);
}

/**
 * Plans renumbering duplicate IDs. The first marker and definition of an ID keep it; the k-th
 * marker and the k-th definition of the same ID share a new one, the next free ID, given in file
 * order. Code and Templater tags are left alone.
 */
export function planFixIds(doc: AnnotationDoc): FixIdsPlan | Refusal {
	const later: { id: string; markerAt?: number; defAt?: number; first: number }[] = [];
	for (const [id, u] of usesById(doc.text)) {
		for (let k = 1; k < Math.max(u.markers.length, u.definitions.length); k++) {
			const markerAt = u.markers[k];
			const defAt = u.definitions[k];
			later.push({ id, markerAt, defAt, first: Math.min(markerAt ?? Infinity, defAt ?? Infinity) });
		}
	}
	if (later.length === 0) {
		return { refusal: 'no-duplicate-ids', message: 'there are no duplicate annotation IDs in this note.' };
	}
	later.sort((a, b) => a.first - b.first);
	let n = Number(nextId(doc.text).slice(1));
	const changes: Change[] = [];
	const renamed: FixIdsPlan['renamed'] = [];
	for (const use of later) {
		const to = `r${n++}`;
		for (const at of [use.markerAt, use.defAt]) {
			if (at !== undefined) changes.push({ from: at, to: at + use.id.length, insert: to });
		}
		renamed.push({ from: use.id, to });
	}
	changes.sort((a, b) => a.from - b.from);
	return { changes, renamed };
}
