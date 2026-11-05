// Review Mode in Reading view: the browser selects natively, and releasing the pointer over a
// selection starts an Annotation on it through the Reading view path it shares with
// annotate-on-drag (src/reading-annotate). The note switches to Live Preview with the Target at the
// same height on screen, and the comment box opens there. The selection counts only if the
// pointer went down in a Reading view's rendered note text, not on an embed, a badge or the
// comment box. A double-click opens the box at once.
import type { MarkdownView, Plugin } from 'obsidian';
import { normalizeLineEndings } from '../core';
import { onEveryWindow } from '../every-window';
import { keepsOwnDrag } from '../guards';
import { notify } from '../notice';
import { elementOf, isPrimaryPress } from '../pointer';
import { annotateInLivePreview, readingViewAt } from '../reading-annotate/reading-annotate';
import { renderedSections } from '../reading-view/reading-view';
import type { ReviewMarksSettings } from '../settings';
import { boxOpenSince, isReviewPress, pressAt, type Press } from './press';
import { releaseDecision } from './release';
import { readingSelectionRelease } from './reading-selection';
import type { ReviewModeStore } from './store';

/** Registers the release handling on every window. Desktop only. `isMac` is `Platform.isMacOS`. */
export function registerReadingRelease(plugin: Plugin, store: ReviewModeStore, settings: () => ReviewMarksSettings, isMac: boolean): void {
	const { workspace } = plugin.app;
	/** The press the next release is judged by, and the note it went down in. */
	let pending: { press: Press; view: MarkdownView | null } | null = null;

	const onDown = (e: PointerEvent): void => {
		pending = null;
		if (!store.on || !isReviewPress(e, settings().dragTrigger, isMac)) return;
		const el = elementOf(e.target);
		const view = el ? readingViewAt(workspace, el) : null;
		const where = !el || !view ? 'elsewhere' : keepsOwnDrag(el) ? 'keeps-own' : 'content';
		pending = { press: pressAt(where), view };
	};

	const onUp = (e: PointerEvent): void => {
		const down = pending;
		pending = null;
		if (!down?.view || !store.on || !isPrimaryPress(e)) return;
		const view = down.view;
		// Let the browser finish its own selection handling first.
		view.containerEl.win.setTimeout(() => void release(view, down.press), 0);
	};

	const release = async (view: MarkdownView, press: Press): Promise<void> => {
		if (!store.on || view.getMode() !== 'preview') return;
		const root = view.previewMode.containerEl;
		const selection = root.ownerDocument.getSelection();
		const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i)) : [];
		const text = normalizeLineEndings(view.getViewData());
		const decision = releaseDecision(
			readingSelectionRelease(text, renderedSections(root), ranges, press.where, boxOpenSince(press)),
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
