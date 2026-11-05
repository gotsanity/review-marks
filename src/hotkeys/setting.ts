// The Hotkeys section of the settings tab: every Review Marks command with its current hotkeys,
// read-only, with hotkeys other commands also use in red. Recording happens in Obsidian's own
// Hotkeys tab.
import { Setting, type App } from 'obsidian';
import { hotkeyReader, hotkeysTabOpener, registeredCommands } from '../guards';
import type { SettingsSection } from '../settings-tab/settings-tab';
import { conflictCheck, effectiveHotkeys } from './conflicts';
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
		const readHotkeys = hotkeyReader(app);
		const prefix = `${manifest.id}:`;
		const registered = registeredCommands(app);
		const alsoUsedBy = readHotkeys
			? conflictCheck(registered.map((c) => ({ id: c.id, name: c.name, ...readHotkeys(c.id) })), isMac)
			: () => [];
		const commands = registered
			.filter((c) => c.id.startsWith(prefix))
			.map((c) => ({ id: c.id, name: c.name.replace(`${manifest.name}: `, '') }))
			.sort((a, b) => a.name.localeCompare(b.name));

		new Setting(containerEl).setName('Hotkeys').setHeading();
		new Setting(containerEl)
			.setDesc('Hotkeys for these commands are set in Obsidian’s hotkeys settings.')
			.addButton((button) => button.setButtonText('Open hotkeys settings').onClick(openHotkeys));

		for (const command of commands) {
			const row = new Setting(containerEl).setName(command.name);
			row.addExtraButton((button) =>
				button.setIcon('settings').setTooltip('Change in hotkeys settings').onClick(openHotkeys),
			);
			const chips = row.controlEl.createDiv({ cls: 'setting-command-hotkeys' });
			if (!readHotkeys) continue;
			const hotkeys = effectiveHotkeys(readHotkeys(command.id));
			for (const hotkey of hotkeys) {
				const text = printHotkey(hotkey, isMac);
				const others = alsoUsedBy(command.id, hotkey);
				if (others.length === 0) chips.createSpan({ cls: 'setting-hotkey', text });
				else
					chips.createSpan({
						cls: 'setting-hotkey rm-hotkey-conflict',
						text,
						attr: { 'aria-label': `Also used by ${others.join(', ')}` },
					});
			}
			if (hotkeys.length === 0) chips.createSpan({ cls: 'setting-hotkey mod-empty', text: 'Blank' });
		}
	};
}
