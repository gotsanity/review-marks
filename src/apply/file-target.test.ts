import { describe, expect, it } from 'vitest';
import { planCreate } from '../core';
import { FileChangeTarget } from './file-target';

function fakeVault(initial: string) {
	const vault = {
		data: initial,
		process(_file: object, fn: (data: string) => string) {
			vault.data = fn(vault.data);
			return Promise.resolve(vault.data);
		},
	};
	return vault;
}
/** The fake vault never reads the file, so any object stands in for it. */
const file = {};

describe('FileChangeTarget', () => {
	it('writes a plan into a CRLF file and keeps its CRLF line breaks', async () => {
		const vault = fakeVault('# One\r\n\r\nAlpha beta.\r\n');
		await new FileChangeTarget(vault, file).apply((doc) =>
			planCreate(doc, { from: 7, to: 12, comment: 'Two\nlines', placement: 'end-of-section' }),
		);
		expect(vault.data).toBe('# One\r\n\r\n{Alpha}[^r1] beta.\r\n\r\n[^r1]: Two\r\n    lines\r\n');
	});

	it('leaves the file as it was on a refusal', async () => {
		const vault = fakeVault('Alpha.\r\n');
		const result = await new FileChangeTarget(vault, file).apply((doc) =>
			planCreate(doc, { from: 2, to: 2, comment: 'x', placement: 'end-of-section' }),
		);
		expect(result).toMatchObject({ refusal: 'empty-selection' });
		expect(vault.data).toBe('Alpha.\r\n');
	});
});
