import { describe, expect, it } from 'vitest';
import { parse } from '../core';
import { planRendered } from './align';

/** Plans the whole of `text` (one section) against rendered text nodes. */
const plan = (text: string, nodes: string[], from = 0, to = text.length) => planRendered(parse(text), from, to, nodes);

describe('planRendered', () => {
	it('hides the braces and wraps the Target in a paragraph', () => {
		const text = 'Intro {with a target}[^r1] and more.\n\n[^r1]: Comment.';
		const out = plan(text, ['Intro {with a target}', ' and more.'], 0, 36);
		expect(out).toEqual(
			new Map([
				[
					0,
					[
						{ kind: 'text', text: 'Intro ' },
						{ kind: 'syntax', text: '{' },
						{ kind: 'target', text: 'with a target', id: 'r1' },
						{ kind: 'syntax', text: '}', closes: 'r1' },
					],
				],
			]),
		);
	});

	it('wraps every text node of a Target that crosses bold text', () => {
		// <p>A {b <strong>bold</strong> c}<sup>…</sup> d</p>
		const out = plan('A {b **bold** c}[^r1] d', ['A {b ', 'bold', ' c}', ' d']);
		expect(out).toEqual(
			new Map([
				[0, [{ kind: 'text', text: 'A ' }, { kind: 'syntax', text: '{' }, { kind: 'target', text: 'b ', id: 'r1' }]],
				[1, [{ kind: 'target', text: 'bold', id: 'r1' }]],
				[2, [{ kind: 'target', text: ' c', id: 'r1' }, { kind: 'syntax', text: '}', closes: 'r1' }]],
			]),
		);
	});

	it('marks the inner Target of nested Annotations', () => {
		const out = plan('{a {b}[^r2] c}[^r1]', ['{a {b}', ' c}']);
		expect(out?.get(0)).toEqual([
			{ kind: 'syntax', text: '{' },
			{ kind: 'target', text: 'a ', id: 'r1' },
			{ kind: 'syntax', text: '{' },
			{ kind: 'target', text: 'b', id: 'r2', nested: true },
			{ kind: 'syntax', text: '}', closes: 'r2' },
		]);
		expect(out?.get(1)).toEqual([
			{ kind: 'target', text: ' c', id: 'r1' },
			{ kind: 'syntax', text: '}', closes: 'r1' },
		]);
	});

	it('hides a marker left as plain text with its brace', () => {
		const out = plan('{cell}[^r1] x', ['{cell}[^r1] x']);
		expect(out?.get(0)).toEqual([
			{ kind: 'syntax', text: '{' },
			{ kind: 'target', text: 'cell', id: 'r1' },
			{ kind: 'syntax', text: '}[^r1]', closes: 'r1', markerInline: true },
			{ kind: 'text', text: ' x' },
		]);
	});

	it('draws the part of a Target inside a slice that the Target starts before', () => {
		const text = '- {item one\n- item two}[^r1] end';
		const second = text.indexOf('- item two');
		// The slice is the second list item: <li>item two}<sup>…</sup> end</li>
		const out = plan(text, ['item two}', ' end'], second, text.length);
		expect(out?.get(0)).toEqual([
			{ kind: 'target', text: 'item two', id: 'r1' },
			{ kind: 'syntax', text: '}', closes: 'r1' },
		]);
	});

	it('draws the part of a Target inside a slice that the Target ends after', () => {
		const text = '- {item one\n- item two}[^r1] end';
		const out = plan(text, ['{item one'], 0, text.indexOf('\n'));
		expect(out?.get(0)).toEqual([
			{ kind: 'syntax', text: '{' },
			{ kind: 'target', text: 'item one', id: 'r1' },
		]);
	});

	it('leaves whitespace-only text nodes inside a Target alone', () => {
		const out = plan('- {a\n- b}[^r1]', ['{a', '\n', 'b}']);
		expect(out?.has(1)).toBe(false);
	});

	it('pairs braces that are not Annotations, and ignores braces in definitions', () => {
		const text = 'A {plain} and {t}[^r1].\n\n[^r1]: Has {braces}.';
		const out = plan(text, ['A {plain} and {t}', '.'], 0, text.indexOf('\n'));
		expect(out?.get(0)).toEqual([
			{ kind: 'text', text: 'A {plain} and ' },
			{ kind: 'syntax', text: '{' },
			{ kind: 'target', text: 't', id: 'r1' },
			{ kind: 'syntax', text: '}', closes: 'r1' },
		]);
	});

	it('decorates nothing when the rendered braces do not match the source', () => {
		expect(plan('A {t}[^r1] b', ['A {t}', ' b {extra}'])).toBeNull();
		expect(plan('A {t}[^r1] b', ['A t', ' b'])).toBeNull();
		expect(plan('A {t}[^r1] b', ['A }t{', ' b'])).toBeNull();
	});

	it('changes nothing in a slice without Annotations', () => {
		expect(plan('Just {text}.', ['Just {text}.'])).toEqual(new Map());
	});
});
