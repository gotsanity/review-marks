import { $, browser, expect } from '@wdio/globals';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { NOTES } from '../fixtures.ts';
import { resetVaultTo } from '../harness.ts';

/** Opens a note in Reading view and waits for its first section. */
async function openInReading(path: string): Promise<void> {
	await obsidianPage.openFile(path);
	await browser.executeObsidian(async ({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		if (!view) throw new Error('no markdown view');
		await view.setState({ ...view.getState(), mode: 'preview' }, { history: false });
	});
	await $('.markdown-reading-view .rm-target').waitForExist();
}

/** Opens the active note in Live Preview. */
async function switchToLivePreview(): Promise<void> {
	await browser.executeObsidian(async ({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		if (!view) throw new Error('no markdown view');
		await view.setState({ ...view.getState(), mode: 'source', source: false }, { history: false });
	});
}

const reading = (selector: string) => `.markdown-reading-view ${selector}`;

/**
 * Scrolls Reading view to the Target `id` and waits for it to be rendered and decorated. Reading
 * view renders only the sections near the viewport, and drops them again as they scroll away.
 */
async function showTarget(id: string): Promise<void> {
	await browser.waitUntil(() =>
		browser.executeObsidian(
			async ({ app, obsidian }, id) => {
				const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
				if (!view) return false;
				const target = () => view.previewMode.containerEl.querySelector(`.rm-target[data-rm-id="${id}"]`);
				if (!target()) {
					const text = await app.vault.cachedRead(view.file!);
					const line = text.slice(0, text.indexOf(`}[^${id}]`)).split('\n').length - 1;
					view.previewMode.applyScroll(Math.max(0, line - 2));
					await new Promise((r) => window.setTimeout(r, 200));
				}
				target()?.scrollIntoView({ block: 'center' });
				return !!target();
			},
			id,
		),
	);
}

/** The visible text of the rendered element holding the Target `id`. */
const visibleBlockText = (id: string) =>
	browser.executeObsidian(({ app, obsidian }, id) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		const target = view?.previewMode.containerEl.querySelector(`.rm-target[data-rm-id="${id}"]`);
		return (target?.closest('p, li, h1, h2, h3, td') as HTMLElement | null)?.innerText ?? '';
	}, id);

const badgeText = (scope: string, id: string) =>
	browser.executeObsidian(
		({ app, obsidian }, scope, id) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			return view?.containerEl.querySelector(`${scope} .rm-badge[data-rm-id="${id}"]`)?.textContent ?? null;
		},
		scope,
		id,
	);

const updateSettings = (patch: Record<string, unknown>) =>
	browser.executeObsidian(async ({ plugins }, patch) => {
		const plugin = plugins.reviewMarks as unknown as { store: { update(p: object): Promise<void> } };
		await plugin.store.update(patch);
	}, patch);

describe('Reading view', () => {
	beforeEach(async () => {
		await obsidianPage.resetVault();
		await updateSettings({ showBadge: true, excerptLength: 32, showHover: true, hideReviewFootnotes: true });
	});
	afterEach(async () => {
		await browser.keys('Escape');
		await browser.action('pointer').move({ x: 2, y: 2 }).perform();
		await expect($('.rm-popover')).not.toExist();
	});

	it('highlights each Target, hides its syntax and shows a badge', async () => {
		await openInReading(NOTES.endOfNote);

		await expect($(reading('.rm-target[data-rm-id="r1"]'))).toHaveText('Caly frenzies and Malek knocks her out.');
		expect(await badgeText('.markdown-reading-view', 'r1')).toBe('Too terse. Say why Malek had to:…');
		const text = await visibleBlockText('r1');
		expect(text).toContain('Caly frenzies and Malek knocks her out.Too terse.');
		expect(text).not.toMatch(/[{}]|\[1\]/);

		// A Target crossing bold text, and one in a heading.
		await showTarget('r3');
		expect(await visibleBlockText('r3')).toMatch(/^Call of the Void\. Vance's grey mist/);
		await showTarget('r12');
		await expect($(reading('h3 .rm-target[data-rm-id="r12"]'))).toHaveText('Call of the Void');
	});

	it('decorates sections that are rendered later, when they scroll into view', async () => {
		await openInReading(NOTES.endOfNote);
		await expect($(reading('.rm-target[data-rm-id="r9"]'))).not.toExist();
		await showTarget('r9');
		expect(await badgeText('.markdown-reading-view', 'r9')).toBe('Was this a fail? DC was 18 per t…');
	});

	it('shows the full Comment, with links rendered, on hover and on a badge click', async () => {
		await openInReading(NOTES.endOfNote);

		await showTarget('r6');
		await $(reading('.rm-target[data-rm-id="r6"]')).moveTo();
		const popover = $('.rm-popover');
		await expect(popover).toExist();
		await expect(popover).toHaveText(expect.stringContaining('was it "hatred" or "contempt"? Don\'t add {flavour} or links here.'));
		await expect(popover.$('a.internal-link')).toHaveText('links');

		// With hover off, hovering does nothing, but the badge still opens it.
		await browser.action('pointer').move({ x: 2, y: 2 }).perform();
		await expect(popover).not.toExist();
		await updateSettings({ showHover: false });
		await showTarget('r7');
		await $(reading('.rm-target[data-rm-id="r7"]')).moveTo();
		await browser.pause(300);
		await expect($('.rm-popover')).not.toExist();
		await $(reading('.rm-badge[data-rm-id="r7"]')).click();
		await expect($('.rm-popover')).toHaveText(expect.stringContaining('Rewrite as a direct quote.\nShe said it in character; see the transcript.'));
	});

	it('applies the display settings at once in both views', async () => {
		await openInReading(NOTES.endOfNote);
		await showTarget('r1');

		await updateSettings({ excerptLength: 10 });
		await browser.waitUntil(async () => (await badgeText('.markdown-reading-view', 'r1')) === 'Too terse.…');
		await updateSettings({ showBadge: false });
		await browser.waitUntil(async () => (await badgeText('.markdown-reading-view', 'r1')) === null);
		await expect($(reading('.rm-target[data-rm-id="r1"]'))).toExist();

		await switchToLivePreview();
		await $('.cm-content .rm-target[data-rm-id="r1"]').waitForExist();
		expect(await badgeText('.cm-content', 'r1')).toBeNull();
		await updateSettings({ showBadge: true });
		await browser.waitUntil(async () => (await badgeText('.cm-content', 'r1')) === 'Too terse.…');
	});

	it('shows the popover for Live Preview Targets and badges too', async () => {
		await openInReading(NOTES.endOfNote);
		await switchToLivePreview();
		await $('.cm-content .rm-badge[data-rm-id="r1"]').waitForExist();
		// Hover the badge: the Target wraps across lines, so its centre may not be on it.
		const point = await browser.executeObsidian(({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			const badge = view?.contentEl.querySelector('.cm-content .rm-badge[data-rm-id="r1"]');
			badge?.scrollIntoView({ block: 'center' });
			const r = badge?.getBoundingClientRect();
			return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
		});
		if (!point) throw new Error('no badge');
		await browser.action('pointer').move(point).perform();
		await expect($('.rm-popover')).toHaveText(expect.stringContaining('Too terse. Say why Malek had to: she punched Rhiaah.'));
	});
});

describe('Reading view footnote list', () => {
	const NOTE = 'Footnotes.md';
	const TEXT =
		'First {target}[^r1] then an author note[^a].\n\nSecond {one}[^r2] and another[^b].\n\n' +
		'[^a]: Author A.\n[^b]: Author B.\n[^r1]: Review one.\n[^r2]: Review two.\n';

	/** Visible items of the footnote list, with the number each shows. */
	const visibleItems = () =>
		browser.executeObsidian(({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			const items = Array.from(view?.previewMode.containerEl.querySelectorAll<HTMLLIElement>('section.footnotes li') ?? []);
			return items.filter((li) => li.offsetParent !== null).map((li) => `${li.value}. ${li.innerText.replace('↩︎', '').trim()}`);
		});

	beforeEach(async () => {
		await resetVaultTo({ [NOTE]: TEXT });
		await updateSettings({ hideReviewFootnotes: true });
	});

	it("hides review footnotes and keeps the author's footnotes with Obsidian's numbers", async () => {
		await openInReading(NOTE);
		await $(reading('section.footnotes')).waitForExist();
		expect(await visibleItems()).toEqual(['2. Author A.', '4. Author B.']);
		const refs = await browser.executeObsidian(({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			return Array.from(view?.previewMode.containerEl.querySelectorAll('sup.footnote-ref') ?? [])
				.filter((s) => (s as HTMLElement).offsetParent !== null)
				.map((s) => s.textContent);
		});
		expect(refs).toEqual(['[2]', '[4]']);
	});

	it('shows every footnote when the setting is off', async () => {
		await openInReading(NOTE);
		await updateSettings({ hideReviewFootnotes: false });
		await browser.waitUntil(async () => (await visibleItems()).length === 4);
		expect(await visibleItems()).toEqual(['1. Review one.', '2. Author A.', '3. Review two.', '4. Author B.']);
	});
});
