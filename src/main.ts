// Wiring only. Format rules live in src/core, change application in src/apply.
import { Platform, Plugin } from 'obsidian';
import { provisionalField } from './apply/provisional';
import { registerAnnotateSelection } from './commands/annotate-selection';
import { registerContextMenu } from './commands/context-menu';
import { registerMoveComments } from './commands/move-comments';
import { registerNavigation } from './commands/navigate';
import { registerRemoveAnnotation } from './commands/remove-annotation';
import { closeActiveCommentBox } from './comment-box/comment-box';
import { editorDrag } from './drag/editor-drag';
import { exportSettings, registerExport } from './export/export';
import { addDragTriggerSetting } from './drag/setting';
import { backspaceExtension } from './live-preview/backspace';
import { livePreview, refreshLivePreviews } from './live-preview/live-preview';
import { livePreviewPopover } from './live-preview/popover';
import { tableCellDecorations } from './live-preview/table-cells';
import { addPlacementSetting } from './placement-setting';
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

		this.registerEditorExtension([
			provisionalField,
			livePreview(settings),
			tableCellDecorations(settings),
			livePreviewPopover(popover),
		]);
		registerAnnotateSelection(this, settings);
		registerReadingView(this, settings, popover);
		registerExport(this, settings);
		registerMoveComments(this);
		this.registerEditorExtension(editorDrag(settings, Platform.isMacOS));
		this.registerEditorExtension(backspaceExtension);
		registerRemoveAnnotation(this);
		registerNavigation(this);
		registerContextMenu(this, settings);

		this.settingsTab.addSection(SECTION_ORDER.placement, (el, store) => {
			addPlacementSetting(el, store.current.placement, (placement) => store.update({ placement }));
		});
		this.settingsTab.addSection(SECTION_ORDER.display, displaySettings);
		this.settingsTab.addSection(SECTION_ORDER.drag, (el, store) => {
			addDragTriggerSetting(el, store.current.dragTrigger, (dragTrigger) => store.update({ dragTrigger }));
		});
		this.settingsTab.addSection(SECTION_ORDER.export, exportSettings);
		this.register(
			this.store.onChange(() => {
				refreshLivePreviews(this.app);
				rerenderReadingViews(this.app);
			}),
		);
		this.register(closeActiveCommentBox);
	}
}
