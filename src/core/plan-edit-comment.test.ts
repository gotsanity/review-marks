import { describe, expect, it } from 'vitest';
import { applyChanges } from './changes';
import { parse } from './parse';
import { planEditComment } from './plan-edit-comment';
import { isRefusal } from './types';

function edit(text: string, id: string, comment: string): string {
	const plan = planEditComment(parse(text), { id, comment, placement: 'end-of-section' });
	if (isRefusal(plan)) throw new Error(plan.message);
	return applyChanges(text, plan.changes);
}

describe('planEditComment', () => {
	it('replaces the Comment in place', () => {
		const text = 'Alpha {beta}[^r1].\n\n[^r1]: Old.\n[^r2]: Other.\n';
		expect(edit(text, 'r1', 'New.')).toBe('Alpha {beta}[^r1].\n\n[^r1]: New.\n[^r2]: Other.\n');
	});

	it('writes a multi-line Comment over a multi-line one', () => {
		const text = 'Alpha {beta}[^r1].\n\n[^r1]: One.\n    Two.\n\n# Next\n';
		expect(edit(text, 'r1', 'A.\nB.\nC.')).toBe('Alpha {beta}[^r1].\n\n[^r1]: A.\n    B.\n    C.\n\n# Next\n');
	});

	it('adds the missing definition where a new one would go', () => {
		expect(edit('# One\n\nAlpha {beta}[^r1].\n\n# Two\n', 'r1', 'Found.')).toBe(
			'# One\n\nAlpha {beta}[^r1].\n\n[^r1]: Found.\n\n# Two\n',
		);
	});

	it('refuses an empty Comment and points to Remove annotation', () => {
		const plan = planEditComment(parse('{a}[^r1]\n\n[^r1]: C.\n'), { id: 'r1', comment: ' \n', placement: 'end-of-section' });
		expect(plan).toMatchObject({ refusal: 'empty-comment' });
		expect(isRefusal(plan) && plan.message).toContain('Remove annotation');
	});

	it('refuses an ID that is not in the note', () => {
		expect(planEditComment(parse('Alpha.\n'), { id: 'r1', comment: 'x', placement: 'end-of-note' })).toMatchObject({
			refusal: 'not-found',
		});
	});
});
