// The "Comment placement" control, for the settings tab to add.
import { Setting } from 'obsidian';
import type { Placement } from './core';

const OPTIONS: Record<Placement, string> = {
	'end-of-section': 'End of section',
	'end-of-note': 'End of note',
};

/** Adds the dropdown to `containerEl`. It only affects new annotations. */
export function addPlacementSetting(
	containerEl: HTMLElement,
	value: Placement,
	onChange: (placement: Placement) => void | Promise<void>,
): Setting {
	return new Setting(containerEl)
		.setName('Comment placement')
		.setDesc(
			'Where the comments of new annotations are written: before the next heading, or at the end of the note. ' +
				'Existing comments stay where they are; the "Move comments" commands convert a note.',
		)
		.addDropdown((dropdown) =>
			dropdown
				.addOptions(OPTIONS)
				.setValue(value)
				.onChange(async (v) => {
					if (v === 'end-of-section' || v === 'end-of-note') await onChange(v);
				}),
		);
}
