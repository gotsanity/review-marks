import { describe, expect, it } from 'vitest';
import { applyChanges, isRefusal, parse, planRemove } from './index';

function remove(text: string, id: string): string {
	const plan = planRemove(parse(text), id);
	if (isRefusal(plan)) throw new Error(plan.message);
	return applyChanges(text, plan.changes);
}

describe('planRemove', () => {
	it('removes the braces, marker and definition and keeps the Target text', () => {
		const text = '# One\n\nKell fails {the save}[^r1].\n\n[^r1]: Check this.\n\n## Two\n\nMore.\n';
		expect(remove(text, 'r1')).toBe('# One\n\nKell fails the save.\n\n## Two\n\nMore.\n');
	});

	it('takes only its own line out of a group of definitions', () => {
		const text = '{A}[^r1] {B}[^r2] {C}[^r3].\n\n[^r1]: One.\n[^r2]: Two.\n[^r3]: Three.\n\n# Next\n';
		expect(remove(text, 'r2')).toBe('{A}[^r1] B {C}[^r3].\n\n[^r1]: One.\n[^r3]: Three.\n\n# Next\n');
		expect(remove(text, 'r1')).toBe('A {B}[^r2] {C}[^r3].\n\n[^r2]: Two.\n[^r3]: Three.\n\n# Next\n');
		expect(remove(text, 'r3')).toBe('{A}[^r1] {B}[^r2] C.\n\n[^r1]: One.\n[^r2]: Two.\n\n# Next\n');
	});

	it('leaves no blank lines behind at the end of the note', () => {
		expect(remove('Alpha {beta}[^r1].\n\n[^r1]: Gone.\n', 'r1')).toBe('Alpha beta.\n');
		expect(remove('Alpha {beta}[^r1].\n\n[^r1]: Gone.', 'r1')).toBe('Alpha beta.\n');
		expect(remove('{A}[^r1] {B}[^r2].\n\n[^r1]: One.\n[^r2]: Two.\n', 'r2')).toBe('{A}[^r1] B.\n\n[^r1]: One.\n');
	});

	it('removes every continuation line of a multi-line Comment', () => {
		const text = 'Alpha {beta}[^r1].\n\n[^r1]: Line one.\n    Line two.\n\n    Line four.\n\n# Next\n';
		expect(remove(text, 'r1')).toBe('Alpha beta.\n\n# Next\n');
	});

	it('keeps the braces of a nested Annotation', () => {
		const text = '{Alpha {beta}[^r1]}[^r2].\n\n[^r1]: Inner.\n[^r2]: Outer.\n';
		expect(remove(text, 'r2')).toBe('Alpha {beta}[^r1].\n\n[^r1]: Inner.\n');
		expect(remove(text, 'r1')).toBe('{Alpha beta}[^r2].\n\n[^r2]: Outer.\n');
	});

	it('removes the braces and marker of an Annotation with no definition', () => {
		expect(remove('Alpha {beta}[^r1].\n', 'r1')).toBe('Alpha beta.\n');
	});

	it('removes a definition with no marker', () => {
		expect(remove('Alpha.\n\n[^r4]: Lost.\n', 'r4')).toBe('Alpha.\n');
	});

	it('refuses an ID that is not in the note', () => {
		expect(planRemove(parse('Alpha.\n'), 'r9')).toMatchObject({ refusal: 'not-found' });
	});
});
