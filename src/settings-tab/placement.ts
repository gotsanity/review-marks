// The "Comment placement" setting section.
import { Setting } from 'obsidian';
import type { Placement } from '../core';
import type { SettingsSection } from './settings-tab';

const OPTIONS: Record<Placement, string> = {
	'end-of-section': 'End of section',
	'end-of-note': 'End of note',
};

/** The dropdown. It only affects new annotations. */
export const placementSettings: SettingsSection = (containerEl, store) => {
	new Setting(containerEl)
		.setName('Comment placement')
		.setDesc(
			'Where the comments of new annotations are written: before the next heading, or at the end of the note. ' +
				'Existing comments stay where they are; the "Move comments" commands convert a note.',
		)
		.addDropdown((dropdown) =>
			dropdown
				.addOptions(OPTIONS)
				.setValue(store.current.placement)
				.onChange(async (v) => {
					if (v === 'end-of-section' || v === 'end-of-note') await store.update({ placement: v });
				}),
		);
};
