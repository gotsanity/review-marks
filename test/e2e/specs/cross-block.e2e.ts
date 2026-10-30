import { browser, expect } from '@wdio/globals';
import { beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { NOTES } from '../fixtures.ts';
import { resetVaultTo } from '../harness.ts';

/** One rendered block (a Live Preview line, or a Reading view element) holding part of a Target. */
interface Part {
	/** The block's kind: `li`, `h3`, … in Reading view; `list`, `header` or `line` in Live Preview. */
	block: string;
	/** The highlighted text in the block, bold markers dropped. */
	target: string;
	/** Whether a list bullet sits inside the highlight. */
	bulletHighlighted: boolean;
}

/**
 * Opens `note` in Live Preview, scrolls to the Target `id`, and lists its highlighted parts once
 * `ready` holds. Line classes such as list lines arrive when the editor's parser catches up.
 */
const livePreviewParts = async (
	note: string,
	id: string,
	ready = (parts: Part[]) => parts.length > 0,
): Promise<Part[]> => {
	await obsidianPage.openFile(note);
	let parts: Part[] = [];
	await browser.waitUntil(async () => {
		parts = await browser.executeObsidian(
			async ({ app, obsidian }, id) => {
				const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
				if (!view) return [];
				const state = view.getState();
				if (state.mode !== 'source' || state.source !== false) {
					await view.setState({ ...state, mode: 'source', source: false }, { history: false });
				}
				const editor = view.editor;
				// The cursor stays at the top, away from the Target, so its syntax is hidden.
				editor.setCursor({ line: 0, ch: 0 });
				const at = editor.offsetToPos(editor.getValue().indexOf(`}[^${id}]`));
				editor.scrollIntoView({ from: at, to: at }, true);
				await new Promise((r) => window.setTimeout(r, 200));
				const marks = Array.from(view.contentEl.querySelectorAll(`.cm-content .rm-target[data-rm-id="${id}"]`));
				const lines = [...new Set(marks.map((m) => m.closest('.cm-line')))].filter((l): l is Element => l !== null);
				return lines.map((line) => ({
					block: /HyperMD-list-line/.test(line.className) ? 'list' : /HyperMD-header/.test(line.className) ? 'header' : 'line',
					target: marks
						.filter((m) => line.contains(m))
						.map((m) => m.textContent ?? '')
						.join('')
						.replace(/\*\*/g, ''),
					bulletHighlighted: !!line.querySelector('.rm-target .cm-formatting-list, .rm-target .list-bullet'),
				}));
			},
			id,
		);
		return ready(parts);
	});
	return parts;
};

/** Opens `note` in Reading view, scrolls to the Target `id`, and lists its highlighted parts. */
const readingParts = async (note: string, id: string): Promise<Part[]> => {
	await obsidianPage.openFile(note);
	let parts: Part[] = [];
	await browser.waitUntil(async () => {
		parts = await browser.executeObsidian(
			async ({ app, obsidian }, id) => {
				const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
				if (!view) return [];
				const state = view.getState();
				if (state.mode !== 'preview') await view.setState({ ...state, mode: 'preview' }, { history: false });
				const container = view.previewMode.containerEl;
				const marks = () => Array.from(container.querySelectorAll(`.rm-target[data-rm-id="${id}"]`));
				if (marks().length === 0) {
					// Reading view renders only the sections near the viewport.
					const text = await app.vault.cachedRead(view.file!);
					const line = text.slice(0, text.indexOf(`}[^${id}]`)).split('\n').length - 1;
					view.previewMode.applyScroll(Math.max(0, line - 2));
					await new Promise((r) => window.setTimeout(r, 200));
				}
				const found = marks();
				const blocks = [...new Set(found.map((m) => m.closest('li, p, h1, h2, h3, h4, h5, h6')))].filter(
					(b): b is Element => b !== null,
				);
				return blocks.map((b) => ({
					block: b.tagName.toLowerCase(),
					target: found
						.filter((m) => b.contains(m))
						.map((m) => m.textContent ?? '')
						.join(''),
					bulletHighlighted: !!b.querySelector('.rm-target .list-bullet'),
				}));
			},
			id,
		);
		return parts.length > 0;
	});
	return parts;
};

const R11 = [
	'Burnside left with six carts of worked ghost iron and did not come back.',
	'The two people who escaped the mine',
];

describe('Targets across blocks and in headings', () => {
	beforeEach(async () => {
		await obsidianPage.resetVault();
	});

	describe('a Target across paragraphs and a heading', () => {
		const NOTE = 'Across.md';
		const TEXT = 'Alpha {first para.\n\n## Middle\n\nGamma}[^r1] delta.\n\n[^r1]: Spans three blocks.\n';
		beforeEach(async () => {
			await resetVaultTo({ [NOTE]: TEXT });
		});

		it('highlights each block in Live Preview', async () => {
			expect(await livePreviewParts(NOTE, 'r1', (p) => p.some((x) => x.block === 'header'))).toEqual([
				{ block: 'line', target: 'first para.', bulletHighlighted: false },
				{ block: 'header', target: 'Middle', bulletHighlighted: false },
				{ block: 'line', target: 'Gamma', bulletHighlighted: false },
			]);
		});

		it("highlights each rendered section's part in Reading view", async () => {
			expect(await readingParts(NOTE, 'r1')).toEqual([
				{ block: 'p', target: 'first para.', bulletHighlighted: false },
				{ block: 'h2', target: 'Middle', bulletHighlighted: false },
				{ block: 'p', target: 'Gamma', bulletHighlighted: false },
			]);
		});
	});

	for (const note of Object.values(NOTES)) {
		describe(note, () => {
			it('highlights r11 across two list items in Live Preview, line by line, bullets left out', async () => {
				const parts = await livePreviewParts(note, 'r11', (p) => p.length === 2 && p.every((x) => x.block === 'list'));
				expect(parts).toEqual(R11.map((target) => ({ block: 'list', target, bulletHighlighted: false })));
			});

			it('highlights r12 in a heading in Live Preview', async () => {
				expect(await livePreviewParts(note, 'r12')).toEqual([
					{ block: 'header', target: 'Call of the Void', bulletHighlighted: false },
				]);
			});

			it('highlights r11 across two list items in Reading view, bullets left out', async () => {
				const parts = await readingParts(note, 'r11');
				expect(parts).toEqual(R11.map((target) => ({ block: 'li', target, bulletHighlighted: false })));
			});

			it('highlights r12 in a heading in Reading view', async () => {
				expect(await readingParts(note, 'r12')).toEqual([
					{ block: 'h3', target: 'Call of the Void', bulletHighlighted: false },
				]);
			});
		});
	}
});
