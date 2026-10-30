import { describe, expect, it } from 'vitest';
import sample from '../../test/e2e/vaults/review-samples/Review sample - end of section.md?raw';
import { normalizeLineEndings, parse } from './parse';

describe('parse: the 12-case sample note', () => {
	const text = normalizeLineEndings(sample);
	const doc = parse(text);

	it('finds every Target with its Comment', () => {
		const ids = doc.annotations.map((a) => a.id).sort();
		expect(ids).toEqual(['r1', 'r10', 'r11', 'r12', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9']);
		expect(doc.annotations.every((a) => a.definition !== null)).toBe(true);
	});

	it('reads the Target and multi-line Comment of r7', () => {
		const r7 = doc.annotations.find((a) => a.id === 'r7');
		expect(text.slice((r7?.open ?? 0) + 1, r7?.close)).toBe('Rhiaah tells him there is a task he needs done');
		expect(r7?.definition?.comment).toBe('Rewrite as a direct quote.\nShe said it in character; see the transcript.');
	});
});

describe('parse', () => {
	it('finds a Target, its marker and its Comment', () => {
		const text = 'Kell fails, {his eyes burning}[^r6].\n\n[^r6]: Was it "hatred"?\n';
		const doc = parse(text);
		expect(doc.annotations).toEqual([
			{
				id: 'r6',
				open: 12,
				close: 29,
				markerEnd: 35,
				definition: { id: 'r6', from: 38, to: 61, comment: 'Was it "hatred"?' },
			},
		]);
		expect(doc.orphanDefinitions).toEqual([]);
	});
});

describe('parse: Comments', () => {
	it('joins 4-space and tab continuation lines, keeping a blank line between them', () => {
		const text = 'A {b}[^r1].\n\n[^r1]: First line.\n    Second line.\n\n\tFourth line.\nAfter.\n';
		const [a] = parse(text).annotations;
		expect(a?.definition?.comment).toBe('First line.\nSecond line.\n\nFourth line.');
		expect(a?.definition?.to).toBe(text.indexOf('\nAfter.'));
	});

	it('keeps links and brackets in a Comment as written', () => {
		const text = '{x}[^r2]\n\n[^r2]: See [[Note|alias]] (and {this}).';
		expect(parse(text).annotations[0]?.definition?.comment).toBe('See [[Note|alias]] (and {this}).');
	});

	it('reports a marker without a definition, and a definition without a marker', () => {
		const doc = parse('{x}[^r1]\n\n[^r2]: lonely\n');
		expect(doc.annotations[0]?.definition).toBeNull();
		expect(doc.orphanDefinitions).toEqual([{ id: 'r2', from: 10, to: 23, comment: 'lonely' }]);
	});

	it('ignores author footnotes', () => {
		const doc = parse('Text[^1] and {x}[^r1].\n\n[^1]: Author note.\n[^r1]: Review.\n');
		expect(doc.annotations.map((a) => a.id)).toEqual(['r1']);
		expect(doc.annotations[0]?.definition?.comment).toBe('Review.');
		expect(doc.orphanDefinitions).toEqual([]);
	});
});

describe('parse: Targets', () => {
	it('pairs braces like brackets, so plain {pairs} stay inside a Target', () => {
		expect(parse('a {b {c} d}[^r1] e').annotations[0]).toMatchObject({ open: 2, close: 10, markerEnd: 16 });
	});

	it('treats braces without a marker as plain text', () => {
		expect(parse('a {b} c } d {').annotations).toEqual([]);
	});

	it('skips escaped braces', () => {
		expect(parse('a {b \\} c}[^r1]').annotations[0]).toMatchObject({ open: 2, close: 9 });
	});

	it('finds two Targets in one paragraph and nested Targets, sorted by their {', () => {
		const text = '{one}[^r4] and {two {three}[^r2]}[^r3]';
		expect(parse(text).annotations.map((a) => [a.id, a.open])).toEqual([
			['r4', 0],
			['r3', 15],
			['r2', 20],
		]);
	});

	it('keeps a Target within one block: a blank line drops an open {', () => {
		expect(parse('a {b\n\nc}[^r1] d').annotations).toEqual([]);
	});

	it('allows a Target across a soft line break within a paragraph', () => {
		expect(parse('a {b\nc}[^r1] d').annotations[0]).toMatchObject({ open: 2, close: 6 });
	});

	it('does not read a definition line as a Target', () => {
		const doc = parse('[^r1]: has {braces}[^r9] inside\n');
		expect(doc.annotations).toEqual([]);
		expect(doc.orphanDefinitions.map((d) => d.id)).toEqual(['r1']);
	});

	it('keeps the first use of an ID', () => {
		const doc = parse('{a}[^r1] {b}[^r1]\n\n[^r1]: first\n[^r1]: second\n');
		expect(doc.annotations.map((a) => a.open)).toEqual([0]);
		expect(doc.annotations[0]?.definition?.comment).toBe('first');
	});
});
