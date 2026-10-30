// The "Highlight colour" setting and its wiring (Obsidian side; the colour maths is pure, in
// css-props.ts). styles.css draws Targets with the theme's highlight colour; a chosen colour
// overrides its CSS variables on the body of every Obsidian window.
import { Setting, type ColorComponent, type Plugin } from 'obsidian';
import type { SettingsSection } from '../settings-tab/settings-tab';
import type { SettingsStore } from '../settings';
import { hexOf, highlightProps } from './css-props';

/**
 * Applies the setting to every window now, to popout windows as they open and again whenever it
 * changes; clears it on unload.
 */
export function registerHighlightColour(plugin: Plugin, store: SettingsStore): void {
	const bodies = new Set<HTMLElement>([document.body]);
	const apply = () => {
		const props = highlightProps(store.current.highlightColour);
		for (const body of bodies) body.setCssProps(props);
	};
	plugin.registerEvent(
		plugin.app.workspace.on('window-open', (win) => {
			bodies.add(win.doc.body);
			apply();
		}),
	);
	plugin.registerEvent(plugin.app.workspace.on('window-close', (win) => bodies.delete(win.doc.body)));
	plugin.register(() => {
		const clear = highlightProps('');
		for (const body of bodies) body.setCssProps(clear);
	});
	plugin.register(store.onChange(apply));
	apply();
}

/**
 * The theme's highlight colour as `#rrggbb`, for the colour picker. Themes may give it as any CSS
 * colour (Obsidian 1.14 uses `color-mix()`), so it is painted on a canvas and read back.
 */
function themeHex(doc: Document): string {
	const probe = doc.body.createDiv({ cls: 'rm-theme-probe' });
	const colour = getComputedStyle(probe).backgroundColor;
	probe.remove();
	if (colour === 'rgba(0, 0, 0, 0)' || colour === 'transparent') return FALLBACK;
	const exact = hexOf(colour);
	if (exact) return exact;
	const canvas = probe.createEl('canvas');
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return FALLBACK;
	ctx.fillStyle = colour;
	ctx.fillRect(0, 0, 1, 1);
	const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
	return a === 0 ? FALLBACK : (hexOf(`rgb(${r}, ${g}, ${b})`) ?? FALLBACK);
}

const FALLBACK = '#ffd000';

export const highlightSettings: SettingsSection = (containerEl, store) => {
	const theme = () => themeHex(containerEl.doc);
	let resetting = false;
	let picker: ColorComponent | null = null;
	new Setting(containerEl)
		.setName('Highlight colour')
		.setDesc("The colour of highlighted passages. By default, your theme's highlight colour.")
		.addColorPicker((p) => {
			picker = p;
			p.setValue(store.current.highlightColour || theme()).onChange(async (value) => {
				if (!resetting) await store.update({ highlightColour: value });
			});
		})
		.addExtraButton((button) =>
			button
				.setIcon('rotate-ccw')
				.setTooltip("Use the theme's highlight colour")
				.onClick(async () => {
					await store.update({ highlightColour: '' });
					resetting = true;
					picker?.setValue(theme());
					resetting = false;
				}),
		);
};
