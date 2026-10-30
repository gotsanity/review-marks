// PROTOTYPE (throwaway). Review Marks B+ re-prototype of issue #6. Wiring only.
//   src/parse.ts           parser, block/section helpers, definition placement
//   src/settings.ts        settings, defaults, settings tab
//   src/ui.ts              popover, badge, comment modal
//   src/render-dom.ts      decorates rendered HTML (Reading view sections, Live Preview table cells)
//   src/render-live.ts     Live Preview
//   src/render-reading.ts  Reading view
//   src/commands.ts        commands, createAnnotation(), writeComment()
//   src/comment-box.ts     inline comment box (replaces the modal)
//   src/drag.ts            annotate-on-drag gesture; src/dom-map.ts maps rendered selections to source
// No tests, minimal error handling.
import { Plugin } from 'obsidian';
import { ReviewMarksSettingTab, loadSettings, onSettingsChange } from './settings';
import { hidePopover, initUi, popoverContains } from './ui';
import { livePreviewExtension, refreshLivePreview } from './render-live';
import { registerReading, rerenderPreviews } from './render-reading';
import { createAnnotation, registerCommands, writeComment } from './commands';
import { commentBoxExtension } from './comment-box';
import { registerDrag } from './drag';

export { createAnnotation, writeComment } from './commands';

export default class ReviewMarksPlugin extends Plugin {
  /** Also reachable as app.plugins.plugins['proto-review-marks'].api (handy from the console). */
  api = { createAnnotation, writeComment };

  async onload() {
    await loadSettings(this);
    initUi(this.app, this);
    this.registerEditorExtension(livePreviewExtension);
    registerReading(this);
    registerCommands(this);
    this.registerEditorExtension(commentBoxExtension);
    registerDrag(this);
    this.addSettingTab(new ReviewMarksSettingTab(this.app, this));
    onSettingsChange(() => { refreshLivePreview(this.app); rerenderPreviews(this); });
    this.registerDomEvent(document, 'click', (e) => {
      const t = e.target as HTMLElement;
      if (!popoverContains(t) && !t.closest?.('.rm-badge, .rm-target')) hidePopover(true);
    });
    this.register(() => hidePopover(true));
  }
}
