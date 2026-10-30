import { $, browser, expect } from '@wdio/globals';
import { beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';

const NOTE = 'Edit me.md';
const TEXT = '# One\n\nKell {fails}[^r1] the save and seizes in place.\n\nMore text down here.\n\n[^r1]: Why?\n';
const EMPTY = 'a comment cannot be empty. To delete it, use Remove annotation.';

const editorText = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue() ?? '');
const notices = () => browser.executeObsidian(() => Array.from(document.querySelectorAll('.notice')).map((n) => n.textContent ?? ''));
const clearNotices = () => browser.executeObsidian(() => document.querySelectorAll('.notice').forEach((n) => n.remove()));

/** Opens the note in Live Preview and the comment box on r1, with its text cleared. */
async function editAndClear(): Promise<void> {
	await obsidianPage.resetVault({ [NOTE]: TEXT });
	await obsidianPage.openFile(NOTE);
	await browser.executeObsidian(async ({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		if (!view) throw new Error('no markdown view');
		await view.setState({ ...view.getState(), mode: 'source', source: false }, { history: false });
		view.editor.focus();
		view.editor.setCursor(view.editor.offsetToPos(view.editor.getValue().indexOf('fails') + 1));
	});
	await browser.executeObsidianCommand('review-marks:edit-comment-at-cursor');
	const input = $('.rm-cbox-input');
	await expect(input).toHaveValue('Why?');
	// Emptied in place, so the box keeps focus.
	await browser.execute(() => {
		const ta = document.querySelector<HTMLTextAreaElement>('.rm-cbox-input');
		if (!ta) throw new Error('no comment box');
		ta.value = '';
		ta.dispatchEvent(new Event('input', { bubbles: true }));
	});
	await expect(input).toBeFocused();
	await clearNotices();
}

describe('Edit comment', () => {
	beforeEach(editAndClear);

	it('refuses an empty Comment on Enter with a notice, keeping the box open', async () => {
		await browser.keys('Enter');
		await browser.waitUntil(async () => (await notices()).some((n) => n.includes(EMPTY)));
		await expect($('.rm-cbox')).toExist();
		await browser.keys('Escape');
		expect(await editorText()).toBe(TEXT);
	});

	it('shows the same notice when an emptied Comment is clicked away from, and keeps the Comment', async () => {
		await $('.cm-content .HyperMD-header-1').click();
		await browser.waitUntil(async () => (await notices()).some((n) => n.includes(EMPTY)));
		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(TEXT);
	});
});
