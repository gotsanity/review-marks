import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';

const NOTE = 'Drag in reading.md';
const TEXT = [
	'# Reading',
	'',
	'Kell **fails** the save and seizes in place.',
	'',
	'- First item',
	'- Second item with **strong** words',
	'',
	'```js',
	'const answer = 42;',
	'```',
	'',
	'| Name | Result |',
	'|---|---|',
	'| Doreth | failure |',
	'',
].join('\n');

type Point = { x: number; y: number };

/** Opens the note in Reading view, with the drag trigger set to Alt. */
async function openInReading(): Promise<void> {
	// Cancel any comment box and close the note first, so the last test can't write it back.
	if (await $('.rm-cbox').isExisting()) {
		await browser.keys('Escape');
		await $('.rm-cbox').waitForExist({ reverse: true });
	}
	await browser.executeObsidian(({ app }) => app.workspace.detachLeavesOfType('markdown'));
	await obsidianPage.resetVault({ [NOTE]: TEXT });
	await obsidianPage.openFile(NOTE);
	await browser.executeObsidian(async ({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		if (!view) throw new Error('no markdown view');
		await view.setState({ ...view.getState(), mode: 'preview' }, { history: false });
	});
	await $('.markdown-reading-view td').waitForExist();
	await browser.executeObsidian(({ plugins }) => {
		(plugins.reviewMarks as unknown as { settings: { dragTrigger: string } }).settings.dragTrigger = 'alt';
	});
}

/**
 * Screen points in Reading view: just inside the first character of `first` and the last
 * character of `last` (the first match of each, in one text node), and the first one's top.
 */
async function pointsIn(first: string, last: string): Promise<{ start: Point; end: Point; top: number }> {
	const points = await browser.executeObsidian(
		({ app, obsidian }, first, last) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			const root = view?.previewMode.containerEl;
			if (!root) return null;
			const rectOf = (needle: string, atEnd: boolean) => {
				const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
				for (let n = walker.nextNode(); n; n = walker.nextNode()) {
					const i = (n as Text).data.indexOf(needle);
					if (i < 0) continue;
					const r = document.createRange();
					const at = atEnd ? i + needle.length - 1 : i;
					r.setStart(n, at);
					r.setEnd(n, at + 1);
					return r.getBoundingClientRect();
				}
				return null;
			};
			const a = rectOf(first, false);
			const b = rectOf(last, true);
			if (!a || !b) return null;
			return {
				start: { x: Math.round(a.left + 1), y: Math.round((a.top + a.bottom) / 2) },
				end: { x: Math.round(b.right - 1), y: Math.round((b.top + b.bottom) / 2) },
				top: a.top,
			};
		},
		first,
		last,
	);
	if (!points) throw new Error(`"${first}" or "${last}" is not rendered`);
	return points;
}

/** Holds `key` and drags from `start` to `end` with real pointer events. */
async function drag(key: string, start: Point, end: Point): Promise<void> {
	const keys = browser.action('key').down(key);
	const pointer = browser.action('pointer').move(start).down().pause(50);
	for (let i = 1; i <= 4; i++) {
		pointer.move({ x: Math.round(start.x + ((end.x - start.x) * i) / 4), y: Math.round(start.y + ((end.y - start.y) * i) / 4) });
	}
	pointer.up();
	for (let i = 0; i < 7; i++) keys.pause(0);
	keys.up(key);
	await browser.performActions([keys.toJSON(), pointer.toJSON()]);
	await browser.releaseActions();
}

/** The note's mode: 'preview' for Reading view, 'live' for Live Preview, 'source' for Source mode. */
const mode = () =>
	browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		if (view?.getMode() === 'preview') return 'preview';
		return view?.getState().source === false ? 'live' : 'source';
	});

const editorText = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue() ?? '');

const fileText = () => obsidianPage.read(NOTE);

/** Screen top of source offset `pos` in the editor. */
const editorTop = (pos: number) =>
	browser.executeObsidian(({ app }, pos) => {
		const cm = (app.workspace.activeEditor?.editor as unknown as { cm?: { coordsAtPos(p: number, side: number): { top: number } | null } })
			?.cm;
		return cm?.coordsAtPos(pos, 1)?.top ?? null;
	}, pos);

const notices = () => browser.executeObsidian(() => Array.from(document.querySelectorAll('.notice')).map((n) => n.textContent ?? ''));

const clearNotices = () => browser.executeObsidian(() => document.querySelectorAll('.notice').forEach((n) => n.remove()));

describe('Annotate on drag in Reading view', () => {
	beforeEach(async () => {
		// Move the pointer off any Target, so no popover from the last test covers the note.
		await browser.action('pointer').move({ x: 1, y: 1 }).perform();
		await $('.rm-popover').waitForExist({ reverse: true });
		await clearNotices();
		await openInReading();
	});

	it('maps a drag across bold text, switches to Live Preview at the same height and opens the comment box', async () => {
		const { start, end, top } = await pointsIn('fails', 'save');
		await drag(Key.Alt, start, end);

		const input = $('.rm-cbox-input');
		await expect(input).toBeFocused();
		expect(await mode()).toBe('live');
		expect(await editorText()).toContain('Kell {**fails** the save}[^r1] and');

		const now = await editorTop(TEXT.indexOf('**fails**'));
		expect(now).not.toBeNull();
		expect(Math.abs((now ?? 0) - top)).toBeLessThanOrEqual(12);

		await input.setValue('From Reading view.');
		await browser.keys('Enter');
		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toContain('Kell {**fails** the save}[^r1] and seizes in place.');
		expect(await editorText()).toContain('[^r1]: From Reading view.');
	});

	it('maps a drag in a list item past its marker and over bold text', async () => {
		const { start, end } = await pointsIn('item with', 'strong');
		await drag(Key.Alt, start, end);

		await expect($('.rm-cbox-input')).toBeFocused();
		expect(await mode()).toBe('live');
		expect(await editorText()).toContain('- Second {item with **strong**}[^r1] words');
	});

	it('refuses a drag inside code with a notice and stays in Reading view', async () => {
		const { start, end } = await pointsIn('answer', '42');
		await drag(Key.Alt, start, end);

		await browser.waitUntil(async () => (await notices()).some((n) => n.includes("a Target can't start or end inside code.")));
		expect(await mode()).toBe('preview');
		await expect($('.rm-cbox')).not.toExist();
		expect(await fileText()).toBe(TEXT);
	});

	it('refuses a drag across table cells with a notice and stays in Reading view', async () => {
		const { start, end } = await pointsIn('Doreth', 'failure');
		await drag(Key.Alt, start, end);

		await browser.waitUntil(async () => (await notices()).some((n) => n.includes('a Target must stay within one table cell.')));
		expect(await mode()).toBe('preview');
		expect(await fileText()).toBe(TEXT);
	});

	describe('without a caret-from-point API', () => {
		// Own properties shadow the Document prototype's methods; deleting them restores the APIs.
		beforeEach(() =>
			browser.executeObsidian(() => {
				const d = document as unknown as Record<string, unknown>;
				d.caretPositionFromPoint = undefined;
				d.caretRangeFromPoint = undefined;
			}),
		);
		afterEach(() =>
			browser.executeObsidian(() => {
				const d = document as unknown as Record<string, unknown>;
				delete d.caretPositionFromPoint;
				delete d.caretRangeFromPoint;
			}),
		);

		it('says to switch to Live Preview and changes nothing', async () => {
			const { start, end } = await pointsIn('fails', 'save');
			await drag(Key.Alt, start, end);

			await browser.waitUntil(async () => (await notices()).some((n) => n.includes('Switch to Live Preview to annotate.')));
			expect(await mode()).toBe('preview');
			expect(await fileText()).toBe(TEXT);
		});
	});
});
