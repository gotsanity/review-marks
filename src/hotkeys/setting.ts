// The Hotkeys section of the settings tab: every Review Marks command with its current hotkeys,
// read-only. Recording happens in Obsidian's own Hotkeys tab.
import { Setting, type App } from 'obsidian';
import { hotkeyReader, hotkeysTabOpener, registeredCommands } from '../guards';
import type { SettingsSection } from '../settings-tab/settings-tab';
import { printHotkey } from './printer';

/** What the section needs from the plugin. */
export interface HotkeysPlugin {
	app: App;
	manifest: { id: string; name: string };
}

/** Builds the section. It re-reads commands and hotkeys each time the tab is drawn. */
export function hotkeysSettings(plugin: HotkeysPlugin, isMac: boolean): SettingsSection {
	return (containerEl) => {
		const { app, manifest } = plugin;
		const openTab = hotkeysTabOpener(app);
		if (!openTab) return;
		const openHotkeys = () => openTab(manifest.name);
		const hotkeysOf = hotkeyReader(app);
		const prefix = `${manifest.id}:`;
		const commands = registeredCommands(app)
			.filter((c) => c.id.startsWith(prefix))
			.map((c) => ({ id: c.id, name: c.name.replace(`${manifest.name}: `, '') }))
			.sort((a, b) => a.name.localeCompare(b.name));

		new Setting(containerEl).setName('Hotkeys').setHeading();
		new Setting(containerEl)
			.setDesc('Hotkeys for these commands are set in Obsidian’s Hotkeys settings.')
			.addButton((button) => button.setButtonText('Open Hotkeys settings').onClick(openHotkeys));

		for (const command of commands) {
			const row = new Setting(containerEl).setName(command.name);
			row.addExtraButton((button) =>
				button.setIcon('settings').setTooltip('Change in Hotkeys settings').onClick(openHotkeys),
			);
			const chips = row.controlEl.createDiv({ cls: 'setting-command-hotkeys' });
			if (!hotkeysOf) continue;
			const hotkeys = hotkeysOf(command.id);
			for (const hotkey of hotkeys) chips.createSpan({ cls: 'setting-hotkey', text: printHotkey(hotkey, isMac) });
			if (hotkeys.length === 0) chips.createSpan({ cls: 'setting-hotkey mod-empty', text: 'Blank' });
		}
	};
}
