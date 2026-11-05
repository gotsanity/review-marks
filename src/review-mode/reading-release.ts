// Review Mode in Reading view: the browser selects natively, and releasing the pointer over a
// selection starts an Annotation on it through annotate-on-drag's Reading view path. The note
// switches to Live Preview with the Target at the same height on screen, and the comment box
// opens there. The selection counts only if the pointer went down in a Reading view's rendered
// note, not on an embed, a badge or the comment box. A double-click opens the box at once.
import type { MarkdownView, Plugin } from 'obsidian';
import { isCommentBoxOpen } from '../comment-box/comment-box';
import { normalizeLineEndings } from '../core';
import { annotateInLivePreview, readingViewAt } from '../drag/reading-drag';
import { triggerHeld } from '../drag/trigger';
import { keepsOwnDrag } from '../guards';
import { notify } from '../notice';
import { onEveryWindow } from '../every-window';
import { renderedSections } from '../reading-view/reading-view';
import type { ReviewMarksSettings } from '../settings';
import { releaseDecision, type Release } from './release';
import { readingRelease } from './reading-selection';
import type { ReviewModeStore } from './store';

interface Down {
	where: Release['down'];
	view: MarkdownView | null;
	/** A box open when the pointer went down: the press closes it, but the gesture is still ignored. */
	boxOpen: boolean;
}

/** Registers the release handling on every window. Desktop only. `isMac` is `Platform.isMacOS`. */
export function registerReadingRelease(plugin: Plugin, store: ReviewModeStore, settings: () => ReviewMarksSettings, isMac: boolean): void {
	const { workspace } = plugin.app;
	let down: Down | null = null;

	const onDown = (e: PointerEvent): void => {
		down = null;
		// With the drag trigger held the gesture is annotate-on-drag's, which keeps working as before.
		if (!store.on || e.button !== 0 || triggerHeld(e, settings().dragTrigger, isMac)) return;
		const target = e.target as Node | null;
		const el = target?.nodeType === Node.ELEMENT_NODE ? (target as Element) : target?.parentElement;
		const view = el ? readingViewAt(workspace, el) : null;
		const where = !el || !view ? 'elsewhere' : keepsOwnDrag(el) ? 'keeps-own' : 'content';
		down = { where, view, boxOpen: isCommentBoxOpen() };
	};

	const onUp = (e: PointerEvent): void => {
		const was = down;
		down = null;
		if (!was?.view || !store.on || e.button !== 0 || e.pointerType === 'touch') return;
		const view = was.view;
		// Let the browser finish its own selection handling first.
		view.containerEl.win.setTimeout(() => void release(view, was), 0);
	};

	const release = async (view: MarkdownView, was: Down): Promise<void> => {
		if (!store.on || view.getMode() !== 'preview') return;
		const root = view.previewMode.containerEl;
		const selection = root.ownerDocument.getSelection();
		const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i)) : [];
		const text = normalizeLineEndings(view.getViewData());
		const decision = releaseDecision(
			readingRelease(text, renderedSections(root), ranges, was.where, was.boxOpen || isCommentBoxOpen()),
		);
		if ('refuse' in decision) notify(decision.refuse);
		if (!('start' in decision)) return;
		const range = (ranges[0] as Range).cloneRange();
		selection?.removeAllRanges();
		await annotateInLivePreview(view, text, decision.start, range, settings());
	};

	onEveryWindow(plugin, (win) => {
		plugin.registerDomEvent(win, 'pointerdown', onDown, { capture: true });
		plugin.registerDomEvent(win, 'pointerup', onUp, { capture: true });
	});
}
