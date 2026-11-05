import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { afterEach, beforeEach, describe, it } from 'mocha';

const FIELD = '.rm-trigger-field';

/** Saves the trigger through the store, as if chosen earlier. */
const storeTrigger = (trigger: string) =>
	browser.executeObsidian(async ({ plugins }, trigger) => {
		const plugin = plugins.reviewMarks as unknown as { store: { update(patch: { dragTrigger: string }): Promise<void> } };
		await plugin.store.update({ dragTrigger: trigger });
	}, trigger);

const storedTrigger = () =>
	browser.executeObsidian(({ plugins }) => (plugins.reviewMarks as unknown as { settings: { dragTrigger: string } }).settings.dragTrigger);

/** The field's text and the hint under it, read in the page. */
const field = () =>
	browser.executeObsidian(({ plugins }) => {
		const tab = (plugins.reviewMarks as unknown as { settingsTab: { containerEl: HTMLElement } }).settingsTab;
		return {
			text: tab.containerEl.querySelector('.rm-trigger-field')?.textContent ?? null,
			hint: tab.containerEl.querySelector('.rm-trigger-hint')?.textContent ?? '',
		};
	});

/** Notices in the main window and in the Settings window (its own window from 1.15). */
const notices = () =>
	browser.executeObsidian(({ plugins }) => {
		const tab = (plugins.reviewMarks as unknown as { settingsTab: { containerEl: HTMLElement } }).settingsTab;
		const docs = new Set([document, tab.containerEl.ownerDocument]);
		return [...docs].flatMap((doc) => Array.from(doc.querySelectorAll('.notice')).map((n) => n.textContent ?? ''));
	});

/**
 * Runs `act` with WebDriver in the window that shows our settings tab: the main window up to 1.14,
 * a window of its own from 1.15. Switches back to the main window afterwards, where
 * `executeObsidian` runs.
 */
async function inSettingsWindow(act: () => Promise<void>): Promise<void> {
	const main = await browser.getWindowHandle();
	try {
		for (const handle of await browser.getWindowHandles()) {
			await browser.switchToWindow(handle);
			if (await $(FIELD).isExisting()) return await act();
		}
		throw new Error('no window shows the drag trigger field');
	} finally {
		await browser.switchToWindow(main);
	}
}

/** A key going down or up, or a pause in milliseconds. */
type KeyStep = ['down' | 'up', string] | ['pause', number];

/**
 * Plays the steps as one WebDriver key action. Call it in the window that has focus. Keys still
 * down at the end are released, unless `hold` keeps them down for the next call.
 */
async function playKeys(steps: KeyStep[], hold = false): Promise<void> {
	const keys = browser.action('key');
	for (const [kind, value] of steps) {
		if (kind === 'pause') keys.pause(value);
		else if (kind === 'down') keys.down(value);
		else keys.up(value);
	}
	await keys.perform(hold);
}

/** Clicks the field with a real click, then presses the keys. */
const record = (...steps: KeyStep[]) =>
	inSettingsWindow(async () => {
		await $(FIELD).click();
		await playKeys(steps);
	});

describe('Drag trigger recorder', () => {
	beforeEach(async () => {
		await storeTrigger('alt');
		await browser.executeObsidian(({ app }) => {
			const setting = (app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting;
			setting.open();
			setting.openTabById('review-marks');
		});
	});

	afterEach(async () => {
		await browser.executeObsidian(({ app }) => {
			(app as unknown as { setting: { close(): void } }).setting.close();
			document.querySelectorAll('.notice').forEach((n) => n.remove());
		});
		await storeTrigger('alt');
	});

	it('shows the stored trigger in the field', async () => {
		expect((await field()).text).toBe('Alt');
	});

	it('saves Ctrl + Alt pressed and released together', async () => {
		await record(['down', Key.Ctrl], ['down', Key.Alt], ['pause', 50], ['up', Key.Ctrl], ['up', Key.Alt]);
		await browser.waitUntil(async () => (await storedTrigger()) === 'mod-alt');
		expect((await field()).text).toBe('Ctrl + Alt');
	});

	it('saves Ctrl + Alt when Alt is released first: the largest combination held counts', async () => {
		await record(['down', Key.Ctrl], ['down', Key.Alt], ['pause', 50], ['up', Key.Alt], ['pause', 50], ['up', Key.Ctrl]);
		await browser.waitUntil(async () => (await storedTrigger()) === 'mod-alt');
		expect((await field()).text).toBe('Ctrl + Alt');
	});

	it('saves only keys held at the same moment', async () => {
		await record(
			['down', Key.Ctrl],
			['down', Key.Alt],
			['pause', 50],
			['up', Key.Ctrl],
			['pause', 50],
			['down', Key.Shift],
			['pause', 50],
			['up', Key.Shift],
			['up', Key.Alt],
		);
		await browser.waitUntil(async () => (await storedTrigger()) === 'mod-alt');
		expect((await field()).text).toBe('Ctrl + Alt');
	});

	it('keeps the old trigger on Esc', async () => {
		await record(['down', Key.Shift], ['pause', 50], ['down', Key.Escape], ['up', Key.Escape], ['up', Key.Shift]);
		expect(await storedTrigger()).toBe('alt');
		expect((await field()).text).toBe('Alt');
	});

	it('ignores a letter with a hint and keeps recording', async () => {
		await inSettingsWindow(async () => {
			await $(FIELD).click();
			await playKeys([['down', Key.Shift], ['down', 'a'], ['up', 'a']], true);
		});
		const shown = await field();
		expect(shown.text).toBe('Shift…');
		expect(shown.hint).toContain('Only modifier keys count');
		expect(await storedTrigger()).toBe('alt');
		await inSettingsWindow(async () => {
			await playKeys([['up', Key.Shift]]);
		});
		await browser.waitUntil(async () => (await storedTrigger()) === 'shift');
		expect(await field()).toEqual({ text: 'Shift', hint: '' });
	});

	it("shows a notice and saves nothing for Ctrl + Meta, which can't be stored", async () => {
		await record(['down', Key.Ctrl], ['down', Key.Command], ['pause', 50], ['up', Key.Command], ['up', Key.Ctrl]);
		await browser.waitUntil(async () => (await notices()).some((n) => n.includes("can't be")));
		expect(await storedTrigger()).toBe('alt');
		expect((await field()).text).toBe('Alt');
	});

	it('turns the trigger off with the × button', async () => {
		await inSettingsWindow(async () => {
			await $('.rm-trigger-off').click();
		});
		await browser.waitUntil(async () => (await storedTrigger()) === 'off');
		expect((await field()).text).toBe('Off');
	});
});
