// The popover closes when its Target goes away, wherever the pointer is.
import { $, browser, expect } from '@wdio/globals';
import { beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { resetVaultTo } from '../harness.ts';

const NOTE = 'Popover me.md';
const TEXT = '# One\n\nKell {fails}[^r1] the save and seizes in place.\n\n[^r1]: Why?\n';

async function openInLivePreview(): Promise<void> {
	await resetVaultTo({ [NOTE]: TEXT });
	await obsidianPage.openFile(NOTE);
	await browser.executeObsidian(async ({ app, obsidian, plugins }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		if (!view) throw new Error('no markdown view');
		await view.setState({ ...view.getState(), mode: 'source', source: false }, { history: false });
		await (plugins.reviewMarks as unknown as { store: { update(p: object): Promise<void> } }).store.update({ showHover: true });
	});
	await $('.cm-content .rm-target[data-rm-id="r1"]').waitForExist();
}

const editorText = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue() ?? '');

describe('Popover', () => {
	beforeEach(openInLivePreview);

	it('closes when its Target goes away, as when a new Annotation is cancelled with Esc', async () => {
		await browser.executeObsidian(({ app, obsidian }) => {
			const editor = app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.editor;
			if (!editor) throw new Error('no editor');
			const from = editor.getValue().indexOf('the save');
			editor.focus();
			editor.setSelection(editor.offsetToPos(from), editor.offsetToPos(from + 'the save'.length));
		});
		await browser.executeObsidianCommand('review-marks:annotate-selection');
		await expect($('.rm-cbox-input')).toBeFocused();
		await $('.cm-content .rm-target[data-rm-id="r2"]').moveTo();
		await expect($('.rm-popover')).toHaveText(expect.stringContaining('No comment yet.'));

		// The pointer stays on the spot where the Target was.
		await browser.keys('Escape');
		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(TEXT);
		await expect($('.rm-popover')).not.toExist();
	});

	it('closes when its note closes', async () => {
		await $('.cm-content .rm-target[data-rm-id="r1"]').moveTo();
		await expect($('.rm-popover')).toHaveText(expect.stringContaining('Why?'));

		await browser.executeObsidian(({ app, obsidian }) => app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.leaf.detach());
		await expect($('.rm-popover')).not.toExist();
	});

	it('stays open while its Target is redrawn', async () => {
		await $('.cm-content .rm-badge[data-rm-id="r1"]').click();
		await expect($('.rm-popover')).toHaveText(expect.stringContaining('Why?'));
		// Moving the cursor into the Target redraws it with its syntax showing.
		await browser.executeObsidian(({ app }) => {
			const editor = app.workspace.activeEditor?.editor;
			editor?.setCursor(editor.offsetToPos(editor.getValue().indexOf('fails') + 2));
		});
		await browser.pause(300);
		await expect($('.rm-popover')).toExist();
	});
});
