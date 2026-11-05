import { $, $$, browser, expect } from '@wdio/globals';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { resetVaultTo } from '../harness.ts';

const NOTE = 'Review me.md';
const TEXT = 'Some {text}[^r1] to review.\n\n[^r1]: One.\n';
const ON = 'Review mode on: select text to annotate it.';
const OFF = 'Review mode off';

const indicator = () => $('.status-bar .rm-status-review-mode');
const headerButton = () => $('.rm-sidebar-header .rm-review-mode-button');

const isOn = () =>
	browser.executeObsidian(({ plugins }) => (plugins.reviewMarks as unknown as { reviewMode: { on: boolean } }).reviewMode.on);

const clearNotices = () => browser.execute(() => document.querySelectorAll('.notice').forEach((n) => n.remove()));

/** Waits for a Notice reading exactly `text`. */
const expectNotice = (text: string) =>
	browser.waitUntil(async () => (await $$('.notice').map((n) => n.getText())).includes(text), {
		timeoutMsg: `no "${text}" notice`,
	});

const setShowStatusBar = (shown: boolean) =>
	browser.executeObsidian(
		({ plugins }, shown) => (plugins.reviewMarks as unknown as { store: { update(p: object): Promise<void> } }).store.update({ showStatusBar: shown }),
		shown,
	);

describe('Review Mode', () => {
	beforeEach(async () => {
		await resetVaultTo({ [NOTE]: TEXT });
		await obsidianPage.openFile(NOTE);
		await clearNotices();
	});
	afterEach(async () => {
		await browser.executeObsidian(({ app, plugins }) => {
			(plugins.reviewMarks as unknown as { reviewMode: { set(on: boolean): void } }).reviewMode.set(false);
			app.workspace.detachLeavesOfType('review-marks-annotations');
		});
		await setShowStatusBar(true);
		await clearNotices();
	});

	it('is off at launch, with the indicator hidden', async () => {
		expect(await isOn()).toBe(false);
		await expect(indicator()).not.toBeDisplayed();
	});

	it('turns on with the command, and the indicator turns it off', async () => {
		await browser.executeObsidianCommand('review-marks:open-annotations-sidebar');
		await expect(headerButton()).toBeDisplayed();
		await expect(headerButton()).not.toHaveElementClass('is-active');

		await browser.executeObsidianCommand('review-marks:toggle-review-mode');
		await expectNotice(ON);
		expect(await isOn()).toBe(true);
		await expect(indicator()).toBeDisplayed();
		await expect(indicator()).toHaveText('Review mode');
		await expect(indicator()).toHaveAttribute('aria-label', 'Turn off review mode');
		await expect(headerButton()).toHaveElementClass('is-active');
		await expect(headerButton()).toHaveAttribute('aria-label', 'Turn off review mode');

		// The indicator sits just left of the count.
		const nextClass = await browser.execute(
			() => document.querySelector('.status-bar .rm-status-review-mode')?.nextElementSibling?.className ?? '',
		);
		expect(nextClass).toContain('rm-status-count');

		await clearNotices();
		await indicator().click();
		await expectNotice(OFF);
		expect(await isOn()).toBe(false);
		await expect(indicator()).not.toBeDisplayed();
		await expect(headerButton()).not.toHaveElementClass('is-active');
		await expect(headerButton()).toHaveAttribute('aria-label', 'Turn on review mode');
	});

	it('the sidebar header button toggles it', async () => {
		await browser.executeObsidianCommand('review-marks:open-annotations-sidebar');
		await headerButton().click();
		await expectNotice(ON);
		expect(await isOn()).toBe(true);
		await expect(indicator()).toBeDisplayed();
		await expect(headerButton()).toHaveElementClass('is-active');

		await clearNotices();
		await headerButton().click();
		await expectNotice(OFF);
		expect(await isOn()).toBe(false);
		await expect(indicator()).not.toBeDisplayed();
	});

	it('keeps the indicator with the annotation count turned off', async () => {
		await setShowStatusBar(false);
		await browser.executeObsidianCommand('review-marks:toggle-review-mode');
		await expect($('.status-bar .rm-status-count')).not.toBeDisplayed();
		await expect(indicator()).toBeDisplayed();
	});
});
