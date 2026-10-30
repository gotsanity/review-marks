import { $, browser, expect } from '@wdio/globals';
import { beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { NOTES } from '../fixtures.ts';
import { resetVaultTo } from '../harness.ts';

/** Opens `note` in Live Preview with the cursor in a body line about a third of the way down, scrolled to the top. */
async function openInTheMiddle(note: string, text: string): Promise<void> {
	await obsidianPage.openFile(note);
	// The editor can still hold the previous note for a moment.
	await browser.waitUntil(async () => (await editorText()) === text);
	await browser.executeObsidian(async ({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		if (!view) throw new Error('no markdown view');
		const state = view.getState();
		if (state.mode !== 'source' || state.source !== false) {
			await view.setState({ ...state, mode: 'source', source: false }, { history: false });
		}
		const editor = view.editor;
		let line = Math.floor(editor.lineCount() / 3);
		while (line < editor.lineCount() - 1 && !/^[A-Za-z]/.test(editor.getLine(line))) line++;
		if (line >= editor.lineCount() - 1) throw new Error('no body line below the middle');
		editor.focus();
		editor.setCursor({ line, ch: 3 });
		editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
	});
	// Let the scroll settle before measuring.
	await browser.pause(300);
}

/** The cursor's line and column, and the text of the top line in view. */
const where = () =>
	browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		if (!view) throw new Error('no markdown view');
		const editor = view.editor;
		const cursor = editor.getCursor();
		const cm = (editor as unknown as { cm: import('@codemirror/view').EditorView }).cm;
		const rect = cm.scrollDOM.getBoundingClientRect();
		const top = cm.posAtCoords({ x: rect.left + 60, y: rect.top + 10 }, false);
		return {
			cursorLine: editor.getLine(cursor.line),
			ch: cursor.ch,
			topLine: cm.state.doc.lineAt(top).text,
		};
	});

const editorText = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue() ?? '');
const undo = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.undo());
const notices = () =>
	browser.executeObsidian(() => Array.from(document.querySelectorAll('.notice')).map((n) => n.textContent ?? ''));

const conversions = [
	{ from: NOTES.endOfSection, to: NOTES.endOfNote, command: 'move-comments-to-end-of-note' },
	{ from: NOTES.endOfNote, to: NOTES.endOfSection, command: 'move-comments-to-end-of-sections' },
];

describe('move comments', () => {
	beforeEach(async () => {
		await obsidianPage.resetVault();
	});

	for (const { from, to, command } of conversions) {
		it(`"${command}" turns "${from}" into "${to}" as one undo step, keeping cursor and scroll`, async () => {
			const original = await obsidianPage.read(from);
			const expected = await obsidianPage.read(to);
			await openInTheMiddle(from, original);
			const before = await where();

			await browser.executeObsidianCommand(`review-marks:${command}`);
			expect(await editorText()).toBe(expected);
			expect(await where()).toEqual(before);
			expect((await notices()).some((n) => /^Review Marks: moved 12 comments to/.test(n))).toBe(true);

			// Running it again changes nothing and adds no undo step.
			await browser.executeObsidianCommand(`review-marks:${command}`);
			expect(await editorText()).toBe(expected);
			expect((await notices()).some((n) => /already at/.test(n))).toBe(true);

			await undo();
			expect(await editorText()).toBe(original);
		});
	}

	it('leaves orphan definitions in place and gives their count', async () => {
		const note = 'Orphans.md';
		await resetVaultTo({ [note]: '# One\n\n{A}[^r1].\n\n[^r1]: Ay.\n[^r7]: Orphan.\n\n# Two\n\nEnd.\n' });
		await obsidianPage.openFile(note);
		await browser.executeObsidianCommand('review-marks:move-comments-to-end-of-note');
		expect(await editorText()).toBe('# One\n\n{A}[^r1].\n\n[^r7]: Orphan.\n\n# Two\n\nEnd.\n\n[^r1]: Ay.\n');
		expect((await notices()).some((n) => n.includes('Left 1 comment without a marker in place.'))).toBe(true);
	});

	it('writes new Comments at the end of the note when the placement setting says so', async () => {
		const note = 'Placement.md';
		await resetVaultTo({ [note]: '# One\n\nAlpha beta.\n\n# Two\n\nGamma.\n' });
		await obsidianPage.openFile(note);
		await browser.executeObsidian(({ app, plugins }) => {
			(plugins.reviewMarks as unknown as { settings: { placement: string } }).settings.placement = 'end-of-note';
			const editor = app.workspace.activeEditor?.editor;
			if (!editor) throw new Error('no editor');
			const from = editor.getValue().indexOf('beta');
			editor.focus();
			editor.setSelection(editor.offsetToPos(from), editor.offsetToPos(from + 4));
		});
		await browser.executeObsidianCommand('review-marks:annotate-selection');
		await $('.rm-cbox-input').setValue('B');
		await browser.keys('Enter');
		await browser.waitUntil(async () => (await editorText()).includes('[^r1]: B'));
		expect(await editorText()).toBe('# One\n\nAlpha {beta}[^r1].\n\n# Two\n\nGamma.\n\n[^r1]: B\n');
		await browser.executeObsidian(({ plugins }) => {
			(plugins.reviewMarks as unknown as { settings: { placement: string } }).settings.placement = 'end-of-section';
		});
	});
});
