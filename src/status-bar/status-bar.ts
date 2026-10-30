// Status bar (desktop only; mobile has none): "N annotations" for the active note, behind the
// "showStatusBar" setting. Clicking it opens the annotations sidebar.
import { MarkdownView, Platform, Setting, type Plugin } from 'obsidian';
import { parse } from '../core';
import type { SettingsSection } from '../settings-tab/settings-tab';
import type { SettingsStore } from '../settings';
import { countLabel, openSidebar } from '../sidebar/sidebar';

const REFRESH_DELAY = 250;

export function registerStatusBar(plugin: Plugin, store: SettingsStore): void {
	if (Platform.isMobile) return;
	const el = plugin.addStatusBarItem();
	el.addClass('rm-status-count', 'mod-clickable');
	el.setAttr('aria-label', 'Open annotations sidebar');
	el.addEventListener('click', () => void openSidebar(plugin));

	const ws = plugin.app.workspace;
	const update = () => {
		// The note last active in the main area, so focusing a sidebar keeps its count.
		const leaf = ws.getMostRecentLeaf(ws.rootSplit);
		const view = leaf?.view instanceof MarkdownView ? leaf.view : null;
		const show = store.current.showStatusBar && view !== null;
		el.toggleClass('rm-hidden', !show);
		if (view && show) el.setText(countLabel(parse(view.editor.getValue()).annotations.length));
	};
	let timer: number | null = null;
	const schedule = () => {
		if (timer !== null) window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			timer = null;
			update();
		}, REFRESH_DELAY);
	};

	plugin.registerEvent(ws.on('active-leaf-change', update));
	plugin.registerEvent(ws.on('file-open', update));
	plugin.registerEvent(ws.on('layout-change', update));
	plugin.registerEvent(ws.on('editor-change', schedule));
	plugin.registerEvent(plugin.app.vault.on('modify', schedule));
	plugin.register(store.onChange(update));
	plugin.register(() => {
		if (timer !== null) window.clearTimeout(timer);
	});
	ws.onLayoutReady(update);
}

export const statusBarSettings: SettingsSection = (containerEl, store) => {
	if (Platform.isMobile) return;
	new Setting(containerEl)
		.setName('Show annotation count in the status bar')
		.setDesc('The number of annotations in the active note. Click it to open the annotations sidebar.')
		.addToggle((toggle) =>
			toggle.setValue(store.current.showStatusBar).onChange((value) => store.update({ showStatusBar: value })),
		);
};
