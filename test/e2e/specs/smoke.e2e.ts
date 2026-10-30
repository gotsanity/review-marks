import { browser, expect } from '@wdio/globals';
import { describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { NOTES } from '../fixtures.ts';

describe('plugin smoke test', () => {
	it('loads the plugin', async () => {
		const loaded = await browser.executeObsidian(
			({ plugins }) => plugins.reviewMarks !== undefined,
		);
		expect(loaded).toBe(true);
	});

	for (const note of Object.values(NOTES)) {
		it(`opens the fixture "${note}" in the editor`, async () => {
			await obsidianPage.openFile(note);
			const openPath = await browser.executeObsidian(
				({ app }) => app.workspace.getActiveFile()?.path,
			);
			expect(openPath).toBe(note);
		});
	}
});
