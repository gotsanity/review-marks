// Window-wide listeners have to be added to each Obsidian window: the main one and every popout.
import type { Plugin } from 'obsidian';

/**
 * Calls `attach` once for the main window, for each popout window already open and for each one
 * that opens later. Listeners added with `plugin.registerDomEvent` are removed on unload.
 */
export function onEveryWindow(plugin: Plugin, attach: (win: Window) => void): void {
	const seen = new WeakSet<Window>();
	const add = (win: Window) => {
		if (seen.has(win)) return;
		seen.add(win);
		attach(win);
	};
	add(window);
	plugin.app.workspace.iterateAllLeaves((leaf) => add(leaf.view.containerEl.win));
	plugin.registerEvent(plugin.app.workspace.on('window-open', (_, win) => add(win)));
}
