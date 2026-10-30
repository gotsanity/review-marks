// The "Comment placement" control, for the settings tab to add with `addPlacementSetting`.
import { Setting } from 'obsidian';
import type { Placement } from './core';
import type { ReviewMarksSettings } from './settings';

/** What the control needs from the plugin. */
export interface SettingsHost {
	settings: ReviewMarksSettings;
	saveData(data: unknown): Promise<void>;
}

const OPTIONS: Record<Placement, string> = {
	'end-of-section': 'End of section',
	'end-of-note': 'End of note',
};

/** Adds the "Comment placement" dropdown to a settings tab. Saves on change. */
export function addPlacementSetting(containerEl: HTMLElement, host: SettingsHost): Setting {
	return new Setting(containerEl)
		.setName('Comment placement')
		.setDesc(
			'Where the comments of new annotations are written: before the next heading, or at the end of the note. ' +
				'Existing comments stay put; use the "Move comments" commands to convert a note.',
		)
		.addDropdown((dropdown) =>
			dropdown
				.addOptions(OPTIONS)
				.setValue(host.settings.placement)
				.onChange(async (value) => {
					host.settings.placement = value === 'end-of-note' ? 'end-of-note' : 'end-of-section';
					await host.saveData(host.settings);
				}),
		);
}
