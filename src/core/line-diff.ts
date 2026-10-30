import type { Change } from './types';

/** Splits text into lines that keep their `\n`; a last line without one is kept as is. */
const splitLines = (s: string) => s.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/**
 * The changes that turn `a` into `b`, touching only the lines that differ (a Myers line diff).
 * Offsets are in `a`. Unchanged lines are never part of a change, so an editor maps a cursor or
 * scroll position on them straight through.
 */
export function lineChanges(a: string, b: string): Change[] {
	if (a === b) return [];
	const A = splitLines(a);
	const B = splitLines(b);
	const n = A.length;
	const m = B.length;
	const max = n + m;
	const offset = max + 1;
	const v = new Int32Array(2 * max + 3);
	const trace: Int32Array[] = [];

	search: for (let d = 0; d <= max; d++) {
		trace.push(v.slice());
		for (let k = -d; k <= d; k += 2) {
			const down = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!);
			let x = down ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
			let y = x - k;
			while (x < n && y < m && A[x] === B[y]) {
				x++;
				y++;
			}
			v[offset + k] = x;
			if (x >= n && y >= m) break search;
		}
	}

	// Walk back through the trace for the edit script: keep, delete (from A) or insert (from B).
	const ops: ('keep' | 'delete' | 'insert')[] = [];
	let x = n;
	let y = m;
	for (let d = trace.length - 1; d >= 0; d--) {
		const vd = trace[d]!;
		const k = x - y;
		const down = k === -d || (k !== d && vd[offset + k - 1]! < vd[offset + k + 1]!);
		const prevK = down ? k + 1 : k - 1;
		const prevX = d === 0 ? 0 : vd[offset + prevK]!;
		const prevY = d === 0 ? 0 : prevX - prevK;
		while (x > prevX && y > prevY) {
			ops.push('keep');
			x--;
			y--;
		}
		if (d > 0) {
			ops.push(x === prevX ? 'insert' : 'delete');
			if (x === prevX) y--;
			else x--;
		}
	}
	ops.reverse();

	const starts = [0];
	for (const line of A) starts.push(starts[starts.length - 1]! + line.length);
	const out: Change[] = [];
	let i = 0;
	let j = 0;
	let current: Change | null = null;
	for (const op of ops) {
		if (op === 'keep') {
			if (current) out.push(current);
			current = null;
			i++;
			j++;
			continue;
		}
		current ??= { from: starts[i]!, to: starts[i]!, insert: '' };
		if (op === 'delete') current.to = starts[++i]!;
		else current.insert += B[j++]!;
	}
	if (current) out.push(current);
	return out;
}
