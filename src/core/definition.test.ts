import { describe, expect, it } from 'vitest';
import { excerpt } from './index';

describe('excerpt', () => {
	it('shows a short one-line Comment whole', () => {
		expect(excerpt('Check the recording.', 32)).toBe('Check the recording.');
	});

	it('cuts a long Comment to the length and marks the cut', () => {
		expect(excerpt('Check the recording (~00:04): was it "hatred" or "contempt"?', 32)).toBe(
			'Check the recording (~00:04): wa…',
		);
	});

	it('marks further lines even when the first line fits', () => {
		expect(excerpt('First line.\nSecond line.', 32)).toBe('First line.…');
	});

	it('does not leave a space before the ellipsis', () => {
		expect(excerpt('abcd efgh', 5)).toBe('abcd…');
	});
});
