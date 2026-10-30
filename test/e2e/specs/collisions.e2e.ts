import { $, browser, expect } from '@wdio/globals';
import { afterEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';

const NOTE = 'Collisions.md';

// Through the note's leaf: once the sidebar is clicked, it is the active leaf.
const editorText = () =>
	browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getLeavesOfType('markdown')[0]?.view;
		return view instanceof obsidian.MarkdownView ? view.editor.getValue() : '';
	});
const undo = () =>
	browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getLeavesOfType('markdown')[0]?.view;
		if (view instanceof obsidian.MarkdownView) view.editor.undo();
	});

/** Opens a note in Live Preview with `selection` selected. */
async function open(text: string, selection?: string): Promise<void> {
	await browser.executeObsidian(({ app }) => app.workspace.detachLeavesOfType('markdown'));
	await obsidianPage.resetVault({ [NOTE]: text });
	await obsidianPage.openFile(NOTE);
	await browser.waitUntil(async () => (await editorText()) === text);
	await browser.executeObsidian(
		async ({ app, obsidian }, selection) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			if (!view) throw new Error('no markdown view');
			const state = view.getState();
			if (state.mode !== 'source' || state.source !== false) {
				await view.setState({ ...state, mode: 'source', source: false }, { history: false });
			}
			if (!selection) return;
			const editor = view.editor;
			const from = editor.getValue().indexOf(selection);
			editor.focus();
			editor.setSelection(editor.offsetToPos(from), editor.offsetToPos(from + selection.length));
		},
		selection ?? '',
	);
}

/** Whether a command is offered for the active note. */
const commandAvailable = (id: string) =>
	browser.executeObsidian(({ app }, id) => {
		const commands = (app as unknown as { commands: { findCommand(id: string): { editorCheckCallback?: unknown } | undefined } }).commands;
		const command = commands.findCommand(id);
		const editor = app.workspace.activeEditor?.editor;
		const check = command?.editorCheckCallback as ((checking: boolean, editor: unknown, ctx: unknown) => boolean) | undefined;
		return check ? check(true, editor, app.workspace.activeEditor) !== false : command !== undefined;
	}, id);

describe("Other plugins' syntax", () => {
	afterEach(() => browser.executeObsidian(({ app }) => app.workspace.detachLeavesOfType('review-marks-annotations')));

	it('refuses a Target that ends inside a link, with a notice and no change', async () => {
		const text = 'See [[Note|the alias]] now.\n';
		await open(text, 'alias]] now');
		await browser.executeObsidianCommand('review-marks:annotate-selection');
		await expect($('.notice')).toHaveText(expect.stringContaining("can't start or end inside a link"));
		expect(await editorText()).toBe(text);
	});

	it('flags duplicate IDs in the sidebar and fixes them as one undo step', async () => {
		const text = '{one}[^r1] and {two}[^r1].\n\n[^r1]: first\n[^r1]: second\n';
		await open(text);
		await browser.executeObsidianCommand('review-marks:open-annotations-sidebar');
		const flag = $('.rm-sidebar .rm-sb-duplicates');
		await expect(flag).toHaveText(expect.stringContaining('[^r1]'));
		await flag.$('button=Fix IDs').click();
		await browser.waitUntil(
			async () => (await editorText()) === '{one}[^r1] and {two}[^r2].\n\n[^r1]: first\n[^r2]: second\n',
		);
		await expect($('.rm-sidebar .rm-sb-count')).toHaveText('2 annotations');
		await expect(flag).not.toBeDisplayed();
		await undo();
		await browser.waitUntil(async () => (await editorText()) === text);
	});

	it('leaves an Excalidraw drawing alone: no highlight and no commands', async () => {
		await open('---\nexcalidraw-plugin: parsed\n---\n{Hello}[^r1] ^abcdefgh\n\n[^r1]: c\n');
		const targets = await browser.executeObsidian(({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			return view?.contentEl.querySelectorAll('.rm-target').length ?? -1;
		});
		expect(targets).toBe(0);
		expect(await commandAvailable('review-marks:annotate-selection')).toBe(false);
		expect(await commandAvailable('review-marks:remove-annotation-at-cursor')).toBe(false);
	});
});
