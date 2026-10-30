// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parse } from '../core';
import { block } from '../test-support/fake-dom';
import { cleanExport } from './export';

/** A footnote reference as Obsidian renders it: number `n`, label `label`. */
const ref = (n: number, label: string) =>
	`<sup data-footnote-id="fnref-${n}-h" class="footnote-ref" id="fnref-${n}-h">` +
	`<a data-footref="${label}" href="#fn-${n}-h" class="footnote-link">[${n}]</a></sup>`;

/** Obsidian's footnote list, one item per `[label, text]`. */
const list = (items: [string, string][]) =>
	'<section class="footnotes"><hr><ol>' +
	items.map(([, text], i) => `<li data-footnote-id="fn-${i + 1}-h" id="fn-${i + 1}-h"><p>${text}</p></li>`).join('') +
	'</ol></section>';

const NOTE =
	'# Head {x}\n\nPara {one target}[^r1] and author[^a] and {two **bold**}[^r2].\n\n' +
	'Code `{not}` and \\{escaped\\} here.\n\n{cross\nblock}[^r3]\n\n' +
	'[^a]: Author note.\n[^r1]: First comment.\n[^r2]: Second {comment}.\n[^r3]: Third.\n';

const HTML =
	'<h1>Head {x}</h1>' +
	`<p>Para {one target}${ref(1, 'r1')} and author${ref(2, 'a')} and {two <strong>bold</strong>}${ref(3, 'r2')}.</p>` +
	'<p>Code <code>{not}</code> and {escaped} here.</p>' +
	`<p>{cross<br>\nblock}${ref(4, 'r3')}</p>` +
	list([
		['r1', 'First comment.'],
		['a', 'Author note.'],
		['r2', 'Second {comment}.'],
		['r3', 'Third.'],
	]);

function exported(text: string, html: string, strip: boolean): HTMLElement {
	const root = block(html);
	cleanExport(root, parse(text), strip);
	return root;
}

/** Each paragraph and list item's text, one per line. */
const lines = (root: HTMLElement) =>
	Array.from(root.querySelectorAll('h1, p')).map((el) => el.textContent ?? '');

describe('cleanExport: clean (default)', () => {
	it("drops every Target's braces and keeps its Comment as a numbered footnote", () => {
		const root = exported(NOTE, HTML, false);
		expect(lines(root)).toEqual([
			'Head {x}',
			'Para one target[1] and author[2] and two bold[3].',
			'Code {not} and {escaped} here.',
			'cross\nblock[4]',
			'First comment.',
			'Author note.',
			'Second {comment}.',
			'Third.',
		]);
	});
});

describe('cleanExport: an Annotation without a Comment', () => {
	it('drops its braces and the marker Obsidian prints as text', () => {
		const text = 'A {phrase}[^r1] and {more}[^r2].\n\n[^r2]: Two.\n';
		for (const strip of [false, true]) {
			const root = exported(text, `<p>A {phrase}[^r1] and {more}${ref(1, 'r2')}.</p>`, strip);
			expect(lines(root)[0]).toBe(strip ? 'A phrase and more.' : 'A phrase and more[1].');
		}
	});
});

describe('cleanExport: strip', () => {
	it('leaves Targets as plain text, drops the Comments and renumbers the author footnotes', () => {
		const root = exported(NOTE, HTML, true);
		expect(lines(root)).toEqual([
			'Head {x}',
			'Para one target and author[1] and two bold.',
			'Code {not} and {escaped} here.',
			'cross\nblock',
			'Author note.',
		]);
		expect(root.querySelectorAll('sup').length).toBe(1);
		expect(root.querySelectorAll('section.footnotes li').length).toBe(1);
	});

	it('drops the footnote list when it holds only Comments', () => {
		const text = 'A {phrase}[^r1].\n\n[^r1]: One.\n';
		const root = exported(text, `<p>A {phrase}${ref(1, 'r1')}.</p>${list([['r1', 'One.']])}`, true);
		expect(root.textContent).toBe('A phrase.');
		expect(root.querySelector('section.footnotes')).toBeNull();
	});

	it('drops the Comment even when the braces do not match the source', () => {
		const text = 'A {a {b} c}[^r1].\n\n[^r1]: One.\n';
		const root = exported(text, `<p>A {a b c}${ref(1, 'r1')}.</p>${list([['r1', 'One.']])}`, true);
		expect(root.textContent).toBe('A {a b c}.');
	});
});

describe('cleanExport: Targets that hold braces', () => {
	it('cleans nested Targets and keeps literal braces inside them', () => {
		const text = 'A {outer {inner}[^r2] and \\{x\\}}[^r1] end.\n\n[^r1]: One.\n[^r2]: Two.\n';
		const root = exported(text, `<p>A {outer {inner}${ref(1, 'r2')} and {x}}${ref(2, 'r1')} end.</p>`, false);
		expect(lines(root)[0]).toBe('A outer inner[1] and {x}[2] end.');
	});

	it('leaves a Target as rendered when its braces do not match the source', () => {
		// Say a plugin rewrote `{b}` before rendering.
		const text = 'A {a {b} c}[^r1].\n\n[^r1]: One.\n';
		const root = exported(text, `<p>A {a b c}${ref(1, 'r1')}.</p>`, false);
		expect(lines(root)[0]).toBe('A {a b c}[1].');
	});
});
