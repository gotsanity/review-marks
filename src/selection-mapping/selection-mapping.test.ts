// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { block, rangeOver } from '../test-support/fake-dom';
import { mapSelection, type RenderedSlice } from './selection-mapping';

/** A rendered block: `html` rendered from `text.slice(from, to)`. */
function slice(html: string, text: string, from = 0, to = text.length): RenderedSlice {
	return { el: block(html), from, to };
}

/** Maps a selection of `needle` in one rendered block and returns the selected source text. */
function mapped(text: string, html: string, needle: string): string {
	const s = slice(html, text);
	const r = mapSelection(text, [s], rangeOver(s.el, needle));
	if ('failure' in r) throw new Error(r.message);
	return text.slice(r.from, r.to);
}

describe('mapSelection: plain text and formatting', () => {
	it('maps a plain selection to its source offsets', () => {
		const text = 'Kell fails the save.';
		const s = slice('<p>Kell fails the save.</p>', text);
		expect(mapSelection(text, [s], rangeOver(s.el, 'the save'))).toEqual({ from: 11, to: 19 });
	});

	it('keeps formatting inside the selection balanced', () => {
		const text = 'Kell **fails** the save.';
		const html = '<p>Kell <strong>fails</strong> the save.</p>';
		expect(mapped(text, html, 'fails the')).toBe('**fails** the');
		expect(mapped(text, html, 'Kell fails')).toBe('Kell **fails**');
		expect(mapped(text, html, 'fails')).toBe('fails');
		expect(mapped(text, html, 'ell fa')).toBe('ell **fa');
	});

	it('maps across italics, highlights, strikethrough and inline code', () => {
		const text = 'A _quiet_ ==bright== ~~old~~ `x*y` end';
		const html = '<p>A <em>quiet</em> <mark>bright</mark> <del>old</del> <code>x*y</code> end</p>';
		expect(mapped(text, html, 'bright old')).toBe('==bright== ~~old~~');
		expect(mapped(text, html, 'x*y end')).toBe('`x*y` end');
	});
});

describe('mapSelection: links', () => {
	const text = 'Ask [[malas-vance|Malas Vance]] or [the duke](https://example.com/duke) now.';
	const html =
		'<p>Ask <a class="internal-link" href="malas-vance">Malas Vance</a> or ' +
		'<a class="external-link" href="https://example.com/duke">the duke</a> now.</p>';

	it('expands a selection ending inside a link to the whole link', () => {
		expect(mapped(text, html, 'Ask Malas')).toBe('Ask [[malas-vance|Malas Vance]]');
		expect(mapped(text, html, 'or the')).toBe('or [the duke](https://example.com/duke)');
	});

	it('expands a selection starting inside a link to the whole link', () => {
		expect(mapped(text, html, 'Vance or')).toBe('[[malas-vance|Malas Vance]] or');
	});

	it('maps a link without an alias', () => {
		expect(mapped('See [[Cross Hollow]] soon.', '<p>See <a class="internal-link">Cross Hollow</a> soon.</p>', 'Hollow soon')).toBe(
			'[[Cross Hollow]] soon',
		);
	});
});

describe('mapSelection: blocks', () => {
	it('skips list markers', () => {
		const text = '- one\n- two items\n';
		expect(mapped(text, '<ul><li>one</li><li>two items</li></ul>', 'two')).toBe('two');
	});

	it('skips task and numbered list markers', () => {
		const text = '1. first\n- [ ] do the thing\n';
		expect(mapped(text, '<ol><li>first</li></ol><ul><li><input type="checkbox">do the thing</li></ul>', 'do the')).toBe('do the');
	});

	it('skips quote markers', () => {
		const text = '> Quoted text\n> goes on';
		expect(mapped(text, '<blockquote><p>Quoted text<br>\ngoes on</p></blockquote>', 'text\ngoes')).toBe('text\n> goes');
	});

	it('maps a selection across two rendered blocks', () => {
		const text = '# Head\n\nFirst para.\n\nSecond para.\n';
		const a = slice('<p>First para.</p>', text, 8, 19);
		const b = slice('<p>Second para.</p>', text, 21, 33);
		const range = document.createRange();
		range.setStart(a.el.querySelector('p')?.firstChild as Text, 6);
		range.setEnd(b.el.querySelector('p')?.firstChild as Text, 6);
		expect(mapSelection(text, [a, b], range)).toEqual({ from: 14, to: 27 });
	});

	it('fails when the selection is not in any rendered block', () => {
		const text = 'Body.';
		const s = slice('<p>Body.</p>', text);
		const other = block('Sidebar');
		expect(mapSelection(text, [s], rangeOver(other, 'Side'))).toMatchObject({ failure: 'outside-note' });
	});
});

describe('mapSelection: footnotes and Annotations', () => {
	it('steps over a rendered footnote reference', () => {
		const text = 'Fact[^1] stays.\n\n[^1]: A note.';
		const html = '<p>Fact<sup class="footnote-ref" data-footref="[^1]"><a href="#fn-1">[1]</a></sup> stays.</p>';
		const s = slice(html, text, 0, 15);
		const r = mapSelection(text, [s], rangeOver(s.el, 'Fact[1] stays'));
		expect(r).toEqual({ from: 0, to: 14 });
	});

	it('maps a selection inside a decorated Target', () => {
		const text = 'x {alpha beta}[^r1] gamma';
		const html =
			'<p>x <span class="rm-hidden">{</span><span class="rm-target">alpha beta</span>' +
			'<span class="rm-hidden">}r1</span><span class="rm-badge">A comment</span> gamma</p>';
		expect(mapped(text, html, 'beta')).toBe('beta');
		expect(mapped(text, html, 'x {alpha beta')).toBe('x {alpha beta}[^r1]');
		expect(mapped(text, html, 'beta}r1A comment gamma')).toBe('beta}[^r1] gamma');
	});
});

describe('mapSelection: table cells', () => {
	const row = '| {[[malas-vance\\|Malas Vance]] (the Peddler)}[^r8] | Malek\'s patron |';
	const text = `| Name | Role |\n|---|---|\n${row}\n`;
	const cells = [
		{ html: '{<a class="internal-link">Malas Vance</a> (the Peddler)}r8', from: text.indexOf('{[['), to: text.indexOf('[^r8]') + 5 },
		{ html: 'Malek\'s patron', from: text.indexOf('Malek'), to: text.indexOf('Malek') + 14 },
	];
	const slices = () => cells.map((c) => slice(`<div class="table-cell-wrapper">${c.html}</div>`, text, c.from, c.to));

	it('maps a selection in one cell, expanding over a link with an escaped bar', () => {
		const [first] = slices();
		if (!first) throw new Error('no cell');
		const r = mapSelection(text, [first], rangeOver(first.el, 'Vance (the'));
		if ('failure' in r) throw new Error(r.message);
		expect(text.slice(r.from, r.to)).toBe('[[malas-vance\\|Malas Vance]] (the');
	});

	it("skips the table widget's drag handles", () => {
		const cell = cells[1];
		if (!cell) throw new Error('no cell');
		const s = slice(`<div class="table-row-drag-handle">patron</div><div class="table-cell-wrapper">${cell.html}</div>`, text, cell.from, cell.to);
		const r = mapSelection(text, [s], rangeOver(s.el.querySelector('.table-cell-wrapper') as HTMLElement, 'patron'));
		if ('failure' in r) throw new Error(r.message);
		expect(text.slice(r.from, r.to)).toBe('patron');
	});

	it('maps a selection across cells to a range across the cell border', () => {
		const [a, b] = slices();
		if (!a || !b) throw new Error('no cells');
		const range = document.createRange();
		range.setStart(a.el.querySelector('a')?.nextSibling as Text, 2);
		range.setEnd(b.el.firstChild?.firstChild as Text, 5);
		const r = mapSelection(text, [a, b], range);
		if ('failure' in r) throw new Error(r.message);
		expect(text.slice(r.from, r.to)).toBe('the Peddler)}[^r8] | Malek');
	});
});
