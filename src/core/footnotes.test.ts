import { describe, expect, it } from 'vitest';
import { footnoteListLabels, footnoteOrder, isReviewLabel } from './index';

describe('footnoteOrder', () => {
	it('lists defined labels in order of their first reference, as Reading view numbers them', () => {
		const text = 'A {t}[^r2] and[^a] then {u}[^r1] and[^a] again.\n\n[^r1]: One.\n[^a]: Author.\n[^r2]: Two.\n';
		expect(footnoteOrder(text)).toEqual(['r2', 'a', 'r1']);
	});

	it('leaves out references with no definition', () => {
		expect(footnoteOrder('A[^x] and[^a].\n\n[^a]: Author.\n')).toEqual(['a']);
	});

	it('does not count a definition line as a reference', () => {
		expect(footnoteOrder('[^a]: Author.\n\nLater[^a].\n')).toEqual(['a']);
	});
});

describe('footnoteListLabels', () => {
	const text = 'A {t}[^r1] and[^a].\n\n[^a]: Author.\n[^r1]: One.\n';

	it('labels each item of the rendered footnote list', () => {
		expect(footnoteListLabels(text, 2)).toEqual(['r1', 'a']);
	});

	it('gives up when the list does not have one item per footnote', () => {
		expect(footnoteListLabels(text, 3)).toBeNull();
		expect(footnoteListLabels(text, 1)).toBeNull();
	});

	it('leaves the footnote list of an Excalidraw drawing alone', () => {
		const text = '---\nexcalidraw-plugin: parsed\n---\n{a}[^r1]\n\n[^r1]: x\n';
		expect(footnoteListLabels(text, 1)).toBeNull();
	});
});

describe('isReviewLabel', () => {
	it('is true for rN labels only', () => {
		expect(isReviewLabel('r12')).toBe(true);
		expect(isReviewLabel('a')).toBe(false);
		expect(isReviewLabel('r')).toBe(false);
		expect(isReviewLabel('ref1')).toBe(false);
	});
});
