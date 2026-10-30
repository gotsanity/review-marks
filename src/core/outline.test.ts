import { describe, expect, it } from 'vitest';
import { outline, targetExcerpt } from './outline';
import { parse } from './parse';

const of = (text: string, note = 'Note') => outline(parse(text), note);

describe('outline', () => {
	it('counts Annotations with a Target and puts those before the first heading under the note name', () => {
		const o = of('Alpha {beta}[^r1] and {gamma}[^r2].\n\n[^r1]: One.\n[^r2]: Two.\n', 'My note');
		expect(o.count).toBe(2);
		expect(o.groups).toEqual([
			{
				title: 'My note',
				level: 0,
				total: 2,
				entries: [
					{ id: 'r1', target: 'beta', comment: 'One.' },
					{ id: 'r2', target: 'gamma', comment: 'Two.' },
				],
				children: [],
			},
		]);
		expect(o.untargeted).toEqual([]);
	});

	it('nests heading sections by level and leaves out sections with no Annotation', () => {
		const text = [
			'# One',
			'',
			'{a}[^r1]',
			'',
			'## Empty',
			'',
			'Nothing here.',
			'',
			'## Sub',
			'',
			'{b}[^r2]',
			'',
			'```',
			'# not a heading',
			'```',
			'',
			'{c}[^r3]',
			'',
			'# Two',
			'',
			'Plain.',
			'',
		].join('\n');
		const shape = (gs: ReturnType<typeof of>['groups']): unknown =>
			gs.map((g) => ({ title: g.title, level: g.level, total: g.total, ids: g.entries.map((e) => e.id), children: shape(g.children) }));
		expect(shape(of(text).groups)).toEqual([
			{
				title: 'One',
				level: 1,
				total: 3,
				ids: ['r1'],
				children: [{ title: 'Sub', level: 2, total: 2, ids: ['r2', 'r3'], children: [] }],
			},
		]);
	});

	it('titles a section by its heading text without Annotation syntax or closing hashes', () => {
		expect(of('## The {big}[^r1] idea ##\n\n{x}[^r2]\n').groups.map((g) => g.title)).toEqual(['The big idea']);
	});

	it('lists definitions with no marker apart, uncounted', () => {
		const o = of('Text.\n\n[^r4]: Lost.\n');
		expect(o.count).toBe(0);
		expect(o.groups).toEqual([]);
		expect(o.untargeted).toEqual([{ id: 'r4', target: null, comment: 'Lost.' }]);
	});
});

describe('targetExcerpt', () => {
	it('joins the blocks of a Target with " / " and drops their markers', () => {
		const doc = parse('{First item\n- second item\n> quoted}[^r1]\n');
		expect(targetExcerpt(doc.text, doc.annotations[0]!)).toBe('First item / second item / quoted');
	});

	it('drops nested Annotation syntax and emphasis, and shows a wikilink by its alias', () => {
		const doc = parse('{see **this** and {that}[^r2] in [[Page|the page]]}[^r1]\n');
		const outer = doc.annotations.find((a) => a.id === 'r1')!;
		expect(targetExcerpt(doc.text, outer)).toBe('see this and that in the page');
	});

	it('cuts at 80 characters and marks the cut', () => {
		const doc = parse(`{${'word '.repeat(30).trim()}}[^r1]\n`);
		const out = targetExcerpt(doc.text, doc.annotations[0]!);
		expect(out).toBe('word '.repeat(16).trim() + '…');
	});
});
