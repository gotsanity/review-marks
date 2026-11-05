// Annotate on drag in Reading view. With the trigger held, a drag-select is ours: the range is
// drawn as a highlight, then mapped to source offsets (readingTarget) through the sections'
// `getSectionInfo`. If it can be annotated, the note switches to Live Preview with the Target at
// the same height on screen, and the Annotation is created there with its comment box open.
// A refused drag leaves Reading view as it was. Every fragile step is guarded (src/guards.ts);
// if one fails, a notice says to switch to Live Preview.
import type { MarkdownView, Plugin } from 'obsidian';
import { normalizeLineEndings } from '../core';
import { onEveryWindow } from '../every-window';
import { caretFromPoint, keepsOwnDrag, showDragRange, type Caret } from '../guards';
import { notify } from '../notice';
import { elementOf, isPrimaryPress } from '../pointer';
import { annotateInLivePreview, readingViewAt } from '../reading-annotate/reading-annotate';
import { READING_UNAVAILABLE } from '../reading-annotate/reading-range';
import { renderedSections } from '../reading-view/reading-view';
import type { ReviewMarksSettings } from '../settings';
import { rangeBetween, swallow, trackPointer } from './track';
import { readingTarget } from './reading-target';
import { triggerHeld } from './trigger';

/** Annotates the drag `range` over the Reading view of `view`. */
async function annotateFromReading(view: MarkdownView, range: Range, settings: ReviewMarksSettings): Promise<void> {
	const text = normalizeLineEndings(view.getViewData());
	const sections = renderedSections(view.previewMode.containerEl);
	if (sections.length === 0) {
		notify(READING_UNAVAILABLE);
		return;
	}
	const target = readingTarget(text, sections, range);
	if ('message' in target) {
		notify(target.message);
		return;
	}
	await annotateInLivePreview(view, text, target, range, settings);
}

/** Registers the gesture on every window. `isMac` is `Platform.isMacOS`. */
export function registerReadingDrag(plugin: Plugin, settings: () => ReviewMarksSettings, isMac: boolean): void {
	const { workspace } = plugin.app;
	let active = false;

	const onDown = (e: PointerEvent): void => {
		if (active || !isPrimaryPress(e)) return;
		if (!triggerHeld(e, settings().dragTrigger, isMac)) return;
		const el = elementOf(e.target);
		if (!el || keepsOwnDrag(el)) return;
		const view = readingViewAt(workspace, el);
		if (!view) return;

		const doc = el.ownerDocument;
		const anchor = caretFromPoint(doc, e.clientX, e.clientY);
		if (anchor === undefined) {
			swallow(e);
			notify(READING_UNAVAILABLE);
			return;
		}
		if (!anchor) return;
		swallow(e);
		track(view, e, anchor);
	};

	/** Follows the pointer until it is released, drawing the range from `anchor` as a highlight. */
	const track = (view: MarkdownView, down: PointerEvent, anchor: Caret): void => {
		const doc = view.containerEl.ownerDocument;
		const win = doc.defaultView ?? window;
		active = true;
		win.getSelection()?.removeAllRanges();
		let range = rangeBetween(doc, anchor, anchor);
		trackPointer(win, down, {
			move: (e) => {
				const head = caretFromPoint(doc, e.clientX, e.clientY);
				if (!head) return;
				range = rangeBetween(doc, anchor, head);
				showDragRange(win, range);
			},
			finish: (create) => {
				showDragRange(win, null);
				if (create && !range.collapsed) void annotateFromReading(view, range, settings());
			},
			settled: () => (active = false),
		});
	};

	onEveryWindow(plugin, (win) => plugin.registerDomEvent(win.document, 'pointerdown', onDown, { capture: true }));
}
