// @vitest-environment happy-dom
import type { App } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../test-support/fake-dom';
import type { SettingsStore } from '../settings';
import { hotkeysSettings } from './setting';

type Hotkey = { modifiers: string[]; key: string };

const COMMANDS = {
	'review-marks:edit-comment': { id: 'review-marks:edit-comment', name: 'Review Marks: Edit comment' },
	'review-marks:annotate-selection': { id: 'review-marks:annotate-selection', name: 'Review Marks: Annotate selection' },
	'review-marks:next-annotation': { id: 'review-marks:next-annotation', name: 'Review Marks: Go to next annotation' },
	'editor:save-file': { id: 'editor:save-file', name: 'Save current file' },
};

let custom: Record<string, Hotkey[]>;
let defaults: Record<string, Hotkey[]>;
let hotkeysTab: { setQuery: ReturnType<typeof vi.fn> };
let setting: { open: ReturnType<typeof vi.fn>; openTabById: ReturnType<typeof vi.fn> };

/** A faked `app` with the private pieces the section reads. Pass `omit` to leave some out. */
function fakeApp(...omit: ('hotkeyManager' | 'setting')[]): App {
	const app: Record<string, unknown> = {
		commands: { commands: COMMANDS },
		hotkeyManager: {
			getHotkeys: (id: string) => custom[id],
			getDefaultHotkeys: (id: string) => defaults[id],
		},
		setting,
	};
	for (const key of omit) delete app[key];
	return app as unknown as App;
}

/** Draws the section for `app` and returns its container. */
function draw(app: App, isMac = false): HTMLElement {
	const el = document.body.createDiv();
	hotkeysSettings({ app, manifest: { id: 'review-marks', name: 'Review Marks' } }, isMac)(el, {} as SettingsStore);
	return el;
}

/** The command rows, as [name, chip texts]. */
const rows = (el: HTMLElement) =>
	Array.from(el.querySelectorAll('.setting-item'))
		.filter((item) => item.querySelector('.setting-command-hotkeys'))
		.map((item): [string, string[]] => [
			item.querySelector('.setting-item-name')?.textContent ?? '',
			Array.from(item.querySelectorAll('.setting-hotkey')).map((chip) => chip.textContent ?? ''),
		]);

beforeEach(() => {
	document.body.innerHTML = '';
	custom = {};
	defaults = {};
	hotkeysTab = { setQuery: vi.fn() };
	setting = { open: vi.fn(), openTabById: vi.fn(() => hotkeysTab) };
});

describe('Hotkeys section', () => {
	it("lists every Review Marks command by name, with each one's current hotkeys", () => {
		custom['review-marks:annotate-selection'] = [
			{ modifiers: ['Mod', 'Shift'], key: 'A' },
			{ modifiers: ['Alt'], key: 'A' },
		];
		defaults['review-marks:next-annotation'] = [{ modifiers: ['Mod'], key: 'J' }];
		expect(rows(draw(fakeApp()))).toEqual([
			['Annotate selection', ['Ctrl + Shift + A', 'Alt + A']],
			['Edit comment', ['Blank']],
			['Go to next annotation', ['Ctrl + J']],
		]);
	});

	it('prints chips in the macOS style on macOS', () => {
		custom['review-marks:annotate-selection'] = [{ modifiers: ['Mod', 'Shift'], key: 'A' }];
		expect(rows(draw(fakeApp(), true))[0]).toEqual(['Annotate selection', ['⌘ ⇧ A']]);
	});

	it('opens the Hotkeys tab filtered to Review Marks from the section button', () => {
		const el = draw(fakeApp());
		const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Open hotkeys settings');
		button?.click();
		expectHotkeysTabOpened();
	});

	it("opens the Hotkeys tab filtered to Review Marks from each command's row", () => {
		const el = draw(fakeApp());
		const rowButtons = el.querySelectorAll<HTMLElement>('.setting-item:has(.setting-command-hotkeys) .extra-setting-button');
		expect(rowButtons).toHaveLength(3);
		rowButtons[1]?.click();
		expectHotkeysTabOpened();
	});
});

describe('Hotkeys section conflicts', () => {
	/** Every chip, as [text, whether it is marked as a conflict, its tooltip]. */
	const chips = (el: HTMLElement) =>
		Array.from(el.querySelectorAll('.setting-hotkey')).map((chip) => [
			chip.textContent,
			chip.classList.contains('rm-hotkey-conflict'),
			chip.getAttribute('aria-label'),
		]);

	it('marks a hotkey another command also uses in red, naming the other commands, and leaves the rest alone', () => {
		custom['review-marks:annotate-selection'] = [
			{ modifiers: ['Mod'], key: 'S' },
			{ modifiers: ['Alt'], key: 'A' },
		];
		custom['review-marks:edit-comment'] = [{ modifiers: ['Mod'], key: 'S' }];
		defaults['editor:save-file'] = [{ modifiers: ['Mod'], key: 'S' }];
		expect(chips(draw(fakeApp()))).toEqual([
			['Ctrl + S', true, 'Also used by Review Marks: Edit comment, Save current file'],
			['Alt + A', false, null],
			['Ctrl + S', true, 'Also used by Review Marks: Annotate selection, Save current file'],
			['Blank', false, null],
		]);
	});

	it("doesn't count a default hotkey a custom one has replaced", () => {
		custom['review-marks:annotate-selection'] = [{ modifiers: ['Mod'], key: 'S' }];
		defaults['editor:save-file'] = [{ modifiers: ['Mod'], key: 'S' }];
		custom['editor:save-file'] = [{ modifiers: ['Alt'], key: 'S' }];
		expect(chips(draw(fakeApp()))[0]).toEqual(['Ctrl + S', false, null]);
	});
});

describe('Hotkeys section without the private APIs', () => {
	it('lists the commands with no hotkeys when the hotkey manager is missing, and the buttons still work', () => {
		custom['review-marks:annotate-selection'] = [{ modifiers: ['Mod', 'Shift'], key: 'A' }];
		const el = draw(fakeApp('hotkeyManager'));
		expect(rows(el)).toEqual([
			['Annotate selection', []],
			['Edit comment', []],
			['Go to next annotation', []],
		]);
		el.querySelector<HTMLElement>('.extra-setting-button')?.click();
		expectHotkeysTabOpened();
	});

	it('still opens the Hotkeys tab, unfiltered, when the tab has no setQuery', () => {
		setting.openTabById.mockReturnValue({});
		const el = draw(fakeApp());
		el.querySelector('button')?.click();
		expect(setting.openTabById).toHaveBeenCalledWith('hotkeys');
	});

	it('is hidden when the hotkey manager and the settings modal are both missing', () => {
		expect(draw(fakeApp('hotkeyManager', 'setting')).childElementCount).toBe(0);
	});

	it('is hidden when the settings modal is missing', () => {
		expect(draw(fakeApp('setting')).childElementCount).toBe(0);
	});
});

function expectHotkeysTabOpened(): void {
	expect(setting.open).toHaveBeenCalledOnce();
	expect(setting.openTabById).toHaveBeenCalledWith('hotkeys');
	expect(hotkeysTab.setQuery).toHaveBeenCalledWith('Review Marks');
}
