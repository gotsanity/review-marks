// Per-test isolation for the end-to-end suite, run from the hooks in wdio.conf.mts.
// A spec file gets one Obsidian session, so anything a test leaves behind (open tabs, unsaved
// editor text, plugin settings) reaches the next test unless it's cleared here.
import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { VAULTS } from './fixtures.ts';

type Settings = Record<string, unknown>;

let initialSettings: Settings | null = null;

/**
 * Closes every note, resets the vault to the fixture vault and the plugin settings to their
 * values before the session's first test.
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
}

/**
 * Replaces every note in the vault with `files` and leaves the config dir alone. Use this, not
 * `obsidianPage.resetVault({ ... })`.
 *
 * wdio-obsidian-service 3.4 counts the config dir itself as one of the vault's folders. Given only
 * an object, `resetVault` sees no `.obsidian` in the new vault and deletes the whole dir. About
 * half a second later Obsidian reloads the missing config with its defaults, so the fixture
 * vault's settings flip mid-test: readable line length turns on and the editor text moves
 * sideways, away from any screen coordinates a test has already measured. The empty vault has a
 * `.obsidian` folder, so the reset keeps it.
 */
export const resetVaultTo = (files: Record<string, string>): Promise<void> => obsidianPage.resetVault(VAULTS.empty, files);
