import { describe, expect, it } from 'vitest';
import { applyChanges } from './changes';
import { duplicateIds, planFixIds } from './fix-ids';
import { parse } from './parse';
import { isRefusal } from './types';

function fix(text: string): string {
	const plan = planFixIds(parse(text));
	if (isRefusal(plan)) throw new Error(plan.message);
	return applyChanges(text, plan.changes);
}

describe('duplicateIds', () => {
	it('lists IDs used by more than one marker or definition, in order of first use', () => {
		const text = '{a}[^r3] {b}[^r1] {c}[^r3]\n\n[^r1]: one\n[^r1]: again\n[^r3]: three\n[^r3]: three bis\n';
		expect(duplicateIds(parse(text))).toEqual(['r3', 'r1']);
	});

	it('finds none in a note where each ID is used once', () => {
		expect(duplicateIds(parse('{a}[^r1] {b}[^r2]\n\n[^r1]: x\n[^r2]: y\n'))).toEqual([]);
	});

	it('ignores labels in code', () => {
		expect(duplicateIds(parse('{a}[^r1]\n\n[^r1]: x\n\n```\n{a}[^r1]\n[^r1]: x\n```\n'))).toEqual([]);
	});
});

describe('planFixIds', () => {
	it('gives the second use of an ID, marker and definition, the next free ID', () => {
		// A template with r1 applied to a note that already has r1 and r2.
		const text = '{one}[^r1] and {two}[^r2] then {three}[^r1].\n\n[^r1]: first\n[^r2]: second\n[^r1]: third\n';
		expect(fix(text)).toBe(
			'{one}[^r1] and {two}[^r2] then {three}[^r3].\n\n[^r1]: first\n[^r2]: second\n[^r3]: third\n',
		);
	});

	it('renumbers every later duplicate in file order, extra markers and definitions included', () => {
		const text = '{a}[^r1] {b}[^r1] {c}[^r1]\n\n[^r1]: A\n[^r1]: B\n[^r5]: orphan\n[^r5]: orphan too\n';
		expect(fix(text)).toBe('{a}[^r1] {b}[^r6] {c}[^r7]\n\n[^r1]: A\n[^r6]: B\n[^r5]: orphan\n[^r8]: orphan too\n');
	});

	it('lets the new IDs be read as separate Annotations', () => {
		const doc = parse(fix('{one}[^r1] {two}[^r1]\n\n[^r1]: first\n[^r1]: second\n'));
		expect(doc.annotations.map((a) => [a.id, a.definition?.comment])).toEqual([
			['r1', 'first'],
			['r2', 'second'],
		]);
	});

	it('refuses when there is nothing to fix', () => {
		expect(planFixIds(parse('{a}[^r1]\n\n[^r1]: x\n'))).toEqual({
			refusal: 'no-duplicate-ids',
			message: 'there are no duplicate annotation IDs in this note.',
		});
	});
});
