// The suite's own isolation (test/e2e/harness.ts). The tests here run in order and each one
// leaves something behind for the next to check it was cleared.
import { browser, expect } from '@wdio/globals';
import { describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';

const NOTE = 'Isolation.md';
const FIRST = '# First\n\nThe earlier test edits this.\n\n## End\n';
const SECOND = '# Second\n\nA different note at the same path.\n\n## End\n';

const editorText = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue() ?? '');

const geometry = () =>
	browser.executeObsidian(({ app }) => {
		const r = app.workspace.containerEl.getBoundingClientRect();
		return `${window.innerWidth}x${window.innerHeight} ${r.left},${r.width}`;
	});

type ElectronWindow = { getSize(): [number, number]; setSize(w: number, h: number): void };

describe('Test isolation', () => {
	it('leaves an unsaved edit and a setting change behind', async () => {
		await obsidianPage.resetVault({ [NOTE]: FIRST });
		await obsidianPage.openFile(NOTE);
		await browser.executeObsidian(({ app, plugins }) => {
			const editor = app.workspace.activeEditor?.editor;
			if (!editor) throw new Error('no editor');
			editor.replaceRange('[^r1]: Left behind.\n\n', editor.offsetToPos(editor.getValue().indexOf('## End')));
			(plugins.reviewMarks as unknown as { settings: { dragTrigger: string } }).settings.dragTrigger = 'off';
		});
	});

	it('starts the next test with one tab, the note as written, and the settings as loaded', async () => {
		await obsidianPage.resetVault({ [NOTE]: SECOND });
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

	it('resizes the window just as the test ends, like a window manager at startup', async () => {
		await browser.executeObsidian(({ require }) => {
			const win = (require('electron') as unknown as { remote: { getCurrentWindow(): ElectronWindow } }).remote.getCurrentWindow();
			const [w, h] = win.getSize();
			window.setTimeout(() => win.setSize(w + 200, h), 300);
			window.setTimeout(() => win.setSize(w, h), 600);
		});
	});

	it('starts the next test once the layout has stopped moving', async () => {
		const samples = [await geometry()];
		for (let i = 0; i < 8; i++) {
			await browser.pause(125);
			samples.push(await geometry());
		}
		expect(new Set(samples).size).toBe(1);
	});
});
