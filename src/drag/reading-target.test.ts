// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { block, rangeOver } from '../test-support/fake-dom';
import { readingTarget, type RenderedSection } from './reading-target';

const TEXT = [
	'# Notes', //                                       line 0
	'', //                                              line 1
	'Kell **fails** the save and seizes.', //            line 2
	'', //                                              line 3
	'- First item', //                                  line 4
	'- Second item with **strong** words', //           line 5
	'', //                                              line 6
	'```js', //                                         line 7
	'const x = 1;', //                                  line 8
	'```', //                                           line 9
	'', //                                              line 10
	'| Name | Result |', //                             line 11
	'|---|---|', //                                     line 12
	'| Doreth | fail |', //                             line 13
	'', //                                              line 14
	'Use `npm run` now.', //                            line 15
	'', //                                              line 16
	'Energy $E=mc^2$ holds.', //                        line 17
	'', //                                              line 18
	'> [!note] Callout title', //                       line 19
	'> Callout body.', //                               line 20
	'', //                                              line 21
	'See the note[^1] here.', //                        line 22
	'', //                                              line 23
	'[^1]: The footnote text.', //                      line 24
].join('\n');

/** Reading view's sections for TEXT, each with the lines `getSectionInfo` reports. */
function sections(): RenderedSection[] {
	return [
		{ el: block('<h1>Notes</h1>'), lineStart: 0, lineEnd: 0 },
		{ el: block('<p>Kell <strong>fails</strong> the save and seizes.</p>'), lineStart: 2, lineEnd: 2 },
		{
			el: block('<ul><li>First item</li><li>Second item with <strong>strong</strong> words</li></ul>'),
			lineStart: 4,
			lineEnd: 5,
		},
		{ el: block('<pre><code>const x = 1;</code></pre>'), lineStart: 7, lineEnd: 9 },
		{
			el: block('<table><thead><tr><th>Name</th><th>Result</th></tr></thead><tbody><tr><td>Doreth</td><td>fail</td></tr></tbody></table>'),
			lineStart: 11,
			lineEnd: 13,
		},
		{ el: block('<p>Use <code>npm run</code> now.</p>'), lineStart: 15, lineEnd: 15 },
		{ el: block('<p>Energy <span class="math math-inline"><mjx-container>E = m c 2</mjx-container></span> holds.</p>'), lineStart: 17, lineEnd: 17 },
		{
			el: block(
				'<div class="callout" data-callout="note"><div class="callout-title"><div class="callout-title-icon"></div>' +
					'<div class="callout-title-inner">Callout title</div></div><div class="callout-content"><p>Callout body.</p></div></div>',
			),
			lineStart: 19,
			lineEnd: 20,
		},
		{ el: block('<p>See the note<sup class="footnote-ref"><a href="#fn-1">[1]</a></sup> here.</p>'), lineStart: 22, lineEnd: 22 },
		{
			el: block('<section class="footnotes"><hr><ol><li id="fn-1"><p>The footnote text. <a class="footnote-backref">↩︎</a></p></li></ol></section>'),
			lineStart: 24,
			lineEnd: 24,
		},
	];
}

/** The source text a drag over `needle` in the section `index` would annotate, or the notice. */
function target(index: number, needle: string): string {
	const all = sections();
	const r = readingTarget(TEXT, all, rangeOver((all[index] as RenderedSection).el, needle));
	return 'message' in r ? `refused: ${r.message}` : TEXT.slice(r.from, r.to);
}

describe('readingTarget', () => {
	it('maps a drag across bold text to its source, formatting included', () => {
		expect(target(1, 'fails the save')).toBe('**fails** the save');
	});

	it('maps a drag inside a list item past the list marker', () => {
		expect(target(2, 'item with strong')).toBe('item with **strong**');
	});

	it('refuses a drag inside a code block', () => {
		expect(target(3, 'x = 1')).toBe("refused: an annotation can't start or end in code.");
	});

	it('refuses a drag that starts or ends inside inline code', () => {
		expect(target(5, 'run now')).toBe("refused: an annotation can't start or end in code.");
	});

	it('refuses a drag across table cells', () => {
		// The cells' texts follow each other with no space between them.
		expect(target(4, 'rethfa')).toBe('refused: an annotation must stay within one table cell.');
	});

	it('maps a drag from a paragraph into a list item across both sections', () => {
		const all = sections();
		const range = document.createRange();
		const p = all[1]?.el.querySelector('p')?.firstChild as Text;
		const li = all[2]?.el.querySelector('li')?.firstChild as Text;
		range.setStart(p, 5);
		range.setEnd(li, 5);
		const r = readingTarget(TEXT, all, range);
		expect('message' in r ? r.message : TEXT.slice(r.from, r.to)).toBe('**fails** the save and seizes.\n\n- First');
	});

	it('fails when the drag is not over the note text', () => {
		const other = block('<p>Somewhere else</p>');
		const r = readingTarget(TEXT, sections(), rangeOver(other, 'else'));
		expect(r).toEqual({ failure: 'outside-note', message: 'the selection is not in the note text.' });
	});

	it('marks a refusal from creating the Annotation as refused', () => {
		const all = sections();
		expect(readingTarget(TEXT, all, rangeOver((all[3] as RenderedSection).el, 'x = 1'))).toEqual({
			failure: 'refused',
			message: "an annotation can't start or end in code.",
		});
	});

	describe('a selection in an area mapping skips', () => {
		it('is outside the note when it lies entirely in the footnote list', () => {
			const all = sections();
			const r = readingTarget(TEXT, all, rangeOver((all[9] as RenderedSection).el, 'footnote text'));
			expect(r).toMatchObject({ failure: 'outside-note' });
		});

		it('is outside the note when it lies entirely in math', () => {
			const all = sections();
			const r = readingTarget(TEXT, all, rangeOver((all[6] as RenderedSection).el, 'm c'));
			expect(r).toMatchObject({ failure: 'outside-note' });
		});

		it('is clipped to the note text when it runs on into the footnote list', () => {
			const all = sections();
			const range = document.createRange();
			const p = (all[8] as RenderedSection).el.querySelector('p')?.lastChild as Text;
			const li = (all[9] as RenderedSection).el.querySelector('li p')?.firstChild as Text;
			range.setStart(p, 1);
			range.setEnd(li, 8);
			const r = readingTarget(TEXT, all, range);
			expect('message' in r ? r.message : TEXT.slice(r.from, r.to)).toBe('here.');
		});

		it('is clipped to the note text when it starts in math', () => {
			const all = sections();
			const math = (all[6] as RenderedSection).el.querySelector('mjx-container')?.firstChild as Text;
			const after = (all[6] as RenderedSection).el.querySelector('p')?.lastChild as Text;
			const range = document.createRange();
			range.setStart(math, 2);
			range.setEnd(after, 6);
			const r = readingTarget(TEXT, all, range);
			expect('message' in r ? r.message : TEXT.slice(r.from, r.to)).toBe('holds');
		});
	});

	it('maps a selection in a callout title', () => {
		expect(target(7, 'Callout title')).toBe('Callout title');
	});
});
