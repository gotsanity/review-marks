import { describe, expect, it } from 'vitest';
import { releaseDecision, type Release } from './release';

const release = (over: Partial<Release> = {}): Release => ({
	text: 'Some plain text to review.\n',
	ranges: [{ from: 5, to: 12 }],
	commentBoxOpen: false,
	down: 'content',
	...over,
});

describe('releaseDecision', () => {
	it('starts an Annotation on a single non-empty selection made in the note', () => {
		expect(releaseDecision(release())).toEqual({ start: { from: 5, to: 12 } });
	});

	it('starts a selection made right to left the same way', () => {
		expect(releaseDecision(release({ ranges: [{ from: 12, to: 5 }] }))).toEqual({ start: { from: 5, to: 12 } });
	});

	describe('ignores silently', () => {
		it('an empty selection (a plain click)', () => {
			expect(releaseDecision(release({ ranges: [{ from: 7, to: 7 }] }))).toEqual({ ignore: 'empty' });
		});

		it('no selection at all', () => {
			expect(releaseDecision(release({ ranges: [] }))).toEqual({ ignore: 'empty' });
		});

		it('multiple cursors', () => {
			const ranges = [
				{ from: 1, to: 3 },
				{ from: 5, to: 12 },
			];
			expect(releaseDecision(release({ ranges }))).toEqual({ ignore: 'multiple-ranges' });
		});

		it('any selection while a comment box is open', () => {
			expect(releaseDecision(release({ commentBoxOpen: true }))).toEqual({ ignore: 'comment-box-open' });
		});

		it('a pointer that went down outside the note content', () => {
			expect(releaseDecision(release({ down: 'elsewhere' }))).toEqual({ ignore: 'outside-content' });
		});

		it('a selection that starts on something that keeps its own drag', () => {
			expect(releaseDecision(release({ down: 'keeps-own' }))).toEqual({ ignore: 'keeps-own' });
		});

		it('a release with no pointerdown seen, as a keyboard selection has', () => {
			expect(releaseDecision(release({ down: null }))).toEqual({ ignore: 'not-pointer' });
		});

		it('a selection while a box is open, even one that went down in the content', () => {
			expect(releaseDecision(release({ commentBoxOpen: true, ranges: [{ from: 1, to: 2 }] }))).toEqual({
				ignore: 'comment-box-open',
			});
		});

		it('any selection in an Excalidraw drawing, which the plugin leaves alone', () => {
			const text = '---\nexcalidraw-plugin: parsed\n---\nSome drawing text.\n';
			expect(releaseDecision(release({ text, ranges: [{ from: 35, to: 42 }] }))).toEqual({ ignore: 'excalidraw' });
		});
	});

	describe('refuses with the Annotate selection notice', () => {
		it('a range that overlaps an Annotation', () => {
			const text = 'Some {text}[^r1] to review.\n\n[^r1]: One.\n';
			// "Some {te": starts outside the Annotation and ends inside its Target.
			expect(releaseDecision(release({ text, ranges: [{ from: 0, to: 8 }] }))).toEqual({
				refuse: 'the selection overlaps annotation [^r1].',
			});
		});

		it('a range that ends inside code', () => {
			const text = 'Run `npm test` now.\n';
			expect(releaseDecision(release({ text, ranges: [{ from: 0, to: 8 }] }))).toEqual({
				refuse: "an annotation can't start or end in code.",
			});
		});
	});

	describe('with a selection over rendered text, mapped to the note', () => {
		const text = 'Some plain text to review.\n';
		const rendered = { ranges: [{ from: 0, to: 4 }], text };

		it('starts an Annotation on the mapped range', () => {
			const map = () => ({ from: 5, to: 10 });
			expect(releaseDecision(release({ ...rendered, map }))).toEqual({ start: { from: 5, to: 10 } });
		});

		it('ignores a selection that lies entirely outside the note text', () => {
			const map = () => ({ failure: 'outside-note' as const, message: 'the selection is not in the note text.' });
			expect(releaseDecision(release({ ...rendered, map }))).toEqual({ ignore: 'outside-note' });
		});

		it('refuses a selection whose text cannot be found in the note', () => {
			const map = () => ({ failure: 'not-found' as const, message: 'could not find the selected text in the note.' });
			expect(releaseDecision(release({ ...rendered, map }))).toEqual({ refuse: 'could not find the selected text in the note.' });
		});

		it('refuses a mapped range the note cannot take', () => {
			const map = () => ({ from: 3, to: 7 });
			const withCode = 'Run `npm test` now.\n';
			expect(releaseDecision(release({ ranges: [{ from: 0, to: 4 }], text: withCode, map }))).toEqual({
				refuse: "an annotation can't start or end in code.",
			});
		});

		it('does not map a release it ignores anyway', () => {
			let mapped = false;
			const map = () => {
				mapped = true;
				return { from: 5, to: 10 };
			};
			releaseDecision(release({ ...rendered, map, commentBoxOpen: true }));
			releaseDecision(release({ ...rendered, map, ranges: [{ from: 2, to: 2 }] }));
			expect(mapped).toBe(false);
		});
	});
});
