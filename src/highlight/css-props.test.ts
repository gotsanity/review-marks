import { describe, expect, it } from 'vitest';
import { highlightProps, hexOf } from './css-props';

describe('hexOf', () => {
	it('reads the colour picker value from a computed theme colour, dropping its alpha', () => {
		expect(hexOf('rgba(255, 208, 0, 0.4)')).toBe('#ffd000');
		expect(hexOf(' rgb(3,4,250)')).toBe('#0304fa');
		expect(hexOf('#ABCDEF')).toBe('#abcdef');
		expect(hexOf('#abcdef66')).toBe('#abcdef');
	});

	it('gives null for what it cannot read', () => {
		expect(hexOf('')).toBeNull();
		expect(hexOf('hsl(10 20% 30%)')).toBeNull();
	});
});

describe('highlightProps', () => {
	it("clears every override for the theme's colour, so styles.css's theme defaults apply", () => {
		expect(highlightProps('')).toEqual({
			'--rm-highlight': '',
			'--rm-highlight-revealed': '',
			'--rm-accent': '',
		});
	});

	it('derives a translucent fill, a fainter revealed fill and a stronger accent from a chosen colour', () => {
		expect(highlightProps('#3a7bd5')).toEqual({
			'--rm-highlight': '#3a7bd566',
			'--rm-highlight-revealed': '#3a7bd533',
			'--rm-accent': '#3a7bd5cc',
		});
	});
});
