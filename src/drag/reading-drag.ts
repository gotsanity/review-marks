// Annotate on drag in Reading view. With the trigger held, a drag-select is ours: the range is
// drawn as a highlight, then mapped to source offsets (readingTarget) through the sections'
// `getSectionInfo`. If it can be annotated, the note switches to Live Preview with the Target at
// the same height on screen, and the Annotation is created there with its comment box open.
// A refused drag leaves Reading view as it was. Every fragile step is guarded (src/guards.ts);
// if one fails, a notice says to switch to Live Preview.
import { MarkdownView, type Plugin } from 'obsidian';
import { annotateRange } from '../commands/annotate-selection';
import { normalizeLineEndings } from '../core';
import { caretFromPoint, keepsOwnDrag, scrollToAnnotation, showDragRange, switchToLivePreview, type Caret } from '../guards';
import { notify } from '../notice';
import { renderedSections } from '../reading-view/reading-view';
import type { ReviewMarksSettings } from '../settings';
import { rangeBetween, swallow, trackPointer } from './track';
import { readingTarget } from './reading-target';
import { triggerHeld } from './trigger';

const UNAVAILABLE = "annotate-on-drag isn't available in Reading view here. Switch to Live Preview to annotate.";

/** Annotates the drag `range` over the Reading view of `view`. */
async function annotateFromReading(view: MarkdownView, range: Range, settings: ReviewMarksSettings): Promise<void> {
	const text = normalizeLineEndings(view.getViewData());
	const sections = renderedSections(view.previewMode.containerEl);
	if (sections.length === 0) {
		notify(UNAVAILABLE);
		return;
	}
	const target = readingTarget(text, sections, range);
	if ('message' in target) {
		notify(target.message);
		return;
	}
	const top = range.getClientRects()[0]?.top ?? range.getBoundingClientRect().top;
	const cm = await switchToLivePreview(view);
	if (!cm || cm.state.doc.toString() !== text) {
		notify(UNAVAILABLE);
		return;
	}
	await scrollToAnnotation(view, target.from, { top });
	annotateRange(cm, target.from, target.to, settings);
}

/** Registers the gesture on the main window. `isMac` is `Platform.isMacOS`. */
export function registerReadingDrag(plugin: Plugin, settings: () => ReviewMarksSettings, isMac: boolean): void {
	const { workspace } = plugin.app;
	let active = false;

	const readingViewAt = (el: Element): MarkdownView | null => {
		let found: MarkdownView | null = null;
		workspace.iterateAllLeaves((leaf) => {
			const v = leaf.view;
			if (!found && v instanceof MarkdownView && v.getMode() === 'preview' && v.previewMode.containerEl.contains(el)) found = v;
		});
		return found;
	};

	const onDown = (e: PointerEvent): void => {
		if (active || e.button !== 0 || e.pointerType === 'touch') return;
		if (!triggerHeld(e, settings().dragTrigger, isMac)) return;
		const target = e.target as Node | null;
		const el = target?.nodeType === Node.ELEMENT_NODE ? (target as Element) : target?.parentElement;
		if (!el || keepsOwnDrag(el)) return;
		const view = readingViewAt(el);
		if (!view) return;

		const doc = el.ownerDocument;
		const anchor = caretFromPoint(doc, e.clientX, e.clientY);
		if (anchor === undefined) {
			swallow(e);
			notify(UNAVAILABLE);
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

	plugin.registerDomEvent(document, 'pointerdown', onDown, { capture: true });
}
