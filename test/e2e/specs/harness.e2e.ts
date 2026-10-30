// The suite's own isolation (test/e2e/harness.ts). The tests here run in order and each one
// leaves something behind for the next to check it was cleared.
import { browser, expect } from '@wdio/globals';
import { describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { resetVaultTo } from '../harness.ts';

const NOTE = 'Isolation.md';
const FIRST = '# First\n\nThe earlier test edits this.\n\n## End\n';
const SECOND = '# Second\n\nA different note at the same path.\n\n## End\n';

const editorText = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue() ?? '');

describe('Test isolation', () => {
	it('leaves an unsaved edit and a setting change behind', async () => {
		await resetVaultTo({ [NOTE]: FIRST });
		await obsidianPage.openFile(NOTE);
		await browser.executeObsidian(({ app, plugins }) => {
			const editor = app.workspace.activeEditor?.editor;
			if (!editor) throw new Error('no editor');
			editor.replaceRange('[^r1]: Left behind.\n\n', editor.offsetToPos(editor.getValue().indexOf('## End')));
			(plugins.reviewMarks as unknown as { settings: { dragTrigger: string } }).settings.dragTrigger = 'off';
		});
	});

	it('starts the next test with one tab, the note as written, and the settings as loaded', async () => {
		await resetVaultTo({ [NOTE]: SECOND });
		await obsidianPage.openFile(NOTE);
		// Past Obsidian's ~2s save delay, so a leftover tab's edits would have arrived by now.
		await browser.pause(2500);
		expect(await editorText()).toBe(SECOND);
		expect(await browser.executeObsidian(({ app }) => app.workspace.getLeavesOfType('markdown').length)).toBe(1);
		const trigger = await browser.executeObsidian(
			({ plugins }) => (plugins.reviewMarks as unknown as { settings: { dragTrigger: string } }).settings.dragTrigger,
		);
		expect(trigger).not.toBe('off');
	});

	it('keeps the vault config when the notes are reset', async () => {
		const config = () =>
			browser.executeObsidian(async ({ app }) => ({
				onDisk: await app.vault.adapter.exists(`${app.vault.configDir}/app.json`),
				readableLineLength: (app.vault as unknown as { getConfig(key: string): unknown }).getConfig('readableLineLength'),
			}));
		const expected = { onDisk: true, readableLineLength: false };
		expect(await config()).toEqual(expected);
		await resetVaultTo({ [NOTE]: FIRST });
		// Obsidian reloads its config about half a second after the config dir changes.
		await browser.pause(1500);
		expect(await config()).toEqual(expected);
	});
});
