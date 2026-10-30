import { describe, expect, it } from 'vitest';
import { adjacentAnnotation, annotationAt, parse } from './index';

const TEXT = 'Alpha {beta}[^r1] gamma {delta {eps}[^r3]}[^r2].\n\n[^r1]: One.\n[^r2]: Two.\n[^r3]: Three.\n[^r9]: Lost.\n';
const at = (s: string, plus = 0) => TEXT.indexOf(s) + plus;

describe('annotationAt', () => {
	const idAt = (pos: number) => annotationAt(parse(TEXT), pos)?.id ?? null;

	it('finds the Annotation from just before `{` to just after its marker', () => {
		expect(idAt(at('{beta'))).toBe('r1');
		expect(idAt(at('beta'))).toBe('r1');
		expect(idAt(at('[^r1]', 2))).toBe('r1');
		expect(idAt(at('[^r1]', 5))).toBe('r1');
	});

	it('finds nothing in plain text', () => {
		expect(idAt(0)).toBeNull();
		expect(idAt(at(' gamma', 2))).toBeNull();
	});

	it('prefers the innermost of nested Annotations', () => {
		expect(idAt(at('eps'))).toBe('r3');
		expect(idAt(at('delta'))).toBe('r2');
	});

	it('finds the Annotation from its definition, and a definition with no marker', () => {
		expect(idAt(at('[^r2]: Two', 9))).toBe('r2');
		expect(idAt(at('[^r9]: Lost', 3))).toBe('r9');
	});
});

describe('adjacentAnnotation', () => {
	const doc = parse(TEXT);
	const next = (pos: number) => adjacentAnnotation(doc, pos, 'next')?.id ?? null;
	const prev = (pos: number) => adjacentAnnotation(doc, pos, 'previous')?.id ?? null;

	it('steps through Targets in reading order', () => {
		expect(next(0)).toBe('r1');
		expect(next(at('beta'))).toBe('r2');
		expect(next(at('delta'))).toBe('r3');
		expect(prev(at('eps'))).toBe('r2');
		expect(prev(at('delta'))).toBe('r1');
	});

	it('wraps around at both ends', () => {
		expect(next(at('eps'))).toBe('r1');
		expect(next(TEXT.length)).toBe('r1');
		expect(prev(at('beta'))).toBe('r3');
		expect(prev(0)).toBe('r3');
	});

	it('steps from inside a Target to the next, wherever the cursor is in it', () => {
		expect(next(at('beta', 2))).toBe('r2');
		expect(prev(at('beta', 2))).toBe('r1');
	});

	it('finds nothing in a note without Annotations', () => {
		expect(adjacentAnnotation(parse('Plain.\n'), 0, 'next')).toBeNull();
	});
});
