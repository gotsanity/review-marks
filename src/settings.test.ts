import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, settingsFrom } from './settings';

describe('settingsFrom', () => {
	it('defaults the display settings: badge on, 32 characters, hover on, review footnotes hidden', () => {
		expect(settingsFrom(null)).toMatchObject({
			showBadge: true,
			excerptLength: 32,
			showHover: true,
			hideReviewFootnotes: true,
		});
	});

	it('keeps stored display settings and drops mistyped ones', () => {
		expect(settingsFrom({ showBadge: false, showHover: false, hideReviewFootnotes: false, excerptLength: 10 })).toMatchObject({
			showBadge: false,
			showHover: false,
			hideReviewFootnotes: false,
			excerptLength: 10,
		});
		expect(settingsFrom({ showBadge: 'no', showHover: 0, hideReviewFootnotes: null, excerptLength: -3 })).toEqual(DEFAULT_SETTINGS);
	});
});

describe('settingsFrom: status bar count', () => {
	it('shows the count by default and keeps a stored choice', () => {
		expect(settingsFrom(null).showStatusBar).toBe(true);
		expect(settingsFrom({ showStatusBar: false }).showStatusBar).toBe(false);
		expect(settingsFrom({ showStatusBar: 'no' }).showStatusBar).toBe(true);
	});
});

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

describe('settingsFrom: strip annotations from exports', () => {
	it('is off by default and keeps a stored boolean', () => {
		expect(settingsFrom(null).stripFromExports).toBe(false);
		expect(settingsFrom({ stripFromExports: true }).stripFromExports).toBe(true);
		expect(settingsFrom({ stripFromExports: 'yes' }).stripFromExports).toBe(false);
	});
});
