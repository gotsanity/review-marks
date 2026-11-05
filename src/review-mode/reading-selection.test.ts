// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { block, rangeOver } from '../test-support/fake-dom';
import type { RenderedSection } from '../reading-annotate/reading-range';
import { releaseDecision } from './release';
import { readingSelectionRelease } from './reading-selection';

const TEXT = [
	'Kell **fails** the save.', //        line 0
	'', //                                line 1
	'> [!note] Callout title', //         line 2
	'> Callout body.', //                 line 3
	'', //                                line 4
	'Energy $E=mc^2$ holds.', //          line 5
	'', //                                line 6
	'See the note[^1] here.', //          line 7
	'', //                                line 8
	'[^1]: The footnote text.', //        line 9
].join('\n');

function sections(): RenderedSection[] {
	return [
		{ el: block('<p>Kell <strong>fails</strong> the save.</p>'), lineStart: 0, lineEnd: 0 },
		{
			el: block(
				'<div class="callout" data-callout="note"><div class="callout-title"><div class="callout-title-icon"></div>' +
					'<div class="callout-title-inner">Callout title</div></div><div class="callout-content"><p>Callout body.</p></div></div>',
			),
			lineStart: 2,
			lineEnd: 3,
		},
		{ el: block('<p>Energy <span class="math math-inline"><mjx-container>E = m c 2</mjx-container></span> holds.</p>'), lineStart: 5, lineEnd: 5 },
		{ el: block('<p>See the note<sup class="footnote-ref"><a href="#fn-1">[1]</a></sup> here.</p>'), lineStart: 7, lineEnd: 7 },
		{
			el: block('<section class="footnotes"><hr><ol><li id="fn-1"><p>The footnote text. <a class="footnote-backref">↩︎</a></p></li></ol></section>'),
			lineStart: 9,
			lineEnd: 9,
		},
	];
}

/** What releasing the pointer over `ranges` in Reading view does, with the note's text for a start. */
function decide(all: RenderedSection[], ranges: Range[], over: { down?: 'content' | 'keeps-own' | 'elsewhere'; commentBoxOpen?: boolean } = {}) {
	const d = releaseDecision(readingSelectionRelease(TEXT, all, ranges, over.down ?? 'content', over.commentBoxOpen ?? false));
	return 'start' in d ? TEXT.slice(d.start.from, d.start.to) : d;
}

const over = (all: RenderedSection[], i: number, needle: string) => rangeOver((all[i] as RenderedSection).el, needle);

describe('a Review Mode release in Reading view', () => {
	it('starts an Annotation on the selected text, formatting included', () => {
		const all = sections();
		expect(decide(all, [over(all, 0, 'fails the save')])).toBe('**fails** the save');
	});

	it('starts one on a callout title', () => {
		const all = sections();
		expect(decide(all, [over(all, 1, 'Callout title')])).toBe('Callout title');
	});

	it('starts one on a selection spanning two sections', () => {
		const all = sections();
		const range = document.createRange();
		range.setStart((all[0] as RenderedSection).el.querySelector('p')?.lastChild as Text, 1);
		range.setEnd((all[1] as RenderedSection).el.querySelector('.callout-title-inner')?.firstChild as Text, 7);
		expect(decide(all, [range])).toBe('the save.\n\n> [!note] Callout');
	});

	it('clips a selection running on into the footnote list', () => {
		const all = sections();
		const range = document.createRange();
		range.setStart((all[3] as RenderedSection).el.querySelector('p')?.lastChild as Text, 1);
		range.setEnd((all[4] as RenderedSection).el.querySelector('li p')?.firstChild as Text, 8);
		expect(decide(all, [range])).toBe('here.');
	});

	it('clips a selection starting in math', () => {
		const all = sections();
		const range = document.createRange();
		const p = (all[2] as RenderedSection).el;
		range.setStart(p.querySelector('mjx-container')?.firstChild as Text, 2);
		range.setEnd(p.querySelector('p')?.lastChild as Text, 6);
		expect(decide(all, [range])).toBe('holds');
	});

	describe('ignores silently', () => {
		it('a selection lying entirely in the footnote list', () => {
			const all = sections();
			expect(decide(all, [over(all, 4, 'footnote text')])).toEqual({ ignore: 'outside-note' });
		});

		it('a selection lying entirely in math', () => {
			const all = sections();
			expect(decide(all, [over(all, 2, 'm c')])).toEqual({ ignore: 'outside-note' });
		});

		it('a selection outside the rendered note', () => {
			expect(decide(sections(), [rangeOver(block('<p>Somewhere else</p>'), 'else')])).toEqual({ ignore: 'outside-note' });
		});

		it('a selection that starts on an embed, a badge or the comment box', () => {
			const all = sections();
			expect(decide(all, [over(all, 0, 'fails')], { down: 'keeps-own' })).toEqual({ ignore: 'keeps-own' });
		});

		it('a selection that starts outside the rendered note', () => {
			const all = sections();
			expect(decide(all, [over(all, 0, 'fails')], { down: 'elsewhere' })).toEqual({ ignore: 'outside-content' });
		});

		it('a click with no selection', () => {
			const all = sections();
			const range = document.createRange();
			range.setStart((all[0] as RenderedSection).el.querySelector('p')?.firstChild as Text, 2);
			expect(decide(all, [range])).toEqual({ ignore: 'empty' });
		});

		it('a selection while a comment box is open', () => {
			const all = sections();
			expect(decide(all, [over(all, 0, 'fails')], { commentBoxOpen: true })).toEqual({ ignore: 'comment-box-open' });
		});
	});

	it('says Reading view is unavailable here when no section can be read', () => {
		const all = sections();
		const d = decide([], [over(all, 0, 'fails')]);
		expect(d).toEqual({ refuse: "can't annotate in Reading view here. Switch to Live Preview to annotate." });
	});
});
