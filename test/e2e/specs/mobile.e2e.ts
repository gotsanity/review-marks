// The mobile UI, through Obsidian's mobile emulation on the desktop app (a phone-sized window).
// Emulation can't raise an on-screen keyboard, so "no keyboard" is checked as "nothing editable
// has focus".
import { $, browser, expect } from '@wdio/globals';
import { after, before, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';

const NOTE = 'Mobile me.md';
const filler = Array.from({ length: 60 }, (_, i) => `Paragraph ${i} of filler text.\n`).join('\n');
const TEXT = ['Intro {first}[^r1] line.', '', filler, 'The {far target}[^r2] sits here.', '', '[^r1]: One.', '[^r2]: Two.', ''].join('\n');

const editorText = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue() ?? '');

/** Whether anything that raises the on-screen keyboard has focus. */
const editableFocused = () =>
	browser.execute(() => {
		const el = document.activeElement as HTMLElement | null;
		return !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
	});

async function open(text: string, mode: 'source' | 'preview' = 'source'): Promise<void> {
	await obsidianPage.resetVault({ [NOTE]: text });
	await obsidianPage.openFile(NOTE);
	await browser.executeObsidian(
		async ({ app, obsidian }, mode) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			if (!view) throw new Error('no markdown view');
			await view.setState({ ...view.getState(), mode, source: false }, { history: false });
		},
		mode,
	);
	await browser.waitUntil(async () => (await editorText()) === text);
}

/** Resizes Obsidian's window. WebDriver can't; Electron can. */
const setWindowSize = (width: number, height: number) =>
	browser.execute(
		(width, height) => {
			type Remote = { getCurrentWindow(): { setSize(w: number, h: number): void } };
			const req = (window as unknown as { require: (m: string) => unknown }).require;
			let remote: Remote | undefined;
			try {
				remote = req('@electron/remote') as Remote;
			} catch {
				remote = (req('electron') as { remote?: Remote }).remote;
			}
			remote?.getCurrentWindow().setSize(width, height);
		},
		width,
		height,
	);

describe('Mobile', () => {
	before(async () => {
		await setWindowSize(420, 860);
		await browser.executeObsidian(({ app }) => (app as unknown as { emulateMobile(on: boolean): void }).emulateMobile(true));
		await browser.waitUntil(() => browser.execute(() => document.body.hasClass('is-phone')), {
			timeoutMsg: 'Obsidian did not switch to the phone UI',
		});
	});
	after(() => browser.executeObsidian(({ app }) => (app as unknown as { emulateMobile(on: boolean): void }).emulateMobile(false)));

	it('comment box: Enter adds a line, only Save saves, and the box stays above the keyboard', async () => {
		const plain = 'Kell fails the save and seizes in place.\n\nMore text.\n';
		await open(plain);
		await browser.executeObsidian(({ app }) => {
			const editor = app.workspace.activeEditor?.editor;
			if (!editor) throw new Error('no editor');
			const from = editor.getValue().indexOf('the save');
			editor.focus();
			editor.setSelection(editor.offsetToPos(from), editor.offsetToPos(from + 'the save'.length));
		});
		await browser.executeObsidianCommand('review-marks:annotate-selection');
		const input = $('.rm-cbox.is-mobile .rm-cbox-input');
		await expect(input).toBeFocused();
		await browser.keys('Line one');
		await browser.keys('Enter');
		await browser.keys('line two');
		await expect(input).toHaveValue('Line one\nline two');
		await expect($('.rm-cbox')).toBeDisplayed();

		// An on-screen keyboard shrinks the viewport: the box moves to stay fully inside it.
		const inside = () =>
			browser.execute(() => {
				const r = document.querySelector('.rm-cbox')?.getBoundingClientRect();
				const vv = window.visualViewport;
				const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
				return !!r && r.top >= 0 && r.bottom <= bottom;
			});
		await setWindowSize(420, 300);
		try {
			await browser.waitUntil(async () => (await browser.execute(() => window.innerHeight)) < 400);
			await browser.waitUntil(inside, { timeoutMsg: 'the comment box left the shrunken viewport' });
		} finally {
			await setWindowSize(420, 860);
		}

		await $('.rm-cbox .rm-cbox-btn.mod-cta').click();
		await expect($('.rm-cbox')).not.toExist();
		const text = await editorText();
		expect(text).toContain('{the save}[^r1]');
		expect(text).toMatch(/\[\^r1\]: Line one\n\s+line two/);
	});

	it('sidebar: a tap scrolls to the Target and closes the drawer without focusing anything editable', async () => {
		await open(TEXT);
		await browser.execute(() => (document.activeElement as HTMLElement | null)?.blur());
		await browser.executeObsidianCommand('review-marks:open-annotations-sidebar');
		const entry = $('.rm-sidebar .rm-sb-entry[data-rm-id="r2"]');
		await expect(entry.$('.rm-sb-target')).toBeDisplayed();
		// The Remove button is always shown, not on hover only.
		const remove = entry.$('.rm-sb-remove');
		await expect(remove).toBeDisplayed();
		expect(await remove.getCSSProperty('opacity')).toMatchObject({ value: 1 });

		const top = () =>
			browser.executeObsidian(({ app, obsidian }) => {
				const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView) ?? app.workspace.getLeavesOfType('markdown')[0]?.view;
				return view instanceof obsidian.MarkdownView ? (view.contentEl.querySelector('.cm-scroller')?.scrollTop ?? 0) : 0;
			});
		expect(await top()).toBe(0);
		await entry.$('.rm-sb-target').click();
		await browser.waitUntil(async () => (await top()) > 0, { timeoutMsg: 'the note did not scroll to the Target' });
		await browser.waitUntil(() => browser.executeObsidian(({ app }) => app.workspace.rightSplit.collapsed), {
			timeoutMsg: 'the drawer did not close',
		});
		expect(await editableFocused()).toBe(false);
	});

	it('a tap on a Target opens the popover, in Live Preview and Reading view', async () => {
		await open(TEXT);
		// The tap moves the cursor into the Target, which redraws it before the release.
		await $('.cm-content .rm-target[data-rm-id="r1"]').click();
		await expect($('.rm-popover')).toHaveText(expect.stringContaining('One.'));

		await open(TEXT, 'preview');
		await $('.markdown-preview-view .rm-target[data-rm-id="r1"]').click();
		await expect($('.rm-popover')).toHaveText(expect.stringContaining('One.'));
		// The popover stays put: there's no hover to end.
		await browser.pause(500);
		await expect($('.rm-popover')).toBeDisplayed();
	});

	it('a tap on a badge opens the popover even with hover off', async () => {
		await browser.executeObsidian(({ plugins }) => (plugins.reviewMarks as unknown as { store: { update(p: object): Promise<void> } }).store.update({ showHover: false }));
		await open(TEXT, 'preview');
		await $('.markdown-preview-view .rm-badge[data-rm-id="r1"]').click();
		await expect($('.rm-popover')).toHaveText(expect.stringContaining('One.'));
	});
});
