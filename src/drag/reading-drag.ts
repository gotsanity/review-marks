// Annotate on drag in Reading view. With the trigger held, a drag-select is ours: the range is
// drawn as a highlight, then mapped to source offsets (readingTarget) through the sections'
// `getSectionInfo`. If it can be annotated, the note switches to Live Preview with the Target at
// the same height on screen, and the Annotation is created there with its comment box open.
// A refused drag leaves Reading view as it was. Every fragile step is guarded (src/guards.ts);
// if one fails, a notice says to switch to Live Preview.
import { MarkdownView, type Plugin } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import { annotateRange } from '../commands/annotate-selection';
import { normalizeLineEndings } from '../core';
import { caretFromPoint, showDragRange, switchToLivePreview, type Caret } from '../guards';
import { notify } from '../notice';
import { renderedSections } from '../reading-view/reading-view';
import type { ReviewMarksSettings } from '../settings';
import { COMPAT_EVENTS, swallow } from './editor-drag';
import { readingTarget } from './reading-target';
import { triggerHeld } from './trigger';

const UNAVAILABLE = "annotate-on-drag isn't available in Reading view here. Switch to Live Preview to annotate.";

// Drags starting on these keep their own behaviour.
const NOT_OURS = '.rm-badge, .rm-cbox, .markdown-embed, .internal-embed';

/** A Range from `a` to `b`, whichever comes first in the document. */
function rangeBetween(doc: Document, a: Caret, b: Caret): Range {
	const range = doc.createRange();
	range.setStart(a.node, a.offset);
	range.setEnd(a.node, a.offset);
	const head = doc.createRange();
	head.setStart(b.node, b.offset);
	if (head.compareBoundaryPoints(Range.START_TO_START, range) < 0) range.setStart(b.node, b.offset);
	else range.setEnd(b.node, b.offset);
	return range;
}

const nextFrame = (win: Window) => new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));

/**
 * Scrolls the editor so the line of `pos` sits at screen height `top`. Line heights are estimates
 * until drawn, so it measures again for a few frames.
 */
async function keepAt(cm: EditorView, pos: number, top: number): Promise<void> {
	const win = cm.dom.ownerDocument.defaultView ?? window;
	for (let i = 0; i < 4; i++) {
		await nextFrame(win);
		const now = cm.coordsAtPos(pos, 1)?.top ?? cm.documentTop + cm.lineBlockAt(pos).top;
		if (Math.abs(now - top) > 1) cm.scrollDOM.scrollTop += now - top;
	}
}

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
	await keepAt(cm, target.from, top);
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
		if (!el || el.closest(NOT_OURS)) return;
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

	/** Follows the pointer until it is released, drawing the range from `anchor`. */
	const track = (view: MarkdownView, down: PointerEvent, anchor: Caret): void => {
		const doc = view.containerEl.ownerDocument;
		const win = doc.defaultView ?? window;
		active = true;
		win.getSelection()?.removeAllRanges();
		let range = rangeBetween(doc, anchor, anchor);

		const extend = (e: PointerEvent) => {
			const head = caretFromPoint(doc, e.clientX, e.clientY);
			if (!head) return;
			range = rangeBetween(doc, anchor, head);
			showDragRange(win, range);
		};
		const move = (e: PointerEvent) => {
			if (e.pointerId !== down.pointerId) return;
			swallow(e);
			extend(e);
		};
		const up = (e: PointerEvent) => {
			if (e.pointerId !== down.pointerId) return;
			swallow(e);
			if (e.type === 'pointerup') extend(e);
			finish(e.type === 'pointerup');
		};
		const escape = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			swallow(e);
			finish(false);
		};
		const finish = (create: boolean) => {
			win.removeEventListener('pointermove', move, true);
			win.removeEventListener('pointerup', up, true);
			win.removeEventListener('pointercancel', up, true);
			win.removeEventListener('keydown', escape, true);
			// The mouseup and click that follow the pointerup still belong to the gesture.
			win.setTimeout(() => {
				for (const type of COMPAT_EVENTS) win.removeEventListener(type, swallow, true);
				active = false;
			}, 0);
			showDragRange(win, null);
			if (create && !range.collapsed) void annotateFromReading(view, range, settings());
		};

		win.addEventListener('pointermove', move, true);
		win.addEventListener('pointerup', up, true);
		win.addEventListener('pointercancel', up, true);
		win.addEventListener('keydown', escape, true);
		for (const type of COMPAT_EVENTS) win.addEventListener(type, swallow, true);
	};

	plugin.registerDomEvent(document, 'pointerdown', onDown, { capture: true });
}
