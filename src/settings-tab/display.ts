// Display settings: the badge, the popover and the footnote list.
import { Setting } from 'obsidian';
import type { SettingsSection } from './settings-tab';

export const displaySettings: SettingsSection = (containerEl, store) => {
	new Setting(containerEl)
		.setName('Show comment badge')
		.setDesc('A pill after each annotation with the start of its comment.')
		.addToggle((toggle) =>
			toggle.setValue(store.current.showBadge).onChange((value) => store.update({ showBadge: value })),
		);

	new Setting(containerEl)
		.setName('Badge excerpt length')
		.setDesc('How many characters of the comment the badge shows.')
		.addText((text) => {
			text.inputEl.type = 'number';
			text.inputEl.min = '1';
			text.setValue(String(store.current.excerptLength)).onChange(async (value) => {
				const length = Number.parseInt(value, 10);
				if (length > 0) await store.update({ excerptLength: length });
			});
		});

	new Setting(containerEl)
		.setName('Show comment on hover')
		.setDesc('Hovering an annotation shows its full comment. On mobile, tap the annotation instead. Clicking the badge always shows it.')
		.addToggle((toggle) =>
			toggle.setValue(store.current.showHover).onChange((value) => store.update({ showHover: value })),
		);

	new Setting(containerEl)
		.setName('Hide review footnotes in the footnote list')
		.setDesc('In reading view, the footnote list at the end of the note leaves out review comments. Your own footnotes and their numbers stay.')
		.addToggle((toggle) =>
			toggle
				.setValue(store.current.hideReviewFootnotes)
				.onChange((value) => store.update({ hideReviewFootnotes: value })),
		);
};
