// Per-test isolation for the end-to-end suite, run from the hooks in wdio.conf.mts.
// A spec file gets one Obsidian session, so anything a test leaves behind (open tabs, unsaved
// editor text, plugin settings) reaches the next test unless it's cleared here.
import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

type Settings = Record<string, unknown>;

let initialSettings: Settings | null = null;

/**
 * Closes every note, resets the vault to the fixture vault and the plugin settings to their
 * values before the session's first test, then waits for the window layout to settle.
 *
 * Tabs must close before the reset. When `resetVault` rewrites a note that an open tab has
 * unsaved edits in (Obsidian saves about 2s after the last edit), Obsidian 1.14 merges the
 * tab's edits into the new content, so the previous test's text leaks into the next one.
 */
export async function freshState(): Promise<void> {
	await browser.executeObsidian(async ({ app, obsidian }) => {
		const leaves = app.workspace.getLeavesOfType('markdown');
		for (const leaf of leaves) {
			if (leaf.view instanceof obsidian.MarkdownView) await leaf.view.save();
		}
		for (const leaf of leaves) leaf.detach();
	});
	await obsidianPage.resetVault();
	if (!initialSettings) {
		initialSettings = await browser.executeObsidian(({ plugins }) =>
			structuredClone((plugins.reviewMarks as unknown as { settings: Settings }).settings),
		);
	} else {
		await browser.executeObsidian(({ plugins }, settings) => {
			const plugin = plugins.reviewMarks as unknown as { settings: Settings };
			for (const key of Object.keys(plugin.settings)) delete plugin.settings[key];
			Object.assign(plugin.settings, settings);
		}, initialSettings);
	}
	await waitForStableLayout();
}

/**
 * Waits until fonts are loaded and the window and workspace geometry have held still for
 * three samples in a row. On CI the window manager resizes the window shortly after Obsidian
 * starts; a test that measures screen coordinates before that (the drag specs) aims at the
 * wrong characters once the text moves.
 */
export async function waitForStableLayout(): Promise<void> {
	let last = '';
	let same = 0;
	await browser.waitUntil(
		async () => {
			const now = await browser.executeObsidian(async ({ app }) => {
				await document.fonts.ready;
				await new Promise((resolve) => window.setTimeout(resolve, 150));
				const r = app.workspace.containerEl.getBoundingClientRect();
				return `${app.workspace.layoutReady} ${window.innerWidth}x${window.innerHeight} ${r.left},${r.top},${r.width},${r.height}`;
			});
			same = now === last && now.startsWith('true ') ? same + 1 : 0;
			last = now;
			return same >= 2;
		},
		{ timeout: 15 * 1000, interval: 0, timeoutMsg: 'the Obsidian window layout never settled' },
	);
}
