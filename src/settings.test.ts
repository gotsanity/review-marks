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
