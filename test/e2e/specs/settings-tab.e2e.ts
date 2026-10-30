import { browser, expect } from '@wdio/globals';
import { after, before, describe, it } from 'mocha';

/** The settings tab's controls, as [name, description]. */
const settingItems = () =>
	browser.executeObsidian(({ plugins }) => {
		const tab = (plugins.reviewMarks as unknown as { settingsTab: { containerEl: HTMLElement } }).settingsTab;
		return Array.from(tab.containerEl.querySelectorAll('.setting-item')).map(
			(el): [string, string] => [
				el.querySelector('.setting-item-name')?.textContent ?? '',
				el.querySelector('.setting-item-description')?.textContent ?? '',
			],
		);
	});

describe('Settings tab', () => {
	before(() =>
		browser.executeObsidian(({ app }) => {
			const setting = (app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting;
			setting.open();
			setting.openTabById('review-marks');
		}),
	);
	after(() => browser.executeObsidian(({ app }) => (app as unknown as { setting: { close(): void } }).setting.close()));

	it("lists the spec's settings in its order, with its labels", async () => {
		const names = (await settingItems()).map(([name]) => name);
		expect(names).toEqual([
			'Comment placement',
			'Highlight colour',
			'Show comment badge',
			'Badge excerpt length',
			'Show comment on hover',
			'Hide review footnotes in the footnote list',
			'Annotate-on-drag trigger',
			'Show annotation count in status bar',
			'Strip annotations from exports',
		]);
	});

	it('says that a tap on mobile shows the comment whatever the hover setting, and names Reading view', async () => {
		const items = new Map(await settingItems());
		expect(items.get('Show comment on hover')).toBe(
			'Hovering an annotation shows its full comment. Clicking the badge, or tapping an annotation on mobile, always shows it.',
		);
		expect(items.get('Hide review footnotes in the footnote list')).toBe(
			'Reading view leaves review comments out of the footnote list at the end of the note. Your own footnotes and their numbers stay.',
		);
	});
});
