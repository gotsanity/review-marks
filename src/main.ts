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
import { backspaceExtension } from './live-preview/backspace';
import { livePreview } from './live-preview/live-preview';
import { DEFAULT_SETTINGS, settingsFrom, type ReviewMarksSettings } from './settings';

export default class ReviewMarksPlugin extends Plugin {
	settings: ReviewMarksSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		this.settings = settingsFrom(await this.loadData());
		const settings = () => this.settings;

		this.registerEditorExtension([provisionalField, livePreview(settings)]);
		registerAnnotateSelection(this, settings);
		registerMoveComments(this);
		this.registerEditorExtension(editorDrag(settings, Platform.isMacOS));
		this.registerEditorExtension(backspaceExtension);
		registerRemoveAnnotation(this);
		registerNavigation(this);
		registerContextMenu(this, settings);
		this.register(closeActiveCommentBox);
	}
}
