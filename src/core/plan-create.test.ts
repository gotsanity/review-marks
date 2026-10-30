import { describe, expect, it } from 'vitest';
import { applyChanges } from './changes';
import { parse } from './parse';
import { planCreate } from './plan-create';
import { isRefusal, type Placement } from './types';

/** Annotates the first occurrence of `target` in `text` and returns the new text. */
function annotate(text: string, target: string, comment: string, placement: Placement = 'end-of-section'): string {
	const from = text.indexOf(target);
	if (from < 0) throw new Error(`"${target}" is not in the text`);
	const plan = planCreate(parse(text), { from, to: from + target.length, comment, placement });
	if (isRefusal(plan)) throw new Error(plan.message);
	return applyChanges(text, plan.changes);
}

describe('planCreate: end of section', () => {
	it('wraps the Target and writes the definition before the next heading', () => {
		const text = '# One\n\nKell fails the save.\n\n## Two\n\nMore.\n';
		expect(annotate(text, 'the save', 'Check this.')).toBe(
			'# One\n\nKell fails {the save}[^r1].\n\n[^r1]: Check this.\n\n## Two\n\nMore.\n',
		);
	});

	it('ends the section at the next heading of any level, deeper ones included', () => {
		const text = '## Two\n\nAlpha beta.\n\n### Three\n\nGamma.\n';
		expect(annotate(text, 'beta', 'Deeper.')).toBe(
			'## Two\n\nAlpha {beta}[^r1].\n\n[^r1]: Deeper.\n\n### Three\n\nGamma.\n',
		);
	});

	it('goes after review definitions already at the end of the section, with no blank line between', () => {
		const text = '# One\n\n{Alpha}[^r1] beta.\n\n[^r1]: First.\n\n# Two\n';
		expect(annotate(text, 'beta', 'Second.')).toBe(
			'# One\n\n{Alpha}[^r1] {beta}[^r2].\n\n[^r1]: First.\n[^r2]: Second.\n\n# Two\n',
		);
	});

	it('leaves a blank line after an author footnote definition at the end of the section', () => {
		const text = '# One\n\nAlpha[^1] beta.\n\n[^1]: Author.\n\n# Two\n';
		expect(annotate(text, 'beta', 'Review.')).toBe(
			'# One\n\nAlpha[^1] {beta}[^r1].\n\n[^1]: Author.\n\n[^r1]: Review.\n\n# Two\n',
		);
	});

	it('adds the blank lines a heading right after the paragraph needs', () => {
		const text = '# One\nAlpha beta.\n# Two\n';
		expect(annotate(text, 'beta', 'Tight.')).toBe('# One\nAlpha {beta}[^r1].\n\n[^r1]: Tight.\n\n# Two\n');
	});

	it('puts the definition for text before the first heading just before that heading', () => {
		const text = 'Intro text.\n\n# One\n\nBody.\n';
		expect(annotate(text, 'Intro', 'Before.')).toBe('{Intro}[^r1] text.\n\n[^r1]: Before.\n\n# One\n\nBody.\n');
	});

	it('appends to the end of the note in the last section, keeping its final line break', () => {
		const text = '# One\n\nAlpha beta.\n';
		expect(annotate(text, 'Alpha', 'Last.')).toBe('# One\n\n{Alpha}[^r1] beta.\n\n[^r1]: Last.\n');
	});

	it('appends to a note without a final line break without adding one', () => {
		expect(annotate('Alpha beta.', 'beta', 'No break.')).toBe('Alpha {beta}[^r1].\n\n[^r1]: No break.');
	});

	it('writes a Target that ends its section, right before the next heading', () => {
		const text = '# One\n\nAlpha beta\n\n# Two\n';
		expect(annotate(text, 'beta', 'End.')).toBe('# One\n\nAlpha {beta}[^r1]\n\n[^r1]: End.\n\n# Two\n');
	});

	it('does not take a # inside a paragraph for a heading', () => {
		const text = 'Alpha #tag beta.\n\nMore.\n';
		expect(annotate(text, 'Alpha', 'Tag.')).toBe('{Alpha}[^r1] #tag beta.\n\nMore.\n\n[^r1]: Tag.\n');
	});
});

describe('planCreate: end of note', () => {
	it('goes after the last review definition', () => {
		const text = '# One\n\n{Alpha}[^r1] beta.\n\n# Two\n\nGamma.\n\n[^r1]: First.\n';
		expect(annotate(text, 'Gamma', 'Second.', 'end-of-note')).toBe(
			'# One\n\n{Alpha}[^r1] beta.\n\n# Two\n\n{Gamma}[^r2].\n\n[^r1]: First.\n[^r2]: Second.\n',
		);
	});

	it('starts the list at the end of the note when there is none', () => {
		const text = '# One\n\nAlpha.\n\n# Two\n\nGamma.\n';
		expect(annotate(text, 'Alpha', 'First.', 'end-of-note')).toBe(
			'# One\n\n{Alpha}[^r1].\n\n# Two\n\nGamma.\n\n[^r1]: First.\n',
		);
	});
});

describe('planCreate: reading order', () => {
	it('puts the definition before those of later markers in its section', () => {
		const text = '# One\n\nAlpha {beta}[^r1] gamma {delta}[^r2].\n\n[^r1]: B.\n[^r2]: D.\n\n# Two\n';
		expect(annotate(text, 'gamma', 'G.')).toBe(
			'# One\n\nAlpha {beta}[^r1] {gamma}[^r3] {delta}[^r2].\n\n[^r1]: B.\n[^r3]: G.\n[^r2]: D.\n\n# Two\n',
		);
	});

	it('puts the definition first when its marker comes first', () => {
		const text = 'Alpha {beta}[^r1].\n\n[^r1]: B.\n';
		expect(annotate(text, 'Alpha', 'A.')).toBe('{Alpha}[^r2] {beta}[^r1].\n\n[^r2]: A.\n[^r1]: B.\n');
	});

	it('puts the definition before those of later markers at the end of the note', () => {
		const text = '# One\n\nAlpha.\n\n# Two\n\n{Gamma}[^r1].\n\n[^r1]: G.\n';
		expect(annotate(text, 'Alpha', 'A.', 'end-of-note')).toBe(
			'# One\n\n{Alpha}[^r2].\n\n# Two\n\n{Gamma}[^r1].\n\n[^r2]: A.\n[^r1]: G.\n',
		);
	});
});

describe('planCreate: Comments and IDs', () => {
	it('indents further lines of a multi-line Comment by 4 spaces, leaving blank lines empty', () => {
		expect(annotate('Alpha beta.\n', 'beta', 'Line one.\nLine two.\n\nLine four.')).toBe(
			'Alpha {beta}[^r1].\n\n[^r1]: Line one.\n    Line two.\n\n    Line four.\n',
		);
	});

	it('round-trips a multi-line Comment through parse', () => {
		const out = annotate('Alpha beta.\n', 'beta', 'Line one.\nLine two.\n\nLine four.');
		expect(parse(out).annotations[0]?.definition?.comment).toBe('Line one.\nLine two.\n\nLine four.');
	});

	it('trims trailing whitespace and leading blank lines from the Comment', () => {
		expect(annotate('Alpha.\n', 'Alpha', '\n\n  Hi there  \n\n')).toBe('{Alpha}[^r1].\n\n[^r1]:   Hi there\n');
	});

	it('takes the highest ID in the note plus one, gaps and orphan definitions included', () => {
		const text = '{a}[^r2] {b}[^r7] c\n\n[^r2]: x\n[^r7]: y\n[^r9]: orphan\n';
		const plan = planCreate(parse(text), { from: 18, to: 19, comment: 'z', placement: 'end-of-section' });
		expect(isRefusal(plan) ? plan : plan.id).toBe('r10');
	});

	it('reports the caret position just after the new marker', () => {
		const text = '# One\n\nAlpha beta gamma.\n';
		const plan = planCreate(parse(text), { from: 13, to: 17, comment: 'c', placement: 'end-of-section' });
		if (isRefusal(plan)) throw new Error(plan.message);
		const out = applyChanges(text, plan.changes);
		expect(out.slice(0, plan.caret)).toBe('# One\n\nAlpha {beta}[^r1]');
	});
});

describe('planCreate: adjusting the selection', () => {
	const plan = (text: string, from: number, to: number) =>
		planCreate(parse(text), { from, to, comment: 'c', placement: 'end-of-section' });

	it('trims whitespace around the selection and accepts it backwards', () => {
		const p = plan('Alpha  beta  gamma.', 13, 5);
		expect(isRefusal(p) ? p : p.target).toEqual({ from: 7, to: 11 });
	});

	it('keeps list bullets and heading marks outside the Target', () => {
		const list = plan('- [ ] Task text\n', 0, 15);
		expect(isRefusal(list) ? list : list.target).toEqual({ from: 6, to: 15 });
		const heading = plan('## Heading\n', 0, 10);
		expect(isRefusal(heading) ? heading : heading.target).toEqual({ from: 3, to: 10 });
	});
});

describe('planCreate: refusals', () => {
	const refusal = (text: string, from: number, to: number) => {
		const p = planCreate(parse(text), { from, to, comment: 'c', placement: 'end-of-section' });
		return isRefusal(p) ? p.refusal : 'created';
	};

	it('refuses an empty or blank selection', () => {
		expect(refusal('Alpha beta.', 3, 3)).toBe('empty-selection');
		expect(refusal('Alpha   beta.', 6, 7)).toBe('empty-selection');
	});

	it('refuses a selection across paragraphs, list items or into a heading', () => {
		expect(refusal('Alpha.\n\nBeta.', 0, 12)).toBe('crosses-blocks');
		expect(refusal('- one\n- two\n', 2, 11)).toBe('crosses-blocks');
		expect(refusal('# Head\nBody\n', 2, 11)).toBe('crosses-blocks');
	});

	it('accepts a selection across a soft line break', () => {
		expect(refusal('Alpha\nbeta.', 0, 10)).toBe('created');
	});

	it('refuses a selection that touches a definition', () => {
		const text = '{a}[^r1]\n\n[^r1]: comment\n';
		expect(refusal(text, 12, 18)).toBe('in-definition');
	});

	it('refuses a selection that ends inside a marker or half overlaps a Target', () => {
		const text = 'x {alpha beta}[^r1] gamma';
		expect(refusal(text, 15, 17)).toBe('overlaps-annotation');
		expect(refusal(text, 9, 25)).toBe('overlaps-annotation');
		expect(refusal(text, 0, 5)).toBe('overlaps-annotation');
	});

	it('accepts a selection inside a Target or around a whole Annotation', () => {
		const text = 'x {alpha beta}[^r1] gamma';
		expect(refusal(text, 3, 8)).toBe('created');
		expect(refusal(text, 0, 25)).toBe('created');
	});

	it('refuses a selection with an unmatched brace', () => {
		expect(refusal('a { b } c', 0, 4)).toBe('unbalanced-braces');
	});
});

describe('planCreate: table cells', () => {
	const TABLE =
		'| Name | Result |\n|---|---|\n| Kell | 17 (fail) |\n| [[malas-vance\\|Malas Vance]] (the Peddler) | 26 |\n';
	const refusal = (text: string, from: number, to: number) => {
		const p = planCreate(parse(text), { from, to, comment: 'c', placement: 'end-of-note' });
		return isRefusal(p) ? p : 'created';
	};

	it('wraps a Target inside one cell, trimming the cell padding', () => {
		expect(annotate(TABLE, ' 17 (fail) ', 'DC 18?', 'end-of-note')).toBe(
			'| Name | Result |\n|---|---|\n| Kell | {17 (fail)}[^r1] |\n' +
				'| [[malas-vance\\|Malas Vance]] (the Peddler) | 26 |\n\n[^r1]: DC 18?\n',
		);
	});

	it('accepts a wikilink whose alias bar is escaped with \\|', () => {
		expect(annotate(TABLE, '[[malas-vance\\|Malas Vance]] (the Peddler)', 'Use "Vance".', 'end-of-note')).toContain(
			'| {[[malas-vance\\|Malas Vance]] (the Peddler)}[^r1] | 26 |',
		);
	});

	it('refuses a Target that crosses table cells', () => {
		const from = TABLE.indexOf('Kell');
		expect(refusal(TABLE, from, from + 'Kell | 17'.length)).toEqual({
			refusal: 'crosses-table-cells',
			message: 'a Target must stay within one table cell.',
		});
	});

	it('refuses a selection that starts on a cell border', () => {
		const from = TABLE.indexOf('| Kell');
		expect(refusal(TABLE, from, from + 6)).toMatchObject({ refusal: 'crosses-table-cells' });
	});

	it('still refuses a selection across table rows as crossing blocks', () => {
		expect(refusal(TABLE, TABLE.indexOf('17'), TABLE.indexOf('26'))).toMatchObject({ refusal: 'crosses-blocks' });
	});

	it('does not take a | outside a table for a cell border', () => {
		expect(refusal('Either a | b here.', 0, 12)).toBe('created');
	});
});
