import { browser, expect } from '@wdio/globals';
import { afterEach, describe, it } from 'mocha';

type Hotkey = { modifiers: string[]; key: string };

const ANNOTATE = 'review-marks:annotate-selection';
const NEXT = 'review-marks:go-to-next-annotation';

/** Sets hotkeys in memory only (never saved), as the user would in the Hotkeys tab. */
const setHotkeys = (hotkeys: Record<string, Hotkey[]>) =>
	browser.executeObsidian(({ app }, hotkeys) => {
		const manager = (app as unknown as { hotkeyManager: { setHotkeys(id: string, h: Hotkey[]): void } }).hotkeyManager;
		for (const [id, list] of Object.entries(hotkeys)) manager.setHotkeys(id, list);
	}, hotkeys);

/** Opens Settings on our tab, which draws it afresh. */
const openOurTab = () =>
	browser.executeObsidian(({ app }) => {
		const setting = (app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting;
		setting.open();
		setting.openTabById('review-marks');
	});

/** Every Review Marks command Obsidian has registered: id, name without the plugin prefix, defaults. */
const ourCommands = () =>
	browser.executeObsidian(({ app }) => {
		const commands = (app as unknown as { commands: { commands: Record<string, { id: string; name: string; hotkeys?: unknown[] }> } })
			.commands.commands;
		return Object.values(commands)
			.filter((c) => c.id.startsWith('review-marks:'))
			.map((c) => ({ id: c.id, name: c.name.replace('Review Marks: ', ''), defaults: c.hotkeys ?? [] }));
	});

/** The section's command rows, as [name, chip texts], in the order shown. */
const rows = () =>
	browser.executeObsidian(({ plugins }) => {
		const tab = (plugins.reviewMarks as unknown as { settingsTab: { containerEl: HTMLElement } }).settingsTab;
		return Array.from(tab.containerEl.querySelectorAll('.setting-item'))
			.filter((item) => item.querySelector('.setting-command-hotkeys'))
			.map((item): [string, string[]] => [
				item.querySelector('.setting-item-name')?.textContent ?? '',
				Array.from(item.querySelectorAll('.setting-hotkey')).map((chip) => chip.textContent ?? ''),
			]);
	});

/** The open settings tab's id and, on the Hotkeys tab, its search text. */
const activeTab = () =>
	browser.executeObsidian(({ app }) => {
		const tab = (app as unknown as { setting: { activeTab: { id: string; containerEl: HTMLElement } | null } }).setting.activeTab;
		return {
			id: tab?.id,
			search: tab?.containerEl.querySelector<HTMLInputElement>('input[type="search"]')?.value,
		};
	});

const isMac = () => browser.executeObsidian(({ obsidian }) => obsidian.Platform.isMacOS);

describe('Hotkeys section', () => {
	afterEach(() =>
		browser.executeObsidian(
			({ app }, ids) => {
				const internal = app as unknown as {
					hotkeyManager: { removeHotkeys(id: string): void };
					setting: { close(): void };
				};
				for (const id of ids) internal.hotkeyManager.removeHotkeys(id);
				internal.setting.close();
			},
			[ANNOTATE, NEXT],
		),
	);

	it('has a row for every registered Review Marks command, and none has a default hotkey', async () => {
		const commands = await ourCommands();
		expect(commands.length).toBeGreaterThan(5);
		expect(commands.filter((c) => c.defaults.length > 0)).toEqual([]);
		await openOurTab();
		const names = (await rows()).map(([name]) => name);
		expect([...names].sort()).toEqual(commands.map((c) => c.name).sort());
		expect(names).toContain('Toggle review mode');
	});

	it('shows hotkeys set in the Hotkeys tab, printed for this platform', async () => {
		await setHotkeys({
			[ANNOTATE]: [
				{ modifiers: ['Mod', 'Shift'], key: 'F9' },
				{ modifiers: ['Alt'], key: 'F10' },
			],
		});
		await openOurTab();
		const shown = new Map(await rows());
		const mac = await isMac();
		expect(shown.get('Annotate selection')).toEqual(mac ? ['⌘ ⇧ F9', '⌥ F10'] : ['Ctrl + Shift + F9', 'Alt + F10']);
		expect(shown.get('Go to next annotation')).toEqual(['Blank']);
	});

	it('shows changes made while away when the tab is drawn again', async () => {
		await openOurTab();
		await setHotkeys({ [NEXT]: [{ modifiers: ['Mod', 'Alt'], key: 'F11' }] });
		await openOurTab();
		const mac = await isMac();
		expect(new Map(await rows()).get('Go to next annotation')).toEqual([mac ? '⌘ ⌥ F11' : 'Ctrl + Alt + F11']);
	});

	it('opens the Hotkeys tab filtered to Review Marks from the section button', async () => {
		await openOurTab();
		expect(await clickInOurTab('button', 'Open Hotkeys settings')).toBe(true);
		await browser.waitUntil(async () => (await activeTab()).id === 'hotkeys');
		expect(await activeTab()).toEqual({ id: 'hotkeys', search: 'Review Marks' });
	});

	it("opens the Hotkeys tab filtered to Review Marks from a command's row", async () => {
		await openOurTab();
		expect(await clickInOurTab('row', 'Edit comment at cursor')).toBe(true);
		await browser.waitUntil(async () => (await activeTab()).id === 'hotkeys');
		expect(await activeTab()).toEqual({ id: 'hotkeys', search: 'Review Marks' });
	});
});

/**
 * Clicks the section's button with this text, or the open button on the row with this name. From
 * 1.15 Settings opens in a window of its own, out of the main window WebDriver drives, so the
 * click is dispatched in the page. False if there is no such control.
 */
function clickInOurTab(kind: 'button' | 'row', text: string): Promise<boolean> {
	return browser.executeObsidian(
		({ plugins }, kind, text) => {
			const tab = (plugins.reviewMarks as unknown as { settingsTab: { containerEl: HTMLElement } }).settingsTab;
			const items = Array.from(tab.containerEl.querySelectorAll('.setting-item'));
			const control =
				kind === 'button'
					? Array.from(tab.containerEl.querySelectorAll('button')).find((b) => b.textContent === text)
					: items
							.find((item) => item.querySelector('.setting-item-name')?.textContent === text)
							?.querySelector<HTMLElement>('.extra-setting-button');
			control?.click();
			return control !== undefined && control !== null;
		},
		kind,
		text,
	);
}
