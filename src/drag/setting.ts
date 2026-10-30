// The "Annotate-on-drag trigger" control, for the settings tab to add.
import { Platform, Setting } from 'obsidian';
import { dragTriggerOptions, effectiveTrigger, isDragTrigger, type DragTrigger } from './trigger';

/** Adds the dropdown to `containerEl`. It shows the stored value as this platform reads it. */
export function addDragTriggerSetting(
	containerEl: HTMLElement,
	value: DragTrigger,
	onChange: (trigger: DragTrigger) => void | Promise<void>,
	isMac: boolean = Platform.isMacOS,
): Setting {
	return new Setting(containerEl)
		.setName('Annotate-on-drag trigger')
		.setDesc(
			"Hold these keys while you drag-select text to annotate it at once. The editor's own behaviour for this combination is turned off while the setting is on.",
		)
		.addDropdown((dropdown) => {
			for (const [option, label] of dragTriggerOptions(isMac)) dropdown.addOption(option, label);
			dropdown.setValue(effectiveTrigger(value, isMac)).onChange(async (v) => {
				if (isDragTrigger(v)) await onChange(v);
			});
		});
}
