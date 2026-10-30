import { describe, expect, it } from 'vitest';
import { applyChanges } from './changes';
import { parse } from './parse';
import { nextId, planCreate } from './plan-create';
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

	it('does not count labels in code, frontmatter or Templater tags', () => {
		const text = '---\nid: "[^r8]"\n---\n{a}[^r2] `[^r7]` <% "[^r6]" %>\n\n```\n[^r9]: x\n```\n\n[^r2]: y\n';
		expect(nextId(text)).toBe('r3');
	});

	it('reports the caret position just after the new marker', () => {
		const text = '# One\n\nAlpha beta gamma.\n';
		const plan = planCreate(parse(text), { from: 13, to: 17, comment: 'c', placement: 'end-of-section' });
		if (isRefusal(plan)) throw new Error(plan.message);
		const out = applyChanges(text, plan.changes);
		expect(out.slice(0, plan.caret)).toBe('# One\n\nAlpha {beta}[^r1]');
	});
});

describe('planCreate: across blocks and in headings', () => {
	it('wraps a Target across paragraphs', () => {
		expect(annotate('Alpha.\n\nBeta gamma.\n', 'Alpha.\n\nBeta', 'Both.')).toBe(
			'{Alpha.\n\nBeta}[^r1] gamma.\n\n[^r1]: Both.\n',
		);
	});

	it('wraps a Target across list items, keeping the first bullet outside', () => {
		expect(annotate('- one\n- two\n', '- one\n- two', 'Merge.')).toBe('- {one\n- two}[^r1]\n\n[^r1]: Merge.\n');
	});

	it('wraps a Target from a heading into a paragraph', () => {
		expect(annotate('# Head\nBody.\n', 'Head\nBody', 'Hm.')).toBe('# {Head\nBody}[^r1].\n\n[^r1]: Hm.\n');
	});

	it('wraps a Target inside a heading and writes the definition at the end of its section', () => {
		const text = '### Scene 3: Call of the Void (~00:41)\n\nBack in the hallway.\n\n### Scene 4\n';
		expect(annotate(text, 'Call of the Void', 'Rename.')).toBe(
			'### Scene 3: {Call of the Void}[^r1] (~00:41)\n\nBack in the hallway.\n\n[^r1]: Rename.\n\n### Scene 4\n',
		);
	});

	it('places the definition in the section where the Target ends', () => {
		const text = '# One\n\nAlpha.\n\n# Two\n\nBeta.\n\n# Three\n';
		expect(annotate(text, 'Alpha.\n\n# Two\n\nBeta', 'Span.')).toBe(
			'# One\n\n{Alpha.\n\n# Two\n\nBeta}[^r1].\n\n[^r1]: Span.\n\n# Three\n',
		);
	});

	it('ends the Target before the next bullet when the selection takes it in', () => {
		const p = planCreate(parse('- one\n- two\n'), { from: 2, to: 8, comment: 'c', placement: 'end-of-section' });
		expect(isRefusal(p) ? p : p.target).toEqual({ from: 2, to: 5 });
	});

	it('still refuses a Target across table rows', () => {
		const text = 'Alpha.\n| a | b |\n|---|---|\n';
		const p = planCreate(parse(text), { from: 0, to: 10, comment: 'c', placement: 'end-of-section' });
		expect(isRefusal(p) ? p.refusal : 'created').toBe('crosses-blocks');
	});
});

describe('planCreate: code is not markup when placing the definition', () => {
	it('skips a # line in fenced code when finding the end of the section', () => {
		const text = '# One\n\nAlpha.\n\n```\n# not a heading\n```\n\nMore.\n\n# Two\n';
		expect(annotate(text, 'Alpha', 'c')).toBe(
			'# One\n\n{Alpha}[^r1].\n\n```\n# not a heading\n```\n\nMore.\n\n[^r1]: c\n\n# Two\n',
		);
	});

	it('skips a # comment in frontmatter', () => {
		const text = '---\n# yaml comment\n---\nAlpha.\n\n# Two\n';
		expect(annotate(text, 'Alpha', 'c')).toBe('---\n# yaml comment\n---\n{Alpha}[^r1].\n\n[^r1]: c\n\n# Two\n');
	});

	it('does not join a [^rN]: line in fenced code', () => {
		const text = 'Alpha.\n\n```\n[^r1]: x\n```\n\nMore.\n';
		expect(annotate(text, 'Alpha', 'c', 'end-of-note')).toBe(
			'{Alpha}[^r1].\n\n```\n[^r1]: x\n```\n\nMore.\n\n[^r1]: c\n',
		);
	});

	it('does not join a [^rN]: line in fenced code that ends the section', () => {
		const text = 'Alpha.\n\n```\n[^r1]: x\n```\n\n# Two\n';
		expect(annotate(text, 'Alpha', 'c')).toBe('{Alpha}[^r1].\n\n```\n[^r1]: x\n```\n\n[^r1]: c\n\n# Two\n');
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

	it('refuses a selection that starts or ends in code', () => {
		expect(refusal('Run `the code` here.', 9, 19)).toBe('in-code');
		expect(refusal('Run `the code` here.', 0, 8)).toBe('in-code');
		expect(refusal('Alpha.\n\n```\nfn()\n```\n', 0, 13)).toBe('in-code');
		expect(refusal('```\nfn()\n```\n\nAlpha.', 0, 20)).toBe('in-code');
	});

	it('accepts a selection around whole code, and braces in code', () => {
		expect(refusal('Run `the code` here.', 4, 14)).toBe('created');
		expect(refusal('Run `f{x` here.', 0, 14)).toBe('created');
		expect(refusal('Alpha.\n\n```\n{\n```\n\nBeta.', 0, 23)).toBe('created');
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

describe("planCreate: other plugins' syntax", () => {
	/** Selects the first occurrence of `selection` in `text`; returns the refusal reason and message, or 'created'. */
	const select = (text: string, selection: string) => {
		const from = text.indexOf(selection);
		if (from < 0) throw new Error(`"${selection}" is not in the text`);
		const p = planCreate(parse(text), { from, to: from + selection.length, comment: 'c', placement: 'end-of-note' });
		return isRefusal(p) ? p : 'created';
	};
	const reason = (text: string, selection: string) => {
		const r = select(text, selection);
		return r === 'created' ? r : r.refusal;
	};

	it('refuses a Target that starts or ends inside inline or block math', () => {
		expect(select('Text and $x^2 + y$ here.', 'and $x^2')).toEqual({
			refusal: 'in-math',
			message: "a Target can't start or end inside math.",
		});
		expect(reason('Text and $x^2 + y$ here.', 'y$ here')).toBe('in-math');
		expect(reason('Before.\n\n$$\na^2\n$$\n\nAfter.', 'Before.\n\n$$\na')).toBe('in-math');
	});

	it('accepts a Target around whole math, and dollar signs that are not math', () => {
		expect(reason('Text and $x^2 + y$ here.', 'and $x^2 + y$')).toBe('created');
		expect(reason('Before.\n\n$$\na^2\n$$\n\nAfter.', 'Before.\n\n$$\na^2\n$$')).toBe('created');
		expect(reason('It costs $5 and $6 each.', '5 and')).toBe('created');
		expect(reason('Escaped \\$x and y$ here.', 'x and')).toBe('created');
	});

	it('refuses a Target that starts or ends inside a Templater or Templates tag', () => {
		expect(select('Title: <% tp.file.title %> today.', 'file.title %> today')).toEqual({
			refusal: 'in-template',
			message: "a Target can't start or end inside a template tag.",
		});
		expect(reason('Made on {{date:YYYY}} by me.', 'on {{date')).toBe('in-template');
	});

	it('accepts a Target around a whole tag, and ignores tag braces when checking balance', () => {
		expect(reason('Title: <% tp.file.title %> today.', '<% tp.file.title %>')).toBe('created');
		expect(reason('Made on {{date}} by me.', 'on {{date}} by')).toBe('created');
		expect(reason('<%* if (x) { %>\nShown text.\n<%* } %>\n', '<%* if (x) { %>\nShown')).toBe('created');
	});

	it('refuses a Target that starts or ends inside a bracketed Dataview field', () => {
		expect(select('Score [rating:: 5] here.', 'rating')).toEqual({
			refusal: 'in-dataview-field',
			message: "a Target can't start or end inside a Dataview field.",
		});
		expect(reason('Score (rating:: 5) here.', '5) here')).toBe('in-dataview-field');
		expect(reason('A [note:: see [[X]]] b.', 'X]]] b')).toBe('in-dataview-field');
	});

	it('refuses a Target that starts or ends on a whole-line Dataview field', () => {
		expect(reason('Rating:: 5\n', 'Rating:: 5')).toBe('in-dataview-field');
		expect(reason('- **Status**:: done\n', 'done')).toBe('in-dataview-field');
		expect(reason('Intro.\nRating:: 5\n', 'Intro.\nRating')).toBe('in-dataview-field');
	});

	it('accepts a Target around a whole bracketed field, or across a field line', () => {
		expect(reason('Score [rating:: 5] here.', '[rating:: 5]')).toBe('created');
		expect(reason('Intro.\n\nRating:: 5\n\nOutro.', 'Intro.\n\nRating:: 5\n\nOutro.')).toBe('created');
	});

	it('refuses a Target that starts or ends inside a link', () => {
		expect(select('See [[Note|the alias]] now.', 'alias]] now')).toEqual({
			refusal: 'in-link',
			message: "a Target can't start or end inside a link.",
		});
		expect(reason('See [the site](https://example.com) now.', 'See [the')).toBe('in-link');
		expect(reason('See ![[image.png]] now.', 'image')).toBe('in-link');
		expect(reason('Mail <https://example.com/a> now.', 'example')).toBe('in-link');
		expect(reason('Go to https://example.com/page now.', 'example.com')).toBe('in-link');
		expect(reason('Fact[^1] here.\n\n[^1]: Source.\n', 'Fact[^')).toBe('in-link');
	});

	it('accepts a Target around a whole link', () => {
		expect(reason('See [[Note|the alias]] now.', '[[Note|the alias]]')).toBe('created');
		expect(reason('See [the site](https://example.com) now.', 'See [the site](https://example.com)')).toBe('created');
		expect(reason('Fact[^1] here.\n\n[^1]: Source.\n', 'Fact[^1]')).toBe('created');
	});

	it('refuses a Target that starts or ends inside an HTML tag or comment', () => {
		expect(select('A <span class="x">word</span> b.', 'class="x">word')).toEqual({
			refusal: 'in-html',
			message: "a Target can't start or end inside an HTML tag.",
		});
		expect(reason('A <!-- note --> b.', 'note --> b')).toBe('in-html');
	});

	it('accepts a Target between HTML tags or around them', () => {
		expect(reason('A <span class="x">word</span> b.', 'word')).toBe('created');
		expect(reason('A <b>bold</b> b.', '<b>bold</b>')).toBe('created');
		expect(reason('If a < b and c > d.', 'a < b and c')).toBe('created');
	});

	it('ignores look-alike syntax in code', () => {
		expect(reason('Run `$x` and `[[a` now.', 'Run `$x` and')).toBe('created');
	});

	it('refuses to annotate an Excalidraw drawing', () => {
		expect(select('---\nexcalidraw-plugin: parsed\n---\nHello ^abcdefgh\n', 'Hello')).toEqual({
			refusal: 'excalidraw',
			message: 'annotations are off in Excalidraw drawings.',
		});
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
