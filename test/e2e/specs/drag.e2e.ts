import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { resetVaultTo } from '../harness.ts';

const NOTE = 'Drag me.md';
const TEXT = '# One\n\nKell fails the save and seizes in place.\n\n## Two\n\nMore text.\n';
const TARGET = 'the save';

type Point = { x: number; y: number };

/** Opens the note in Live Preview (or Source mode), the cursor at its start, and `target` on screen. */
async function open(text: string, target: string, source = false): Promise<void> {
	await resetVaultTo({ [NOTE]: text });
	await obsidianPage.openFile(NOTE);
	await browser.executeObsidian(
		async ({ app, obsidian }, target, source) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			if (!view) throw new Error('no markdown view');
			await view.setState({ ...view.getState(), mode: 'source', source }, { history: false });
			const editor = view.editor;
			const from = editor.getValue().indexOf(target);
			editor.focus();
			editor.setCursor({ line: 0, ch: 0 });
			editor.scrollIntoView({ from: editor.offsetToPos(from), to: editor.offsetToPos(from + target.length) }, true);
		},
		target,
		source,
	);
	await setTrigger('alt');
}

const setTrigger = (trigger: string) =>
	browser.executeObsidian(({ plugins }, trigger) => {
		(plugins.reviewMarks as unknown as { settings: { dragTrigger: string } }).settings.dragTrigger = trigger;
	}, trigger);

/** Screen points just inside the first and last characters of `target`. */
async function endsOf(target: string): Promise<{ start: Point; end: Point }> {
	const ends = await browser.executeObsidian(({ app, obsidian }, target) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		type Rect = { left: number; right: number; top: number; bottom: number };
		const cm = (view?.editor as unknown as { cm?: { coordsAtPos(pos: number, side: number): Rect | null } }).cm;
		const from = view?.editor.getValue().indexOf(target) ?? -1;
		const a = cm?.coordsAtPos(from, 1);
		const b = cm?.coordsAtPos(from + target.length, -1);
		if (!a || !b) return null;
		return {
			start: { x: Math.round(a.left + 2), y: Math.round((a.top + a.bottom) / 2) },
			end: { x: Math.round(b.left - 2), y: Math.round((b.top + b.bottom) / 2) },
		};
	}, target);
	if (!ends) throw new Error(`"${target}" is not on screen`);
	return ends;
}

/** Holds `key` and drags from `start` to `end` with real pointer events. Leaves the button down if `release` is false. */
async function drag(key: string, start: Point, end: Point, release = true): Promise<void> {
	const keys = browser.action('key').down(key);
	const pointer = browser.action('pointer').move(start).down().pause(50);
	for (let i = 1; i <= 4; i++) {
		pointer.move({ x: Math.round(start.x + ((end.x - start.x) * i) / 4), y: Math.round(start.y + ((end.y - start.y) * i) / 4) });
	}
	if (release) {
		pointer.up();
		// Ticks: move, down, pause, 4 moves, up. The key comes up one tick after the button.
		for (let i = 0; i < 7; i++) keys.pause(0);
		keys.up(key);
	}
	await browser.performActions([keys.toJSON(), pointer.toJSON()]);
	if (release) await browser.releaseActions();
}

const editorText = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue() ?? '');

const undo = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.undo());

const scrollTop = () =>
	browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		return view?.contentEl.querySelector('.cm-scroller')?.scrollTop ?? -1;
	});

const selections = () =>
	browser.executeObsidian(({ app }) =>
		(app.workspace.activeEditor?.editor?.listSelections() ?? []).map((s) => [s.anchor.ch, s.head.ch, s.anchor.line, s.head.line]),
	);

const selectedText = () => browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getSelection() ?? '');

const dragHighlight = () =>
	browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		return Array.from(view?.contentEl.querySelectorAll('.cm-content .rm-drag-sel') ?? [])
			.map((el) => el.textContent)
			.join('');
	});

describe('Annotate on drag', () => {
	beforeEach(() => open(TEXT, TARGET));

	it('draws the range as a highlight, not a selection, while Alt is held', async () => {
		const { start, end } = await endsOf(TARGET);
		const before = await selections();
		await drag(Key.Alt, start, end, false);
		try {
			expect(await dragHighlight()).toBe(TARGET);
			// No column selection, no extra cursors: the real selection hasn't moved.
			expect(await selections()).toEqual(before);
		} finally {
			await browser.releaseActions();
		}
	});

	it('creates the Annotation on release and saves the Comment as one undo step', async () => {
		const { start, end } = await endsOf(TARGET);
		await drag(Key.Alt, start, end);

		const input = $('.rm-cbox-input');
		await expect(input).toBeFocused();
		expect(await dragHighlight()).toBe('');
		expect(await editorText()).toContain('{the save}[^r1]');

		await input.setValue('Dragged.');
		await browser.keys('Enter');
		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(
			'# One\n\nKell fails {the save}[^r1] and seizes in place.\n\n[^r1]: Dragged.\n\n## Two\n\nMore text.\n',
		);

		await undo();
		expect(await editorText()).toBe(TEXT);
	});

	it('works the same when dragged right to left', async () => {
		const { start, end } = await endsOf(TARGET);
		await drag(Key.Alt, end, start);
		await expect($('.rm-cbox-input')).toBeFocused();
		expect(await editorText()).toContain('{the save}[^r1]');
	});

	it('leaves no trace when cancelled', async () => {
		const { start, end } = await endsOf(TARGET);
		await drag(Key.Alt, start, end);
		await expect($('.rm-cbox-input')).toBeFocused();
		await browser.keys('Escape');

		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(TEXT);
		await undo();
		expect(await editorText()).toBe(TEXT);
	});

	it('does nothing on a click without a drag', async () => {
		const { start } = await endsOf(TARGET);
		await drag(Key.Alt, start, start);
		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(TEXT);
	});

	it('uses the configured trigger and ignores other keys', async () => {
		await setTrigger('mod-shift');
		const { start, end } = await endsOf(TARGET);
		await drag(Key.Alt, start, end);
		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(TEXT);
	});

	it('changes nothing when the trigger is Off', async () => {
		await setTrigger('off');
		const { start, end } = await endsOf(TARGET);
		await drag(Key.Alt, start, end);
		await expect($('.rm-cbox')).not.toExist();
		expect(await dragHighlight()).toBe('');
		expect(await editorText()).toBe(TEXT);
		// The editor handled the drag itself: there is a real selection now.
		expect(await selectedText()).toBe(TARGET);
	});

	it('works in Source mode', async () => {
		await open(TEXT, TARGET, true);
		const { start, end } = await endsOf(TARGET);
		await drag(Key.Alt, start, end);
		await $('.rm-cbox-input').setValue('In source.');
		await browser.keys('Enter');
		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toContain('Kell fails {the save}[^r1] and');
	});
});

describe('Annotate on drag in a long note', () => {
	const filler = Array.from({ length: 60 }, (_, i) => `Paragraph ${i} of filler text.`);
	const LONG = ['# Long', '', ...filler.slice(0, 30).flatMap((p) => [p, '']), 'The middle target sits here.', '', ...filler.slice(30).flatMap((p) => [p, '']), '## End', ''].join('\n');

	it('does not scroll the note when creating, saving or cancelling', async () => {
		await open(LONG, 'middle target');
		await browser.waitUntil(async () => (await scrollTop()) > 0);
		const before = await scrollTop();

		let { start, end } = await endsOf('middle target');
		await drag(Key.Alt, start, end);
		await expect($('.rm-cbox-input')).toBeFocused();
		expect(Math.abs((await scrollTop()) - before)).toBeLessThanOrEqual(1);
		await browser.keys('Escape');
		await expect($('.rm-cbox')).not.toExist();
		expect(Math.abs((await scrollTop()) - before)).toBeLessThanOrEqual(1);

		({ start, end } = await endsOf('middle target'));
		await drag(Key.Alt, start, end);
		await $('.rm-cbox-input').setValue('Stay put.');
		await browser.keys('Enter');
		await expect($('.rm-cbox')).not.toExist();
		expect(Math.abs((await scrollTop()) - before)).toBeLessThanOrEqual(1);
		expect(await editorText()).toContain('{middle target}[^r1]');
	});
});

describe('Annotate on drag in a Live Preview table', () => {
	const TABLE = '# Table\n\nIntro line.\n\n| Name | Result |\n|---|---|\n| Doreth Kell | failed the save |\n\nAfter.\n';

	/** Screen points just inside the first character of `first` and the last of `last`, in the table widget. */
	const cellPoints = async (first: string, last: string) => {
		const points = await browser.executeObsidian(
			({ app, obsidian }, first, last) => {
				const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
				const root = view?.contentEl.querySelector('.cm-table-widget');
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
				if (!a || !b) return null;
				return {
					start: { x: Math.round(a.left + 1), y: Math.round((a.top + a.bottom) / 2) },
					end: { x: Math.round(b.right - 1), y: Math.round((b.top + b.bottom) / 2) },
				};
			},
			first,
			last,
		);
		if (!points) throw new Error(`"${first}" or "${last}" is not in the table`);
		return points;
	};

	const cellEditorOpen = () =>
		browser.executeObsidian(({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			return view?.contentEl.querySelector('.cm-table-widget .cm-editor') != null;
		});

	beforeEach(async () => {
		await open(TABLE, 'Intro');
		await browser.waitUntil(async () => (await cellPoints('failed', 'save').catch(() => null)) !== null, {
			timeoutMsg: 'no table widget',
		});
	});

	it('creates the Annotation inside the cell and opens the comment box, without opening a cell editor', async () => {
		const { start, end } = await cellPoints('failed', 'save');
		await drag(Key.Alt, start, end);

		const input = $('.rm-cbox-input');
		await expect(input).toBeFocused();
		expect(await cellEditorOpen()).toBe(false);
		expect(await editorText()).toContain('| Doreth Kell | {failed the save}[^r1] |');

		await input.setValue('In a cell.');
		await browser.keys('Enter');
		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toContain('[^r1]: In a cell.');
		await undo();
		expect(await editorText()).toBe(TABLE);
	});

	it('leaves no trace when cancelled', async () => {
		const { start, end } = await cellPoints('failed', 'save');
		await drag(Key.Alt, start, end);
		await expect($('.rm-cbox-input')).toBeFocused();
		await browser.keys('Escape');
		await expect($('.rm-cbox')).not.toExist();
		expect(await editorText()).toBe(TABLE);
	});

	it('refuses a drag across cells with a notice', async () => {
		const { start, end } = await cellPoints('Kell', 'failed');
		await drag(Key.Alt, start, end);
		await expect($('.notice*=an annotation must stay within one table cell.')).toExist();
		await expect($('.rm-cbox')).not.toExist();
		expect(await cellEditorOpen()).toBe(false);
		expect(await editorText()).toBe(TABLE);
	});
});
