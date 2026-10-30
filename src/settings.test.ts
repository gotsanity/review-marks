import { describe, expect, it } from 'vitest';
import { settingsFrom } from './settings';

describe('settingsFrom: annotate-on-drag trigger', () => {
	it('defaults to Alt', () => {
		expect(settingsFrom(null).dragTrigger).toBe('alt');
		expect(settingsFrom({}).dragTrigger).toBe('alt');
	});

	it('keeps a stored trigger, including one from the other platform', () => {
		expect(settingsFrom({ dragTrigger: 'off' }).dragTrigger).toBe('off');
		expect(settingsFrom({ dragTrigger: 'ctrl-alt' }).dragTrigger).toBe('ctrl-alt');
	});

	it('falls back to Alt for an unknown value', () => {
		expect(settingsFrom({ dragTrigger: 'hyper' }).dragTrigger).toBe('alt');
		expect(settingsFrom({ dragTrigger: true }).dragTrigger).toBe('alt');
	});
});
