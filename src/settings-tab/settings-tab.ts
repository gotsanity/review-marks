// The plugin's settings tab. It owns no controls itself: each feature adds a section with
// `addSection(order, render)`, so features land without editing this file.
import { PluginSettingTab, type App, type Plugin } from 'obsidian';
import type { SettingsStore } from '../settings';

/**
 * Draws one feature's controls into the tab with `new Setting(containerEl)`. Read values from
 * `store.current` and save with `store.update({ … })`, which also applies them to open notes.
 */
export type SettingsSection = (containerEl: HTMLElement, store: SettingsStore) => void;

/** Where each feature's section sits in the tab, top to bottom (the spec's order). */
export const SECTION_ORDER = {
	placement: 10,
	highlight: 20,
	display: 30,
	drag: 40,
	statusBar: 50,
	export: 60,
} as const;

export class ReviewMarksSettingTab extends PluginSettingTab {
	private readonly sections: { order: number; render: SettingsSection }[] = [];

	constructor(
		app: App,
		plugin: Plugin,
		private readonly store: SettingsStore,
	) {
		super(app, plugin);
	}

	/** Adds a section. Sections are drawn by `order` (see `SECTION_ORDER`), ties in the order added. */
	addSection(order: number, render: SettingsSection): void {
		this.sections.push({ order, render });
		this.sections.sort((a, b) => a.order - b.order);
	}

	display(): void {
		this.containerEl.empty();
		for (const section of this.sections) section.render(this.containerEl, this.store);
	}
}
