import type { Change } from './types';

/**
 * Applies a plan's changes to the text they were planned on. Changes must not overlap;
 * inserts at the same offset land in the order given.
 */
export function applyChanges(text: string, changes: readonly Change[]): string {
	const sorted = changes
		.map((c, i) => ({ c, i }))
		.sort((a, b) => a.c.from - b.c.from || a.i - b.i)
		.map(({ c }) => c);
	let out = '';
	let pos = 0;
	for (const c of sorted) {
		if (c.from < pos || c.to < c.from || c.to > text.length) throw new RangeError('Overlapping or invalid change');
		out += text.slice(pos, c.from) + c.insert;
		pos = c.to;
	}
	return out + text.slice(pos);
}
