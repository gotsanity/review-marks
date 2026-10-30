// The highlight colour as CSS variables. Pure: no Obsidian imports, unit tested. The setting and its wiring are in setting.ts.

const PROPS = ['--rm-highlight', '--rm-highlight-revealed', '--rm-accent'] as const;

/**
 * The CSS variables for a colour: `#rrggbb` gives a translucent fill, a fainter fill for a Target
 * the cursor is in, and a stronger accent. An empty colour clears them, so the theme's apply.
 */
export function highlightProps(colour: string): Record<string, string> {
	if (colour === '') return Object.fromEntries(PROPS.map((p) => [p, '']));
	return {
		'--rm-highlight': `${colour}66`,
		'--rm-highlight-revealed': `${colour}33`,
		'--rm-accent': `${colour}cc`,
	};
}

/** `#rrggbb` for a computed `rgb()`/`rgba()` or hex colour, without its alpha; null otherwise. */
export function hexOf(css: string): string | null {
	const value = css.trim().toLowerCase();
	const hex = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(value);
	if (hex) return `#${hex[1]}`;
	const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
	if (!rgb) return null;
	return '#' + rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');
}
