import { $, $$, browser, expect } from '@wdio/globals';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { resetVaultTo } from '../harness.ts';

const NOTE = 'Sidebar me.md';
const filler = Array.from({ length: 60 }, (_, i) => `Paragraph ${i} of filler text.\n`).join('\n');
const TEXT = [
	'Intro {first}[^r1] line.',
	'',
	'# Part one',
	'',
	filler,
	'## Deep',
	'',
	'The {far target}[^r2] sits here.',
	'',
	'[^r1]: One.',
	'[^r2]: Two.',
	'[^r9]: Lost.',
	'',
].join('\n');

const editorText = () =>
	browser.executeObsidian(({ app, obsidian }, note) => {
		const leaf = app.workspace.getLeavesOfType('markdown').find((l) => (l.view as { file?: { path: string } }).file?.path === note);
		return leaf?.view instanceof obsidian.MarkdownView ? leaf.view.editor.getValue() : '';
	}, NOTE);
const cursor = () =>
	browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getLeavesOfType('markdown')[0]?.view;
		return view instanceof obsidian.MarkdownView ? view.editor.posToOffset(view.editor.getCursor()) : -1;
	});
const undo = () =>
	browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getLeavesOfType('markdown')[0]?.view;
		if (view instanceof obsidian.MarkdownView) view.editor.undo();
	});

async function open(text: string): Promise<void> {
	await browser.executeObsidian(({ app }) => app.workspace.detachLeavesOfType('markdown'));
	await resetVaultTo({ [NOTE]: text });
	await obsidianPage.openFile(NOTE);
	await browser.waitUntil(async () => (await editorText()) === text);
	await browser.executeObsidianCommand('review-marks:open-annotations-sidebar');
	await expect($('.rm-sidebar .rm-sb-count')).toHaveText('2 annotations');
}

const entry = (id: string) => $(`.rm-sidebar .rm-sb-entry[data-rm-id="${id}"]`);

describe('Annotations sidebar', () => {
	beforeEach(() => open(TEXT));
	afterEach(() => browser.executeObsidian(({ app }) => app.workspace.detachLeavesOfType('review-marks-annotations')));

	it('lists Annotations by section, with untargeted Comments apart', async () => {
		const titles = await $$('.rm-sidebar .rm-sb-group-title').map((el) => el.getText());
		expect(titles).toEqual(['Sidebar me', 'Part one', 'Deep', 'Comments without a target']);
		await expect(entry('r2').$('.rm-sb-target')).toHaveText('far target');
		await expect(entry('r9').$('textarea')).toHaveValue('Lost.');
	});

	it('saves an edited Comment on Ctrl+Enter as one undo step, and refuses an empty one', async () => {
		const ta = entry('r1').$('textarea');
		// Typed rather than setValue: WebDriver's clear blurs the textarea, which saves.
		await ta.click();
		await browser.keys(['Control', 'a']);
		await browser.keys('Changed.');
		await browser.keys(['Control', 'Enter']);
		await browser.waitUntil(async () => (await editorText()).includes('[^r1]: Changed.'));
		await expect(ta).toBeFocused();
		await undo();
		await browser.waitUntil(async () => (await editorText()) === TEXT);

		await ta.click();
		await browser.keys(['Control', 'a']);
		await browser.keys('Backspace');
		await browser.keys(['Control', 'Enter']);
		await expect($('.notice')).toHaveText(expect.stringContaining('To delete it, use Remove annotation'));
		expect(await editorText()).toBe(TEXT);
	});

	it('keeps a draft when the note changes', async () => {
		const ta = entry('r2').$('textarea');
		await ta.click();
		await browser.keys(['Control', 'a']);
		await browser.keys('Draft');
		await browser.executeObsidian(({ app, obsidian }) => {
			const view = app.workspace.getLeavesOfType('markdown')[0]?.view;
			if (view instanceof obsidian.MarkdownView) view.editor.replaceRange('New ', { line: 0, ch: 0 });
		});
		await browser.pause(500);
		await expect(ta).toHaveValue('Draft');
		await expect(ta).toBeFocused();
	});

	it('scrolls to the Target on click, keeping focus, and puts the cursor there on double-click', async () => {
		const top = () =>
			browser.executeObsidian(({ app, obsidian }) => {
				const view = app.workspace.getLeavesOfType('markdown')[0]?.view;
				return view instanceof obsidian.MarkdownView ? view.contentEl.querySelector('.cm-scroller')?.scrollTop ?? 0 : 0;
			});
		expect(await top()).toBe(0);
		const target = entry('r2').$('.rm-sb-target');
		await target.click();
		await browser.waitUntil(async () => (await top()) > 0);
		const sidebarFocused = await browser.execute(() => !!document.activeElement?.closest('.rm-sidebar') || document.activeElement === document.body);
		expect(sidebarFocused).toBe(true);

		await target.doubleClick();
		await browser.waitUntil(async () => (await cursor()) === TEXT.indexOf('far target'));
		const editorFocused = await browser.execute(() => !!document.activeElement?.closest('.cm-editor'));
		expect(editorFocused).toBe(true);
	});

	it('scrolls Reading view to the Target on click and flashes it', async () => {
		await browser.executeObsidian(async ({ app, obsidian }) => {
			const view = app.workspace.getLeavesOfType('markdown')[0]?.view;
			if (view instanceof obsidian.MarkdownView) await view.setState({ ...view.getState(), mode: 'preview' }, { history: false });
		});
		await entry('r2').$('.rm-sb-target').click();
		await expect($('.markdown-preview-view .rm-target[data-rm-id="r2"].rm-flash')).toBeDisplayed();
	});

	it('removes an Annotation with its button, as one undo step', async () => {
		await entry('r1').$('.rm-sb-remove').click();
		await browser.waitUntil(async () => !(await editorText()).includes('[^r1]'));
		expect(await editorText()).toBe(TEXT.replace('{first}[^r1]', 'first').replace('[^r1]: One.\n', ''));
		await expect($('.rm-sidebar .rm-sb-count')).toHaveText('1 annotation');
		await undo();
		await browser.waitUntil(async () => (await editorText()) === TEXT);
	});

	it('removes from a closed note with Vault.process, keeping CRLF', async () => {
		const crlf = 'A {b}[^r1] c.\r\n\r\n[^r1]: One.\r\n';
		await browser.executeObsidian(({ app }) => app.workspace.detachLeavesOfType('markdown'));
		await resetVaultTo({ [NOTE]: crlf });
		await obsidianPage.openFile(NOTE);
		await expect($('.rm-sidebar .rm-sb-count')).toHaveText('1 annotation');
		// Close the note from the sidebar; the sidebar keeps listing it.
		await browser.executeObsidian(({ app }) => {
			const leaf = app.workspace.getLeavesOfType('review-marks-annotations')[0];
			if (leaf) app.workspace.setActiveLeaf(leaf);
			app.workspace.detachLeavesOfType('markdown');
		});
		await browser.waitUntil(() => browser.executeObsidian(({ app }) => app.workspace.getLeavesOfType('markdown').length === 0));
		// Closing the editor may have saved the note with LF; put the CRLF back while it is closed.
		await obsidianPage.write(NOTE, crlf);
		await browser.pause(500);
		await entry('r1').$('.rm-sb-remove').click();
		await browser.waitUntil(async () => !(await obsidianPage.read(NOTE)).includes('[^r1]'));
		expect(await obsidianPage.read(NOTE)).toBe('A b c.\r\n');
	});

	it('shows the count in the status bar, and the setting hides it', async () => {
		const status = $('.status-bar .rm-status-count');
		await expect(status).toHaveText('2 annotations');
		const setShown = (shown: boolean) =>
			browser.executeObsidian(({ plugins }, shown) => {
				const plugin = plugins.reviewMarks as unknown as { store: { update(p: object): Promise<void> } };
				return plugin.store.update({ showStatusBar: shown });
			}, shown);
		await setShown(false);
		await expect(status).not.toBeDisplayed();
		await setShown(true);
		await expect(status).toBeDisplayed();
	});
});

describe('Edit comment at cursor', () => {
	it('opens the comment box from the definition', async () => {
		await open(TEXT);
		await browser.executeObsidian(({ app, obsidian }, at) => {
			const leaf = app.workspace.getLeavesOfType('markdown')[0];
			if (!leaf || !(leaf.view instanceof obsidian.MarkdownView)) return;
			app.workspace.setActiveLeaf(leaf, { focus: true });
			leaf.view.editor.setCursor(leaf.view.editor.offsetToPos(at));
		}, TEXT.indexOf('[^r2]: Two.') + 3);
		await browser.executeObsidianCommand('review-marks:edit-comment-at-cursor');
		await expect($('.rm-cbox-input')).toHaveValue('Two.');
		await browser.keys('Escape');
	});
});
