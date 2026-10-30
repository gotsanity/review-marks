// Exports: PDF export and `MarkdownRenderer.render` (Copy as HTML) render the note once, with no
// section info, so Reading view's post processor leaves them alone. This one cleans them, and
// strips Annotations when the setting is on.
import { Setting, TFile, type Plugin } from 'obsidian';
import { normalizeLineEndings, parse } from '../core';
import { isExportRender } from '../guards';
import { cleanExport } from '../rendered/export';
import type { ReviewMarksSettings } from '../settings';
import type { SettingsSection } from '../settings-tab/settings-tab';

export function registerExport(plugin: Plugin, settings: () => ReviewMarksSettings): void {
	const { vault } = plugin.app;
	plugin.registerMarkdownPostProcessor(async (el, ctx) => {
		if (!isExportRender(el, ctx)) return;
		const file = vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;
		const doc = parse(normalizeLineEndings(await vault.cachedRead(file)));
		if (doc.annotations.length > 0) cleanExport(el, doc, settings().stripFromExports);
	});
}

export const exportSettings: SettingsSection = (containerEl, store) => {
	new Setting(containerEl)
		.setName('Strip annotations from exports')
		.setDesc(
			'PDF export and copy as HTML show annotated text as plain text, without comments. When off, comments appear as numbered footnotes.',
		)
		.addToggle((toggle) =>
			toggle.setValue(store.current.stripFromExports).onChange((value) => store.update({ stripFromExports: value })),
		);
};
