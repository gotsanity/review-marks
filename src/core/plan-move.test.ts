import { describe, expect, it } from 'vitest';
import endOfNote from '../../test/e2e/vaults/review-samples/Review sample - end of note.md?raw';
import endOfSection from '../../test/e2e/vaults/review-samples/Review sample - end of section.md?raw';
import { applyChanges } from './changes';
import { parse } from './parse';
import { planMoveComments } from './plan-move';
import { isRefusal, type Placement } from './types';

/** Moves the comments of `text` to `placement` and returns the new text. */
function move(text: string, placement: Placement): string {
	const plan = planMoveComments(parse(text), placement);
	if (isRefusal(plan)) throw new Error(plan.message);
	return applyChanges(text, plan.changes);
}

describe('planMoveComments: to the end of the note', () => {
	it('moves a definition from the end of its section to the end of the note', () => {
		const text = '# One\n\n{Alpha}[^r1] beta.\n\n[^r1]: First.\n\n# Two\n\nGamma.\n';
		expect(move(text, 'end-of-note')).toBe('# One\n\n{Alpha}[^r1] beta.\n\n# Two\n\nGamma.\n\n[^r1]: First.\n');
	});
});

describe('planMoveComments: reading order', () => {
	it('orders the definitions at the end of the note by their markers', () => {
		const text = '# One\n\n{A}[^r2] then {B}[^r1].\n\n[^r1]: Bee.\n[^r2]: Ay.\n\n# Two\n\n{C}[^r3].\n\n[^r3]: See.\n';
		expect(move(text, 'end-of-note')).toBe(
			'# One\n\n{A}[^r2] then {B}[^r1].\n\n# Two\n\n{C}[^r3].\n\n[^r2]: Ay.\n[^r1]: Bee.\n[^r3]: See.\n',
		);
	});

	it('orders the definitions within a section by their markers, a nested one before its outer one', () => {
		const text = '{x {y}[^r1] z}[^r2] and {w}[^r3].\n\n[^r3]: Three.\n[^r2]: Two.\n[^r1]: One.\n';
		expect(move(text, 'end-of-section')).toBe(
			'{x {y}[^r1] z}[^r2] and {w}[^r3].\n\n[^r1]: One.\n[^r2]: Two.\n[^r3]: Three.\n',
		);
	});
});

describe('planMoveComments: to the end of sections', () => {
	it('ends a section at the next heading of any level, nested ones included', () => {
		const text = '# One\n\n{A}[^r1].\n\n## Deeper\n\n{B}[^r2].\n\n# Two\n\nEnd.\n\n[^r1]: Ay.\n[^r2]: Bee.\n';
		expect(move(text, 'end-of-section')).toBe(
			'# One\n\n{A}[^r1].\n\n[^r1]: Ay.\n\n## Deeper\n\n{B}[^r2].\n\n[^r2]: Bee.\n\n# Two\n\nEnd.\n',
		);
	});

	it('puts definitions for text before the first heading just before that heading', () => {
		const text = '{Intro}[^r1].\n# One\n\nBody.\n\n[^r1]: Before.\n';
		expect(move(text, 'end-of-section')).toBe('{Intro}[^r1].\n\n[^r1]: Before.\n\n# One\n\nBody.\n');
	});

	it('round-trips a note through both placements', () => {
		const text = 'Intro {i}[^r1].\n\n[^r1]: I.\n\n# One\n\n{A}[^r2]\n\n[^r2]: Ay.\n    More.\n\n## Two\n\n{B}[^r3].\n\n[^r3]: Bee.\n';
		const atEnd = move(text, 'end-of-note');
		expect(atEnd).toBe('Intro {i}[^r1].\n\n# One\n\n{A}[^r2]\n\n## Two\n\n{B}[^r3].\n\n[^r1]: I.\n[^r2]: Ay.\n    More.\n[^r3]: Bee.\n');
		expect(move(atEnd, 'end-of-section')).toBe(text);
		expect(planMoveComments(parse(atEnd), 'end-of-note').changes).toEqual([]);
		expect(planMoveComments(parse(text), 'end-of-section').changes).toEqual([]);
	});
});

describe('planMoveComments: what stays put', () => {
	it('keeps every Comment byte for byte, multi-line ones and blank lines inside included', () => {
		const comment = '[^r1]: Line one  \n    Line two.\n\n    Line *four*.';
		const text = `# One\n\n{A}[^r1].\n\n${comment}\n\n# Two\n\nEnd.\n`;
		expect(move(text, 'end-of-note')).toBe(`# One\n\n{A}[^r1].\n\n# Two\n\nEnd.\n\n${comment}\n`);
	});

	it('never moves author footnotes', () => {
		const text = '# One\n\nAlpha[^1] {beta}[^r1].\n\n[^1]: Author.\n\n[^r1]: Review.\n\n# Two\n\nEnd.\n';
		expect(move(text, 'end-of-note')).toBe(
			'# One\n\nAlpha[^1] {beta}[^r1].\n\n[^1]: Author.\n\n# Two\n\nEnd.\n\n[^r1]: Review.\n',
		);
	});

	it('never moves anything in code, nor takes a # comment in code for a heading', () => {
		const text = '{A}[^r1].\n\n```sh\n# not a heading\n[^r9]: not a definition\n```\n\n# One\n\nEnd.\n\n[^r1]: Ay.\n';
		const plan = planMoveComments(parse(text), 'end-of-section');
		expect(applyChanges(text, plan.changes)).toBe(
			'{A}[^r1].\n\n```sh\n# not a heading\n[^r9]: not a definition\n```\n\n[^r1]: Ay.\n\n# One\n\nEnd.\n',
		);
		expect(plan.orphans).toBe(0);
	});

	it('leaves orphan definitions in place and counts them, a second definition of an ID included', () => {
		const text = '# One\n\n{A}[^r1].\n\n[^r5]: Orphan.\n[^r1]: Ay.\n[^r1]: Again.\n\n# Two\n\nEnd.\n';
		const plan = planMoveComments(parse(text), 'end-of-note');
		expect(applyChanges(text, plan.changes)).toBe(
			'# One\n\n{A}[^r1].\n\n[^r5]: Orphan.\n[^r1]: Again.\n\n# Two\n\nEnd.\n\n[^r1]: Ay.\n',
		);
		expect(plan).toMatchObject({ moved: 1, orphans: 2 });
	});

	it('closes the gap to one blank line, and adds no final line break to a note without one', () => {
		const text = '# One\n\n{A}[^r1].\n\n[^r1]: Ay.\n\n\n# Two\n\nEnd.';
		expect(move(text, 'end-of-note')).toBe('# One\n\n{A}[^r1].\n\n# Two\n\nEnd.\n\n[^r1]: Ay.');
	});

	it('changes only the lines it moves', () => {
		const text = '# One\n\n{A}[^r1].\n\n[^r1]: Ay.\n\n# Two\n\nEnd.\n';
		expect(planMoveComments(parse(text), 'end-of-note').changes).toEqual([
			{ from: 18, to: 30, insert: '' }, // `[^r1]: Ay.\n\n`
			{ from: 42, to: 42, insert: '\n[^r1]: Ay.\n' }, // after `End.\n`
		]);
	});
});

describe('planMoveComments: the 12-case sample notes', () => {
	it('converts the end-of-section sample into the end-of-note sample', () => {
		expect(move(endOfSection, 'end-of-note')).toBe(endOfNote);
	});

	it('converts the end-of-note sample into the end-of-section sample', () => {
		expect(move(endOfNote, 'end-of-section')).toBe(endOfSection);
	});

	it('changes nothing when the note is already in place', () => {
		expect(planMoveComments(parse(endOfNote), 'end-of-note').changes).toEqual([]);
		expect(planMoveComments(parse(endOfSection), 'end-of-section').changes).toEqual([]);
	});
});
