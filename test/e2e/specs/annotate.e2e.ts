import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { resetVaultTo } from '../harness.ts';

const NOTE = 'Annotate me.md';
const TEXT = '# One\n\nKell fails the save and seizes in place.\n\n## Two\n\nMore text.\n';
const TARGET = 'the save';

/** Opens a note in Live Preview with `target` selected, scrolled into view, and the editor focused. */
async function openWithSelection(text = TEXT, target = TARGET): Promise<void> {
	await resetVaultTo({ [NOTE]: text });
	await obsidianPage.openFile(NOTE);
	await browser.executeObsidian(
		async ({ app, obsidian }, target) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			if (!view) throw new Error('no markdown view');
			const state = view.getState();
			if (state.mode !== 'source' || state.source !== false) {
				await view.setState({ ...state, mode: 'source', source: false }, { history: false });
			}
			const editor = view.editor;
			const from = editor.getValue().indexOf(target);
			const range = { from: editor.offsetToPos(from), to: editor.offsetToPos(from + target.length) };
			editor.focus();
			editor.setSelection(range.from, range.to);
			editor.scrollIntoView(range, true);
		},
		target,
	);
}

/** The editor's scroll position. */
const scrollTop = () =>
	browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		return view?.contentEl.querySelector('.cm-scroller')?.scrollTop ?? -1;
	});

const editorText = () =>
	browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue() ?? '');

const undo = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.undo());

const badgeTexts = () =>
	browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		return Array.from(view?.contentEl.querySelectorAll('.cm-content .rm-badge') ?? []).map((b) => b.textContent);
	});

/** Clicks the end of the note's last text line, away from the comment box. */
async function clickAway(): Promise<void> {
	const point = await browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		const line = Array.from(view?.contentEl.querySelectorAll('.cm-line') ?? []).find((l) => l.textContent === 'More text.');
		const r = line?.getBoundingClientRect();
		return r ? { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) } : null;
	});
	if (!point) throw new Error('line "More text." not found');
	await browser.action('pointer').move(point).down().up().perform();
}

describe('Annotate selection in a long note', () => {
	const filler = Array.from({ length: 60 }, (_, i) => `Paragraph ${i} of filler text.`);
	const LONG = ['# Long', '', ...filler.slice(0, 30).flatMap((p) => [p, '']), 'The middle target sits here.', '', ...filler.slice(30).flatMap((p) => [p, '']), '## End', ''].join('\n');

	it('does not scroll the note when the Annotation is created and saved', async () => {
		await openWithSelection(LONG, 'middle target');
		await browser.waitUntil(async () => (await scrollTop()) > 0);
		const before = await scrollTop();

		await browser.executeObsidianCommand('review-marks:annotate-selection');
		await $('.rm-cbox-input').setValue('Stay put.');
		await browser.keys('Enter');
		await expect($('.rm-cbox')).not.toExist();

		expect(Math.abs((await scrollTop()) - before)).toBeLessThanOrEqual(1);
		expect(await editorText()).toContain('[^r1]: Stay put.\n\n## End');
	});
});

describe('Annotate selection', () => {
	beforeEach(() => openWithSelection());

	it('creates the Annotation and its Comment as one undo step, with a badge in Live Preview', async () => {
		await browser.executeObsidianCommand('review-marks:annotate-selection');

		const input = $('.rm-cbox-input');
		await expect(input).toBeFocused();
		expect(await badgeTexts()).toEqual(['…']);

		await input.setValue('Check the recording: was it "hatred" or "contempt"?');
		await browser.keys('Enter');

		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(
			'# One\n\nKell fails {the save}[^r1] and seizes in place.\n\n' +
				'[^r1]: Check the recording: was it "hatred" or "contempt"?\n\n## Two\n\nMore text.\n',
		);
		await browser.waitUntil(async () => (await badgeTexts())[0] === 'Check the recording: was it "hat…');

		// The cursor is just after the marker, in the focused editor, with the syntax hidden.
		const caret = await browser.executeObsidian(({ app }) => {
			const editor = app.workspace.activeEditor?.editor;
			return editor ? editor.getValue().slice(0, editor.posToOffset(editor.getCursor())) : '';
		});
		expect(caret.endsWith('{the save}[^r1]')).toBe(true);
		const editorHasFocus = await browser.executeObsidian(
			({ app, obsidian }) => app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.editor.hasFocus() ?? false,
		);
		expect(editorHasFocus).toBe(true);
		const visible = await browser.executeObsidian(({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			return view?.contentEl.querySelector('.cm-content .rm-target')?.closest('.cm-line')?.textContent ?? '';
		});
		expect(visible).not.toContain('{');
		expect(visible).not.toContain('[^r1]');

		await undo();
		expect(await editorText()).toBe(TEXT);
	});

	it('shows the syntax as soon as the cursor enters the Target', async () => {
		await browser.executeObsidianCommand('review-marks:annotate-selection');
		await $('.rm-cbox-input').setValue('Comment.');
		await browser.keys('Enter');
		await expect($('.rm-cbox')).not.toExist();

		await browser.executeObsidian(({ app }) => {
			const editor = app.workspace.activeEditor?.editor;
			if (!editor) return;
			editor.setCursor(editor.offsetToPos(editor.getValue().indexOf('save')));
		});
		await expect($('.cm-content .rm-syntax')).toExist();
		expect(await badgeTexts()).toEqual([]);
	});

	it('leaves no trace and no undo step when cancelled with Esc', async () => {
		// An earlier edit, so an undo has something to take back.
		await browser.executeObsidian(({ app }) => {
			const editor = app.workspace.activeEditor?.editor;
			editor?.replaceRange('Intro. ', { line: 2, ch: 0 });
			editor?.setSelection({ line: 2, ch: 18 }, { line: 2, ch: 26 });
		});
		const before = await editorText();

		await browser.executeObsidianCommand('review-marks:annotate-selection');
		await expect($('.rm-cbox-input')).toBeFocused();
		await browser.keys('Escape');

		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(before);
		await undo();
		expect(await editorText()).toBe(TEXT);
	});

	it('cancels when the box closes with nothing typed', async () => {
		await browser.executeObsidianCommand('review-marks:annotate-selection');
		await expect($('.rm-cbox-input')).toBeFocused();
		await clickAway();

		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(TEXT);
	});

	it('saves a multi-line Comment when the Reviewer clicks away', async () => {
		await browser.executeObsidianCommand('review-marks:annotate-selection');
		const input = $('.rm-cbox-input');
		await input.click();
		await browser.keys(['Line one.']);
		await browser.action('key').down(Key.Shift).down(Key.Enter).up(Key.Enter).up(Key.Shift).perform();
		await browser.keys(['Line two.']);
		await clickAway();

		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toContain('[^r1]: Line one.\n    Line two.\n\n## Two');
	});
});
