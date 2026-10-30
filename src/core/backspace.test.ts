import { describe, expect, it } from 'vitest';
import { applyChanges, backspaceAt, parse } from './index';

/** Presses Backspace at `|` and returns the text with `|` at the new caret, or null for a normal Backspace. */
function press(marked: string): { text: string; kind: string } | null {
	const pos = marked.indexOf('|');
	const text = marked.slice(0, pos) + marked.slice(pos + 1);
	const plan = backspaceAt(parse(text), pos);
	if (!plan) return null;
	const out = applyChanges(text, plan.changes);
	return { text: out.slice(0, plan.caret) + '|' + out.slice(plan.caret), kind: plan.kind };
}

describe('backspaceAt', () => {
	it('deletes the last character of the Target, keeping the marker', () => {
		expect(press('Alpha {abc}[^r1]| beta.\n\n[^r1]: C.\n')).toEqual({
			text: 'Alpha {ab}[^r1]| beta.\n\n[^r1]: C.\n',
			kind: 'delete',
		});
	});

	it('removes the whole Annotation when the Target would become empty', () => {
		expect(press('Alpha {a}[^r1]| beta.\n\n[^r1]: C.\n')).toEqual({ text: 'Alpha | beta.\n', kind: 'remove' });
		expect(press('{a}[^r1]|\n\n[^r1]: C.\n\n# Next\n')).toEqual({ text: '|\n\n# Next\n', kind: 'remove' });
	});

	it('is a normal Backspace anywhere but just after a marker', () => {
		expect(press('Alpha {abc}[^r1] |beta.\n')).toBeNull();
		expect(press('Alpha {abc}[^r1|].\n')).toBeNull();
		expect(press('Alpha {ab|c}[^r1].\n')).toBeNull();
		expect(press('Alpha {a}b|c.\n')).toBeNull();
	});

	it('deletes a whole surrogate pair', () => {
		expect(press('{a😀}[^r1]|')?.text).toBe('{a}[^r1]|');
	});

	it('uses the given cluster boundary when there is one', () => {
		const text = '{aé}[^r1]';
		const plan = backspaceAt(parse(text), text.length, (s) => s.length - 2);
		expect(plan && applyChanges(text, plan.changes)).toBe('{a}[^r1]');
	});

	it('deletes an escaping backslash with the character after it, so `}` stays unescaped', () => {
		expect(press('{a\\{}[^r1]|')?.text).toBe('{a}[^r1]|');
		expect(press('{\\{}[^r1]|\n\n[^r1]: C.\n')).toEqual({ text: '|\n', kind: 'remove' });
	});

	it('goes into the innermost Target when nested Annotations end together', () => {
		expect(press('{x {ab}[^r1]}[^r2]|\n\n[^r1]: In.\n[^r2]: Out.\n')?.text).toBe(
			'{x {a}[^r1]}[^r2]|\n\n[^r1]: In.\n[^r2]: Out.\n',
		);
	});
});
