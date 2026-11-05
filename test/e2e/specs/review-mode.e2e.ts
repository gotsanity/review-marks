import { $, $$, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { doubleClick, type Point, pointerDrag, resetVaultTo } from '../harness.ts';

const NOTE = 'Review me.md';
const TEXT = 'Some {text}[^r1] to review.\n\n[^r1]: One.\n';
const ON = 'Review mode on: select text to annotate it.';
const OFF = 'Review mode off';

const indicator = () => $('.status-bar .rm-status-review-mode');
const headerButton = () => $('.rm-sidebar-header .rm-review-mode-button');

const isOn = () =>
	browser.executeObsidian(({ plugins }) => (plugins.reviewMarks as unknown as { reviewMode: { on: boolean } }).reviewMode.on);

const clearNotices = () => browser.execute(() => document.querySelectorAll('.notice').forEach((n) => n.remove()));

/** Waits for a Notice reading exactly `text`. */
const expectNotice = (text: string) =>
	browser.waitUntil(async () => (await $$('.notice').map((n) => n.getText())).includes(text), {
		timeoutMsg: `no "${text}" notice`,
	});

const setShowStatusBar = (shown: boolean) =>
	browser.executeObsidian(
		({ plugins }, shown) => (plugins.reviewMarks as unknown as { store: { update(p: object): Promise<void> } }).store.update({ showStatusBar: shown }),
		shown,
	);

describe('Review Mode', () => {
	beforeEach(async () => {
		await resetVaultTo({ [NOTE]: TEXT });
		await obsidianPage.openFile(NOTE);
		await clearNotices();
	});
	afterEach(async () => {
		await browser.executeObsidian(({ app, plugins }) => {
			(plugins.reviewMarks as unknown as { reviewMode: { set(on: boolean): void } }).reviewMode.set(false);
			app.workspace.detachLeavesOfType('review-marks-annotations');
		});
		await setShowStatusBar(true);
		await clearNotices();
	});

	it('is off at launch, with the indicator hidden', async () => {
		expect(await isOn()).toBe(false);
		await expect(indicator()).not.toBeDisplayed();
	});

	it('turns on with the command, and the indicator turns it off', async () => {
		await browser.executeObsidianCommand('review-marks:open-annotations-sidebar');
		await expect(headerButton()).toBeDisplayed();
		await expect(headerButton()).not.toHaveElementClass('is-active');

		await browser.executeObsidianCommand('review-marks:toggle-review-mode');
		await expectNotice(ON);
		expect(await isOn()).toBe(true);
		await expect(indicator()).toBeDisplayed();
		await expect(indicator()).toHaveText('Review mode');
		await expect(indicator()).toHaveAttribute('aria-label', 'Turn off review mode');
		await expect(headerButton()).toHaveElementClass('is-active');
		await expect(headerButton()).toHaveAttribute('aria-label', 'Turn off review mode');

		// The indicator sits just left of the count.
		const nextClass = await browser.execute(
			() => document.querySelector('.status-bar .rm-status-review-mode')?.nextElementSibling?.className ?? '',
		);
		expect(nextClass).toContain('rm-status-count');

		await clearNotices();
		await indicator().click();
		await expectNotice(OFF);
		expect(await isOn()).toBe(false);
		await expect(indicator()).not.toBeDisplayed();
		await expect(headerButton()).not.toHaveElementClass('is-active');
		await expect(headerButton()).toHaveAttribute('aria-label', 'Turn on review mode');
	});

	it('the sidebar header button toggles it', async () => {
		await browser.executeObsidianCommand('review-marks:open-annotations-sidebar');
		await headerButton().click();
		await expectNotice(ON);
		expect(await isOn()).toBe(true);
		await expect(indicator()).toBeDisplayed();
		await expect(headerButton()).toHaveElementClass('is-active');

		await clearNotices();
		await headerButton().click();
		await expectNotice(OFF);
		expect(await isOn()).toBe(false);
		await expect(indicator()).not.toBeDisplayed();
	});

	it('keeps the indicator with the annotation count turned off', async () => {
		await setShowStatusBar(false);
		await browser.executeObsidianCommand('review-marks:toggle-review-mode');
		await expect($('.status-bar .rm-status-count')).not.toBeDisplayed();
		await expect(indicator()).toBeDisplayed();
	});
});

// ---------- Annotating on release in Live Preview and Source mode ----------

const EDIT_NOTE = 'Select me.md';
const EDIT_TEXT = '# One\n\nKell fails the save and seizes in place.\n\nSome {text}[^r1] to review.\n\n[^r1]: One.\n';

/** Opens the note in Live Preview (or Source mode) with the cursor at its start. */
async function openEditor(source = false): Promise<void> {
	await resetVaultTo({ [EDIT_NOTE]: EDIT_TEXT });
	await obsidianPage.openFile(EDIT_NOTE);
	await browser.executeObsidian(async ({ app, obsidian }, source) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		if (!view) throw new Error('no markdown view');
		await view.setState({ ...view.getState(), mode: 'source', source }, { history: false });
		view.editor.focus();
		view.editor.setCursor({ line: 0, ch: 0 });
	}, source);
}

const setReviewMode = (on: boolean) =>
	browser.executeObsidian(
		({ plugins }, on) => (plugins.reviewMarks as unknown as { reviewMode: { set(on: boolean): void } }).reviewMode.set(on),
		on,
	);

/** Screen points just inside the first and last characters of `target`, and between them. */
async function endsOf(target: string): Promise<{ start: Point; end: Point; middle: Point }> {
	const ends = await browser.executeObsidian(({ app, obsidian }, target) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		type Rect = { left: number; right: number; top: number; bottom: number };
		const cm = (view?.editor as unknown as { cm?: { coordsAtPos(pos: number, side: number): Rect | null } }).cm;
		const from = view?.editor.getValue().indexOf(target) ?? -1;
		const a = from < 0 ? null : cm?.coordsAtPos(from, 1);
		const b = from < 0 ? null : cm?.coordsAtPos(from + target.length, -1);
		if (!a || !b) return null;
		const y = Math.round((a.top + a.bottom) / 2);
		return {
			start: { x: Math.round(a.left + 2), y },
			end: { x: Math.round(b.left - 2), y },
			middle: { x: Math.round((a.left + b.left) / 2), y },
		};
	}, target);
	if (!ends) throw new Error(`"${target}" is not on screen`);
	return ends;
}

const editorText = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue() ?? '');
const cursorOffset = () =>
	browser.executeObsidian(({ app }) => {
		const editor = app.workspace.activeEditor?.editor;
		return editor ? editor.posToOffset(editor.getCursor('head')) : -1;
	});
const selectedText = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getSelection() ?? '');

/** Types `comment` into the open box, saves with Enter and checks the note's text. */
async function saveComment(comment: string, expected: string): Promise<void> {
	const input = $('.rm-cbox-input');
	await expect(input).toBeFocused();
	await input.setValue(comment);
	await browser.keys('Enter');
	await expect($('.rm-cbox')).not.toExist();
	expect(await editorText()).toBe(expected);
}

/** The note with `target` (above [^r1]'s) annotated as [^r2] and `comment` as its Comment. */
const annotated = (target: string, comment: string) =>
	EDIT_TEXT.replace(target, `{${target}}[^r2]`).replace('[^r1]: One.\n', `[^r2]: ${comment}\n[^r1]: One.\n`);

describe('Review Mode: annotating in the editor', () => {
	beforeEach(async () => {
		await openEditor();
		await setReviewMode(true);
		await clearNotices();
	});
	afterEach(async () => {
		await setReviewMode(false);
		await clearNotices();
	});

	it('opens the comment box on a drag in Live Preview', async () => {
		const { start, end } = await endsOf('the save');
		await pointerDrag(start, end);
		await saveComment('Dragged.', annotated('the save', 'Dragged.'));
	});

	it('opens the comment box on a drag in Source mode', async () => {
		await openEditor(true);
		const { start, end } = await endsOf('the save');
		await pointerDrag(start, end);
		await saveComment('In source.', annotated('the save', 'In source.'));
	});

	it('opens the comment box on a double-clicked word', async () => {
		const { middle } = await endsOf('seizes');
		await doubleClick(middle);
		await saveComment('One word.', annotated('seizes', 'One word.'));
	});

	it('moves the cursor on a click with no selection, and opens no box', async () => {
		const { middle } = await endsOf('seizes');
		await pointerDrag(middle, middle);
		await browser.pause(200);
		await expect($('.rm-cbox')).not.toExist();
		const at = await cursorOffset();
		expect(at).toBeGreaterThan(EDIT_TEXT.indexOf('seizes'));
		expect(at).toBeLessThan(EDIT_TEXT.indexOf('seizes') + 'seizes'.length);
		expect(await editorText()).toBe(EDIT_TEXT);
	});

	it('ignores a keyboard selection', async () => {
		const { start } = await endsOf('the save');
		await pointerDrag(start, start);
		await browser.keys([Key.Shift, Key.ArrowRight, Key.ArrowRight, Key.ArrowRight]);
		await browser.keys(Key.Shift);
		expect(await selectedText()).toBe('the');
		await browser.pause(200);
		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(EDIT_TEXT);
	});

	it('shows the Annotate selection notice for a range it refuses', async () => {
		// From "Some" into the Target of [^r1]: it would overlap the Annotation. In Source mode, so
		// no syntax is revealed under the pointer mid-drag.
		await openEditor(true);
		const { start } = await endsOf('Some');
		const { middle } = await endsOf('ex');
		await pointerDrag(start, middle);
		await expect($('.notice*=the selection overlaps annotation [^r1].')).toExist();
		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(EDIT_TEXT);
	});

	it('ignores a selection made while a comment box is open', async () => {
		const first = await endsOf('the save');
		await pointerDrag(first.start, first.end);
		await expect($('.rm-cbox-input')).toBeFocused();
		await $('.rm-cbox-input').setValue('First.');

		// Pressing outside the box saves it; the selection that follows starts nothing.
		const second = await endsOf('in place');
		await pointerDrag(second.start, second.end);
		await browser.pause(200);
		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(annotated('the save', 'First.'));
	});

	it('keeps the drag trigger working', async () => {
		await browser.executeObsidian(({ plugins }) => {
			(plugins.reviewMarks as unknown as { settings: { dragTrigger: string } }).settings.dragTrigger = 'alt';
		});
		const { start, end } = await endsOf('the save');
		await pointerDrag(start, end, { key: Key.Alt });
		await saveComment('Triggered.', annotated('the save', 'Triggered.'));
	});

	it('does nothing on release while Review Mode is off', async () => {
		await setReviewMode(false);
		const { start, end } = await endsOf('the save');
		await pointerDrag(start, end);
		await browser.pause(200);
		await expect($('.rm-cbox')).not.toExist();
		expect(await selectedText()).toBe('the save');
		expect(await editorText()).toBe(EDIT_TEXT);
	});
});

// ---------- Annotating on release in a Live Preview table cell ----------

const TABLE_NOTE = 'Table.md';
// Padded as Obsidian pads a table when a cell editor opens, so the note's text stays comparable.
const TABLE =
	'# Table\n\nIntro line.\n\n| Name        | Result          |\n| ----------- | --------------- |\n| Doreth Kell | failed the save |\n\nAfter.\n';
const undo = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.undo());

/** Screen points just inside the first character of `first` and the last of `last`, in the table's cell editor if one is open, else in the rendered table. */
async function cellPoints(first: string, last: string): Promise<{ start: Point; end: Point; middle: Point }> {
	const points = await browser.executeObsidian(
		({ app, obsidian }, first, last) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			const widget = view?.contentEl.querySelector('.cm-table-widget');
			const root = widget?.querySelector('.cm-editor .cm-content') ?? widget;
			if (!root) return null;
			const rectOf = (needle: string, atEnd: boolean) => {
				const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
				for (let n = walker.nextNode(); n; n = walker.nextNode()) {
					const i = (n as Text).data.indexOf(needle);
					if (i < 0) continue;
					const r = document.createRange();
					const at = atEnd ? i + needle.length - 1 : i;
					r.setStart(n, at);
					r.setEnd(n, at + 1);
					return r.getBoundingClientRect();
				}
				return null;
			};
			const a = rectOf(first, false);
			const b = rectOf(last, true);
			if (!a || !b || a.width === 0) return null;
			const y = Math.round((a.top + a.bottom) / 2);
			return {
				start: { x: Math.round(a.left + 1), y },
				end: { x: Math.round(b.right - 1), y },
				middle: { x: Math.round((a.left + b.right) / 2), y },
			};
		},
		first,
		last,
	);
	if (!points) throw new Error(`"${first}" or "${last}" is not in the table`);
	return points;
}

const cellEditorText = () =>
	browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		return view?.contentEl.querySelector('.cm-table-widget .cm-editor .cm-content')?.textContent ?? null;
	});

describe('Review Mode: annotating in a Live Preview table cell', () => {
	beforeEach(async () => {
		await resetVaultTo({ [TABLE_NOTE]: TABLE });
		await obsidianPage.openFile(TABLE_NOTE);
		await browser.executeObsidian(async ({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			if (!view) throw new Error('no markdown view');
			await view.setState({ ...view.getState(), mode: 'source', source: false }, { history: false });
			view.editor.focus();
			view.editor.setCursor({ line: 0, ch: 0 });
		});
		await browser.waitUntil(async () => (await cellPoints('failed', 'save').catch(() => null)) !== null, {
			timeoutMsg: 'no table widget',
		});
		await setReviewMode(true);
		await clearNotices();
	});
	afterEach(async () => {
		await setReviewMode(false);
		await clearNotices();
	});

	it('opens the comment box on a drag inside a cell and writes the Annotation into the note', async () => {
		const { start, end } = await cellPoints('failed', 'save');
		await pointerDrag(start, end);
		await saveComment('In a cell.', TABLE.replace('failed the save', '{failed the save}[^r1]') + '\n[^r1]: In a cell.\n');
		// Written in the note's editor, as one step of its history.
		await undo();
		expect(await editorText()).toBe(TABLE);
	});

	it('opens the comment box on a double-clicked word in a cell', async () => {
		const { middle } = await cellPoints('save', 'save');
		await doubleClick(middle);
		await saveComment('One word.', TABLE.replace('the save', 'the {save}[^r1]') + '\n[^r1]: One word.\n');
		// The cell editor stays open and shows the cell's text from the note.
		expect(await cellEditorText()).toBe('failed the {save}[^r1]');
	});
});
