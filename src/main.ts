// Wiring only. Format rules live in src/core, change application in src/apply.
import { Plugin } from 'obsidian';
import { provisionalField } from './apply/provisional';
import { registerAnnotateSelection } from './commands/annotate-selection';
import { closeActiveCommentBox } from './comment-box/comment-box';
import { livePreview, refreshLivePreviews } from './live-preview/live-preview';
import { livePreviewPopover } from './live-preview/popover';
import { CommentPopover } from './popover/popover';
import { registerReadingView, rerenderReadingViews } from './reading-view/reading-view';
import { displaySettings } from './settings-tab/display';
import { ReviewMarksSettingTab, SECTION_ORDER } from './settings-tab/settings-tab';
import { DEFAULT_SETTINGS, SettingsStore, settingsFrom, type ReviewMarksSettings } from './settings';

export default class ReviewMarksPlugin extends Plugin {
	store = new SettingsStore({ ...DEFAULT_SETTINGS }, (s) => this.saveData(s));
	/** Features add their controls with `settingsTab.addSection(SECTION_ORDER.x, render)`. */
	settingsTab!: ReviewMarksSettingTab;

	get settings(): ReviewMarksSettings {
		return this.store.current;
	}

	async onload(): Promise<void> {
		this.store.current = settingsFrom(await this.loadData());
		const settings = () => this.store.current;
		this.settingsTab = new ReviewMarksSettingTab(this.app, this, this.store);
		this.addSettingTab(this.settingsTab);
		const popover = new CommentPopover(this.app, this, settings);

		this.registerEditorExtension([provisionalField, livePreview(settings), livePreviewPopover(popover)]);
		registerAnnotateSelection(this, settings);
		registerReadingView(this, settings, popover);
		this.settingsTab.addSection(SECTION_ORDER.display, displaySettings);
		this.register(
			this.store.onChange(() => {
				refreshLivePreviews(this.app);
				rerenderReadingViews(this.app);
			}),
		);
		this.register(closeActiveCommentBox);
	}
}
