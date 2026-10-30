import { browser, expect } from '@wdio/globals';
import { beforeEach, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { NOTES } from '../fixtures.ts';

const AUTHOR_NOTE = 'Author footnotes.md';
const AUTHOR_TEXT =
	'---\ntags: [review]\n---\n# Notes {draft}\n\n' +
	'Alpha {first target}[^r1] then author[^a] and {second **bold**}[^r2] then more[^b].\n\n' +
	'Code `{kept}` stays.\n\n' +
	'[^a]: Author one.\n[^r1]: Comment one.\n[^r2]: Comment {two}.\n[^b]: Author two.\n';

interface Exported {
	/** The text of every rendered block outside the footnote list. */
	body: string;
	/** The text of each footnote reference, in order. */
	refs: string[];
	/** The text of each item in the footnote list. */
	footnotes: string[];
}

/** Exports `path` to PDF as Obsidian does, up to the point the page would be printed. */
const exportPdf = async (path: string): Promise<Exported> =>
	await browser.executeObsidian(async ({ app, obsidian }, path) => {
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof obsidian.TFile)) throw new Error(`no file ${path}`);
		await app.workspace.getLeaf().openFile(file);
		// "Export to PDF" opens a modal; its private `testPrint` renders the page without the save dialog.
		const proto = obsidian.Modal.prototype as unknown as { open: () => void };
		const open = proto.open;
		let modal: unknown = null;
		proto.open = new Proxy(open, {
			apply(target, thisArg, args) {
				modal = thisArg;
				return Reflect.apply(target, thisArg, args) as unknown;
			},
		});
		try {
			(app as unknown as { commands: { executeCommandById(id: string): boolean } }).commands.executeCommandById(
				'workspace:export-pdf',
			);
		} finally {
			proto.open = open;
		}
		const pdf = modal as { testPrint(): Promise<void>; close(): void } | null;
		if (!pdf) throw new Error('no export modal');
		await pdf.testPrint();
		pdf.close();
		const print = document.body.querySelector('.print');
		const page = print?.querySelector<HTMLElement>('.markdown-preview-view');
		if (!print || !page) throw new Error('nothing printed');
		const out = {
			body: Array.from(page.querySelectorAll('h1, h2, h3, p, li, td, th'))
				.filter((el) => !el.closest('section.footnotes'))
				.map((el) => el.textContent ?? '')
				.join('\n'),
			refs: Array.from(page.querySelectorAll('sup.footnote-ref')).map((s) => s.textContent ?? ''),
			footnotes: Array.from(page.querySelectorAll('section.footnotes li')).map((li) => (li.textContent ?? '').replace('↩︎', '').trim()),
		};
		print.remove();
		return out;
	}, path);

/** Renders `path` the way Copy document as HTML does: `MarkdownRenderer.render` with the note's path. */
const copyAsHtml = async (path: string): Promise<Exported> =>
	await browser.executeObsidian(async ({ app, obsidian }, path) => {
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof obsidian.TFile)) throw new Error(`no file ${path}`);
		const wrapper = document.body.createDiv();
		const component = new obsidian.Component();
		component.load();
		try {
			await obsidian.MarkdownRenderer.render(app, await app.vault.read(file), wrapper, path, component);
			return {
				body: Array.from(wrapper.querySelectorAll('h1, h2, h3, p, li, td, th'))
					.filter((el) => !el.closest('section.footnotes'))
					.map((el) => el.textContent ?? '')
					.join('\n'),
				refs: Array.from(wrapper.querySelectorAll('sup.footnote-ref')).map((s) => s.textContent ?? ''),
				footnotes: Array.from(wrapper.querySelectorAll('section.footnotes li')).map((li) =>
					(li.textContent ?? '').replace('↩︎', '').trim(),
				),
			};
		} finally {
			component.unload();
			wrapper.remove();
		}
	}, path);

const setStrip = (stripFromExports: boolean) =>
	browser.executeObsidian(async ({ plugins }, stripFromExports) => {
		const plugin = plugins.reviewMarks as unknown as { store: { update(p: object): Promise<void> } };
		await plugin.store.update({ stripFromExports });
	}, stripFromExports);

const EXPORTS = { 'PDF export': exportPdf, 'Copy as HTML': copyAsHtml } as const;

describe('Export', () => {
	beforeEach(async () => {
		await obsidianPage.resetVault();
		await obsidianPage.write(AUTHOR_NOTE, AUTHOR_TEXT);
	});

	for (const [name, render] of Object.entries(EXPORTS)) {
		describe(name, () => {
			it('shows the sample note with no braces and its Comments as numbered footnotes', async () => {
				await setStrip(false);
				const out = await render(NOTES.endOfNote);
				expect(out.body).not.toMatch(/[{}]|\[\^r/);
				expect(out.body).toContain('Caly frenzies and Malek knocks her out.');
				expect(out.body).toContain('Malas Vance (the Peddler)');
				expect(out.refs).toEqual(Array.from({ length: 12 }, (_, i) => `[${i + 1}]`));
				expect(out.footnotes).toHaveLength(12);
			});

			it('strips the sample note to plain text with no Comments', async () => {
				await setStrip(true);
				const out = await render(NOTES.endOfNote);
				expect(out.body).not.toMatch(/[{}]|\[\^r/);
				expect(out.body).toContain('Caly frenzies and Malek knocks her out. Meanwhile');
				expect(out.refs).toEqual([]);
				expect(out.footnotes).toEqual([]);
			});

			it("numbers the author's footnotes among the Comments", async () => {
				await setStrip(false);
				const out = await render(AUTHOR_NOTE);
				expect(out.body).toContain('Notes {draft}');
				expect(out.body).toContain('Alpha first target[1] then author[2] and second bold[3] then more[4].');
				expect(out.body).toContain('Code {kept} stays.');
				expect(out.footnotes).toEqual(['Comment one.', 'Author one.', 'Comment {two}.', 'Author two.']);
			});

			it("renumbers the author's footnotes when stripping", async () => {
				await setStrip(true);
				const out = await render(AUTHOR_NOTE);
				expect(out.body).toContain('Alpha first target then author[1] and second bold then more[2].');
				expect(out.footnotes).toEqual(['Author one.', 'Author two.']);
			});
		});
	}
});
