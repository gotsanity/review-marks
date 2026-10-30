import { describe, expect, it } from 'vitest';
import { lineOfOffset, lineStarts } from './index';

describe('lineOfOffset', () => {
	const text = '# One\n\nAlpha beta.\nGamma.';

	it('gives the 0-based line of an offset', () => {
		const starts = lineStarts(text);
		expect(lineOfOffset(starts, 0)).toBe(0);
		expect(lineOfOffset(starts, 5)).toBe(0);
		expect(lineOfOffset(starts, 6)).toBe(1);
		expect(lineOfOffset(starts, 7)).toBe(2);
		expect(lineOfOffset(starts, 18)).toBe(2);
		expect(lineOfOffset(starts, 19)).toBe(3);
		expect(lineOfOffset(starts, text.length)).toBe(3);
	});
});
