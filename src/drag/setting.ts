// The "Annotate-on-drag trigger" setting section.
import { Platform, Setting } from 'obsidian';
import type { SettingsSection } from '../settings-tab/settings-tab';
import { dragTriggerOptions, effectiveTrigger, isDragTrigger } from './trigger';

/** The dropdown. It shows the stored value as this platform reads it. */
export const dragSettings: SettingsSection = (containerEl, store) => {
	const isMac = Platform.isMacOS;
	new Setting(containerEl)
		.setName('Annotate-on-drag trigger')
		.setDesc(
			"Hold these keys while you drag-select text to annotate it at once. The editor's own behaviour for this combination is turned off while the setting is on.",
		)
		.addDropdown((dropdown) => {
			for (const [option, label] of dragTriggerOptions(isMac)) dropdown.addOption(option, label);
			dropdown.setValue(effectiveTrigger(store.current.dragTrigger, isMac)).onChange(async (v) => {
				if (isDragTrigger(v)) await store.update({ dragTrigger: v });
			});
		});
};
