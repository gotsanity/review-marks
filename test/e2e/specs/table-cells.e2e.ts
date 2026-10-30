import { browser, expect } from '@wdio/globals';
import { beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { NOTES } from '../fixtures';

/** Opens `note` in Live Preview. */
async function openInLivePreview(note: string): Promise<void> {
	await obsidianPage.openFile(note);
	await browser.executeObsidian(async ({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		if (!view) throw new Error('no markdown view');
		const state = view.getState();
		if (state.mode !== 'source' || state.source !== false) {
			await view.setState({ ...state, mode: 'source', source: false }, { history: false });
		}
	});
}

/** A table cell: its unique source text (to scroll to), a text in its row and a text in the cell. */
type CellKey = readonly [source: string, row: string, cell: string];

interface CellView {
	/** Text outside `.rm-hidden` and badges. */
	visible: string;
	targets: string[];
	badges: string[];
	/** The text of a cell editor open in this cell, if any. */
	editor: string | null;
}

/** Scrolls to a table cell and describes it, or null if it isn't rendered yet. */
async function cell([source, rowKey, cellKey]: CellKey): Promise<CellView | null> {
	return browser.executeObsidian(
		({ app, obsidian }, source, rowKey, cellKey) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			const editor = view?.editor;
			if (!view || !editor) return null;
			const pos = editor.offsetToPos(editor.getValue().indexOf(source));
			editor.scrollIntoView({ from: pos, to: pos }, true);
			const tr = Array.from(view.contentEl.querySelectorAll('.cm-table-widget tr')).find((r) =>
				r.textContent?.includes(rowKey),
			);
			const td = Array.from(tr?.children ?? []).find((t) => t.textContent?.includes(cellKey));
			if (!td) return null;
			const wrapper = Array.from(td.querySelectorAll('.table-cell-wrapper')).find((w) => !w.querySelector('.cm-editor'));
			const cm = td.querySelector('.cm-editor .cm-content');
			let visible = '';
			const walk = (n: Node) => {
				if (n.nodeType === Node.ELEMENT_NODE && (n as Element).matches('.rm-hidden, .rm-badge')) return;
				if (n.nodeType === Node.TEXT_NODE) visible += n.textContent ?? '';
				n.childNodes.forEach(walk);
			};
			if (wrapper) walk(wrapper);
			return {
				visible,
				targets: Array.from(wrapper?.querySelectorAll('.rm-target') ?? []).map((t) => t.textContent ?? ''),
				badges: Array.from(wrapper?.querySelectorAll('.rm-badge') ?? []).map((t) => t.textContent ?? ''),
				editor: cm ? (cm.textContent ?? '') : null,
			};
		},
		source,
		rowKey,
		cellKey,
	);
}

/** Waits until `check` passes for a cell, and returns the cell. */
async function waitForCell(key: CellKey, check: (c: CellView) => boolean, timeoutMsg: string): Promise<CellView> {
	let last: CellView | null = null;
	await browser.waitUntil(
		async () => {
			last = await cell(key);
			return last !== null && check(last);
		},
		{ timeout: 5000, timeoutMsg },
	);
	return last as unknown as CellView;
}

/** Clicks the middle of a cell. */
async function clickCell([, rowKey, cellKey]: CellKey): Promise<void> {
	const point = await browser.executeObsidian(
		({ app, obsidian }, rowKey, cellKey) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			const tr = Array.from(view?.contentEl.querySelectorAll('.cm-table-widget tr') ?? []).find((r) =>
				r.textContent?.includes(rowKey),
			);
			const td = Array.from(tr?.children ?? []).find((t) => t.textContent?.includes(cellKey));
			if (!td) return null;
			td.scrollIntoView({ block: 'center' });
			const r = td.getBoundingClientRect();
			return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
		},
		rowKey,
		cellKey,
	);
	if (!point) throw new Error(`no cell "${cellKey}" in row "${rowKey}"`);
	await browser.action('pointer').move(point).down().up().perform();
}

/** Clicks a paragraph on screen, outside any table. */
async function clickParagraphOutsideTables(): Promise<void> {
	const point = await browser.executeObsidian(({ app, obsidian }) => {
		const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
		const lines = Array.from(view?.contentEl.querySelectorAll('.cm-content > .cm-line') ?? []);
		const line = lines.find((l) => {
			const r = l.getBoundingClientRect();
			return r.top > 80 && r.bottom < window.innerHeight - 80 && (l.textContent?.length ?? 0) > 20;
		});
		const r = line?.getBoundingClientRect();
		return r ? { x: Math.round(r.left + 10), y: Math.round(r.top + r.height / 2) } : null;
	});
	if (!point) throw new Error('no paragraph on screen');
	await browser.action('pointer').move(point).down().up().perform();
}

const R8: CellKey = ['{[[malas-vance\\|Malas Vance]] (the Peddler)}[^r8]', 'Duke of Entropy', 'the Peddler'];
const R9: CellKey = ['{17 (fail)}[^r9]', 'Wisdom save', '17 (fail)'];

describe('Annotations in Live Preview table cells', () => {
	beforeEach(async () => {
		await obsidianPage.resetVault();
		await openInLivePreview(NOTES.endOfNote);
	});

	it('highlights a cell Target with a wikilink and shows its badge (r8)', async () => {
		const c = await waitForCell(R8, (c) => c.badges.length > 0, 'r8 not decorated');
		expect(c.visible).toBe('Malas Vance (the Peddler)');
		expect(c.targets.join('')).toBe('Malas Vance (the Peddler)');
		expect(c.badges).toEqual(['Use "Vance" consistently; drop "…']);
	});

	it('shows the raw syntax in a clicked cell and restores the highlight after (r9)', async () => {
		const decorated = await waitForCell(R9, (c) => c.badges.length > 0, 'r9 not decorated');
		expect(decorated.visible).toBe('17 (fail)');
		expect(decorated.targets).toEqual(['17 (fail)']);
		expect(decorated.badges).toEqual(['Was this a fail? DC was 18 per t…']);

		await clickCell(R9);
		const editing = await waitForCell(R9, (c) => c.editor !== null, 'no cell editor opened');
		expect(editing.editor).toBe('{17 (fail)}[^r9]');

		await clickParagraphOutsideTables();
		const restored = await waitForCell(R9, (c) => c.editor === null && c.badges.length > 0, 'r9 not restored');
		expect(restored.visible).toBe('17 (fail)');
		expect(restored.badges).toEqual(['Was this a fail? DC was 18 per t…']);
	});

	it('refuses a Target that crosses table cells, with a notice', async () => {
		const noteText = () =>
			browser.executeObsidian(
				({ app, obsidian }) => app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.editor.getValue() ?? '',
			);
		const before = await noteText();
		// Opening a cell editor in an earlier test can make Obsidian pad the table's columns.
		const selected = await browser.executeObsidian(({ app, obsidian }) => {
			const editor = app.workspace.getActiveViewOfType(obsidian.MarkdownView)?.editor;
			const m = editor && /Doreth Kell *\| *Wisdom/.exec(editor.getValue());
			if (!editor || !m) return false;
			editor.focus();
			editor.setSelection(editor.offsetToPos(m.index), editor.offsetToPos(m.index + m[0].length));
			return true;
		});
		expect(selected).toBe(true);
		await browser.executeObsidianCommand('review-marks:annotate-selection');
		await expect(browser.$('.notice*=an annotation must stay within one table cell.')).toExist();
		await expect(browser.$('.rm-cbox')).not.toExist();
		expect(await noteText()).toBe(before);
	});
});

describe('Live Preview tables the guard does not recognise', () => {
	const NOTE = 'Ragged table.md';
	// The last row has one cell more than the header. Obsidian drops it, so the widget no longer
	// matches the source and the table is left as Obsidian renders it.
	const TEXT =
		'# Ragged\n\nThe {save}[^r1] stands.\n\n| A | B |\n|---|---|\n| {x}[^r2] | y | extra |\n\n[^r1]: One.\n[^r2]: Two.\n';

	it('leaves the table undecorated and everything else working', async () => {
		await obsidianPage.resetVault({ [NOTE]: TEXT });
		await openInLivePreview(NOTE);
		const widgetShown = () =>
			browser.executeObsidian(({ app, obsidian }) => {
				const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
				return (view?.contentEl.querySelectorAll('.cm-table-widget td').length ?? 0) > 0;
			});
		await browser.waitUntil(widgetShown, { timeoutMsg: 'no table widget' });
		// Move the cursor so the decorator has had passes to run.
		await browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.setCursor({ line: 0, ch: 1 }));
		await browser.pause(300);
		const seen = await browser.executeObsidian(({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			const widget = view?.contentEl.querySelector('.cm-table-widget');
			return {
				firstCell: widget?.querySelector('tbody td')?.textContent ?? null,
				decorated: widget?.querySelector('.rm-target, .rm-badge, .rm-hidden') != null,
				body: Array.from(view?.contentEl.querySelectorAll('.cm-content > .cm-line .rm-badge') ?? []).map(
					(b) => b.textContent,
				),
			};
		});
		expect(seen.decorated).toBe(false);
		expect(seen.firstCell).toBe('{x}r2');
		expect(seen.body).toEqual(['One.']);
	});
});
