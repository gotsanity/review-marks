// Wiring only. Format rules live in src/core, change application in src/apply.
import { Plugin } from 'obsidian';
import { provisionalField } from './apply/provisional';
import { registerAnnotateSelection } from './commands/annotate-selection';
import { closeActiveCommentBox } from './comment-box/comment-box';
import { livePreview } from './live-preview/live-preview';
import { DEFAULT_SETTINGS, settingsFrom, type ReviewMarksSettings } from './settings';

export default class ReviewMarksPlugin extends Plugin {
	settings: ReviewMarksSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		this.settings = settingsFrom(await this.loadData());
		const settings = () => this.settings;

		this.registerEditorExtension([provisionalField, livePreview(settings)]);
		registerAnnotateSelection(this, settings);
		this.register(closeActiveCommentBox);
	}
}
