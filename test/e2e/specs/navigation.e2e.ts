import { $, $$, browser, expect } from '@wdio/globals';
import { beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { resetVaultTo } from '../harness.ts';

const NOTE = 'Navigate me.md';
const TEXT = '# One\n\nAlpha {abc}[^r1] beta {gamma}[^r2].\n\n[^r1]: First.\n[^r2]: Second.\n\n## Two\n\nMore text.\n';

/** Opens the note in Live Preview (or Source mode) with the editor focused and the cursor at `offset`. */
async function open(text: string, offset: number, source = false): Promise<void> {
	// Close the note first, so a pending save of the last test's edits can't land after the reset.
	await browser.executeObsidian(({ app }) => app.workspace.detachLeavesOfType('markdown'));
	await resetVaultTo({ [NOTE]: text });
	await obsidianPage.openFile(NOTE);
	await browser.waitUntil(async () => (await editorText()) === text);
	await browser.executeObsidian(
		async ({ app, obsidian }, offset, source) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			if (!view) throw new Error('no markdown view');
			await view.setState({ ...view.getState(), mode: 'source', source }, { history: false });
			view.editor.focus();
			view.editor.setCursor(view.editor.offsetToPos(offset));
		},
		offset,
		source,
	);
}

const editorText = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue() ?? '');
const cursor = () =>
	browser.executeObsidian(({ app }) => {
		const editor = app.workspace.activeEditor?.editor;
		return editor ? editor.posToOffset(editor.getCursor()) : -1;
	});
const undo = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.undo());
const afterMarker = (text: string, id: string) => text.indexOf(`[^${id}]`) + `[^${id}]`.length;

describe('Backspace just after a hidden marker', () => {
	beforeEach(() => open(TEXT, afterMarker(TEXT, 'r1')));

	it('deletes the Target, then removes the Annotation as its own undo step', async () => {
		await browser.keys('Backspace');
		expect(await editorText()).toContain('Alpha {ab}[^r1] beta');
		await browser.keys('Backspace');
		expect(await editorText()).toContain('Alpha {a}[^r1] beta');

		await browser.keys('Backspace');
		expect(await editorText()).toBe('# One\n\nAlpha  beta {gamma}[^r2].\n\n[^r2]: Second.\n\n## Two\n\nMore text.\n');
		expect(await cursor()).toBe('# One\n\nAlpha '.length);

		await undo();
		expect(await editorText()).toBe(TEXT.replace('{abc}', '{a}'));
	});

	it('is a normal Backspace in Source mode', async () => {
		await open(TEXT, afterMarker(TEXT, 'r1'), true);
		await browser.keys('Backspace');
		expect(await editorText()).toContain('Alpha {abc}[^r1 beta');
	});
});

describe('Go to next and previous annotation', () => {
	it('moves the cursor to the start of each Target in turn, wrapping around', async () => {
		await open(TEXT, 0);
		expect(await cursor()).toBe(0);
		await browser.executeObsidianCommand('review-marks:go-to-next-annotation');
		expect(await cursor()).toBe(TEXT.indexOf('abc'));
		await browser.executeObsidianCommand('review-marks:go-to-next-annotation');
		expect(await cursor()).toBe(TEXT.indexOf('gamma'));
		await browser.executeObsidianCommand('review-marks:go-to-next-annotation');
		expect(await cursor()).toBe(TEXT.indexOf('abc'));
		await browser.executeObsidianCommand('review-marks:go-to-previous-annotation');
		expect(await cursor()).toBe(TEXT.indexOf('gamma'));
	});

	it('scrolls Reading view to the Target', async () => {
		const filler = Array.from({ length: 80 }, (_, i) => `Paragraph ${i} of filler text.\n`).join('\n');
		const long = `# Long\n\n${filler}\nThe {far target}[^r1] sits here.\n\n[^r1]: Far.\n`;
		await open(long, 0);
		await browser.executeObsidian(async ({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			if (view) await view.setState({ ...view.getState(), mode: 'preview' }, { history: false });
		});
		const scroll = () =>
			browser.executeObsidian(({ app, obsidian }) => {
				const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
				return view?.previewMode.getScroll() ?? 0;
			});
		await browser.waitUntil(() =>
			browser.executeObsidian(({ app, obsidian }) => {
				const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
				return view?.getMode() === 'preview' && !!view.previewMode.containerEl.querySelector('p');
			}),
		);
		expect(await scroll()).toBe(0);
		await browser.executeObsidianCommand('review-marks:go-to-next-annotation');
		await browser.waitUntil(async () => (await scroll()) > 0);
		await browser.waitUntil(() =>
			browser.executeObsidian(({ app, obsidian }) => {
				const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
				return Array.from(view?.previewMode.containerEl.querySelectorAll('p') ?? []).some((p) => {
					const r = p.getBoundingClientRect();
					return p.textContent?.includes('sits here') && r.top >= 0 && r.bottom <= window.innerHeight;
				});
			}),
		);
	});
});

describe('Remove annotation at cursor', () => {
	it('keeps the Target text, as one undo step', async () => {
		await open(TEXT, TEXT.indexOf('amma'));
		await browser.executeObsidianCommand('review-marks:remove-annotation-at-cursor');
		expect(await editorText()).toBe('# One\n\nAlpha {abc}[^r1] beta gamma.\n\n[^r1]: First.\n\n## Two\n\nMore text.\n');
		await undo();
		expect(await editorText()).toBe(TEXT);
	});
});

/** Right-clicks the first element matching `selector` in the note: `dx` pixels in, or in the middle. */
async function rightClick(selector: string, dx?: number): Promise<void> {
	const point = await browser.executeObsidian(
		({ app, obsidian }, selector, dx) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			const r = view?.contentEl.querySelector(selector)?.getBoundingClientRect();
			return r ? { x: Math.round(r.left + (dx ?? r.width / 2)), y: Math.round(r.top + r.height / 2) } : null;
		},
		selector,
		dx,
	);
	if (!point) throw new Error(`${selector} not found`);
	await browser.action('pointer').move(point).down({ button: 2 }).up({ button: 2 }).perform();
}

describe('Editor context menu', () => {
	const menuTitles = async () => {
		await expect($('.menu')).toExist();
		return $$('.menu .menu-item-title').map((el) => el.getText());
	};

	it('offers Edit comment and Remove annotation on an Annotation, and edits through the comment box', async () => {
		await open(TEXT, TEXT.indexOf('amma'));
		await rightClick('.cm-content .rm-target[data-rm-id="r2"]');
		const titles = await menuTitles();
		expect(titles).toContain('Edit comment');
		expect(titles).toContain('Remove annotation');
		expect(titles).not.toContain('Annotate selection');

		await $('.menu').$('div=Edit comment').click();
		const input = $('.rm-cbox-input');
		await expect(input).toBeFocused();
		await expect(input).toHaveValue('Second.');
		await input.setValue('Revised.');
		await browser.keys('Enter');
		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(TEXT.replace('Second.', 'Revised.'));
		await undo();
		expect(await editorText()).toBe(TEXT);
	});

	it('offers Annotate selection when text is selected', async () => {
		await open(TEXT, 0);
		await browser.executeObsidian(({ app }) => {
			const editor = app.workspace.activeEditor?.editor;
			editor?.setSelection({ line: 9, ch: 0 }, { line: 9, ch: 4 });
		});
		// Line 9 is the last non-empty line, "More text.".
		await rightClick('.cm-content .cm-line:nth-last-child(2)', 8);
		expect(await menuTitles()).toContain('Annotate selection');
		await browser.keys('Escape');
	});
});
