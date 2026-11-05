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

/** A point on screen, in CSS pixels from the window's top left. */
export type Point = { x: number; y: number };

/**
 * Drags from `start` to `end` with real WebDriver pointer actions, in four steps, holding `key`
 * when given (Review Mode drags with no key held). The key goes down before the button and comes
 * up one tick after it. With `release: false` the button and key stay down, so a test can look at
 * the drag in progress; it must call `browser.releaseActions()` afterwards.
 */
export async function pointerDrag(start: Point, end: Point, { key, release = true }: { key?: string; release?: boolean } = {}): Promise<void> {
	const pointer = browser.action('pointer').move(start).down().pause(50);
	for (let i = 1; i <= 4; i++) {
		pointer.move({ x: Math.round(start.x + ((end.x - start.x) * i) / 4), y: Math.round(start.y + ((end.y - start.y) * i) / 4) });
	}
	if (release) pointer.up();
	const sources = [pointer.toJSON()];
	if (key) {
		const keys = browser.action('key').down(key);
		if (release) {
			// Ticks: move, down, pause, 4 moves, up. The key comes up one tick after the button.
			for (let i = 0; i < 7; i++) keys.pause(0);
			keys.up(key);
		}
		sources.unshift(keys.toJSON());
	}
	await browser.performActions(sources);
	if (release) await browser.releaseActions();
}

/** Double-clicks at `point` with real WebDriver pointer actions. */
export async function doubleClick(point: Point): Promise<void> {
	await browser.action('pointer').move(point).down().up().pause(10).down().up().perform();
}
