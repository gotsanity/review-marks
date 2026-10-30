import { $, browser, expect } from '@wdio/globals';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';

const NOTE = 'Colour me.md';
// `==marked==` is Obsidian's own highlight: the theme's highlight colour to match.
const TEXT = 'Intro {first}[^r1] line with ==marked== text.\n\n[^r1]: One.\n';

type Store = { current: { highlightColour: string }; update(patch: object): Promise<void> };

const update = (patch: object) =>
	browser.executeObsidian(({ plugins }, patch) => (plugins.reviewMarks as unknown as { store: Store }).store.update(patch), patch);

const storedColour = () =>
	browser.executeObsidian(({ plugins }) => (plugins.reviewMarks as unknown as { store: Store }).store.current.highlightColour);

async function setMode(mode: 'source' | 'preview'): Promise<void> {
	await browser.executeObsidian(
		async ({ app, obsidian }, mode) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			if (!view) throw new Error('no markdown view');
			await view.setState({ ...view.getState(), mode, source: false }, { history: false });
		},
		mode,
	);
}

/** The computed background of the first element matching `selector`. */
const background = (selector: string) =>
	browser.execute((selector) => {
		const el = document.querySelector(selector);
		return el ? getComputedStyle(el).backgroundColor : null;
	}, selector);

const VIEWS = [
	{ mode: 'source', target: '.cm-content .rm-target[data-rm-id="r1"]', own: '.cm-content .cm-highlight' },
	{ mode: 'preview', target: '.markdown-reading-view .rm-target[data-rm-id="r1"]', own: '.markdown-reading-view mark' },
] as const;

describe('Highlight colour', () => {
	beforeEach(async () => {
		await obsidianPage.resetVault({ [NOTE]: TEXT });
		await obsidianPage.openFile(NOTE);
	});
	afterEach(() => update({ highlightColour: '' }));

	it("is the theme's highlight colour by default, in both views", async () => {
		for (const view of VIEWS) {
			await setMode(view.mode);
			await $(view.target).waitForExist();
			await $(view.own).waitForExist();
			const own = await background(view.own);
			expect(own).not.toBe('rgba(0, 0, 0, 0)');
			expect(await background(view.target)).toBe(own);
		}
	});

	it('applies a chosen colour at once in both views, and the theme colour again when cleared', async () => {
		await setMode('source');
		await $(VIEWS[0].target).waitForExist();
		await update({ highlightColour: '#3a7bd5' });
		await browser.waitUntil(async () => (await background(VIEWS[0].target)) === 'rgba(58, 123, 213, 0.4)');

		await setMode('preview');
		await $(VIEWS[1].target).waitForExist();
		expect(await background(VIEWS[1].target)).toBe('rgba(58, 123, 213, 0.4)');

		await update({ highlightColour: '' });
		await browser.waitUntil(async () => (await background(VIEWS[1].target)) === (await background(VIEWS[1].own)));
	});

	it('is chosen in the settings tab, which shows the theme colour until then and can reset to it', async () => {
		await browser.executeObsidian(({ app }) => {
			const setting = (app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting;
			setting.open();
			setting.openTabById('review-marks');
		});
		/** Does `act` with the tab's colour picker and returns its value. */
		const withPicker = (act: 'read' | 'choose' | 'reset') =>
			browser.executeObsidian(({ plugins }, act) => {
				const tab = (plugins.reviewMarks as unknown as { settingsTab: { containerEl: HTMLElement } }).settingsTab;
				const item = Array.from(tab.containerEl.querySelectorAll('.setting-item')).find(
					(el) => el.querySelector('.setting-item-name')?.textContent === 'Highlight colour',
				);
				const input = item?.querySelector<HTMLInputElement>('input[type="color"]');
				if (!item || !input) throw new Error('no Highlight colour picker');
				if (act === 'choose') {
					input.value = '#3a7bd5';
					input.dispatchEvent(new Event('input', { bubbles: true }));
					input.dispatchEvent(new Event('change', { bubbles: true }));
				} else if (act === 'reset') {
					item.querySelector<HTMLElement>('.extra-setting-button')?.click();
				}
				return input.value;
			}, act);

		// Obsidian's default theme colours: 1.7's rgba(255, 208, 0, 0.4) and 1.14's #e0ac00 at 30%,
		// read back from a canvas, so allow for rounding.
		const themeShown = await withPicker('read');
		const near = (a: string, b: string) =>
			[1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 3);
		expect(near(themeShown, '#ffd000') || near(themeShown, '#e0ac00')).toBe(true);

		await withPicker('choose');
		await browser.waitUntil(async () => (await storedColour()) === '#3a7bd5');

		await withPicker('reset');
		await browser.waitUntil(async () => (await storedColour()) === '');
		await browser.waitUntil(async () => (await withPicker('read')) === themeShown);
		await browser.executeObsidian(({ app }) => (app as unknown as { setting: { close(): void } }).setting.close());
	});
});
