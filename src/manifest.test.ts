import { describe, expect, it } from 'vitest';
import manifest from '../manifest.json';

describe('plugin manifest', () => {
	it('sets the Obsidian floor to 1.7.4', () => {
		expect(manifest.minAppVersion).toBe('1.7.4');
	});
});
