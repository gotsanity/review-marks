// Review Mode in Live Preview and Source mode: the editor selects natively, and releasing the
// pointer over a selection starts an Annotation on it (see releaseDecision). A double-click opens
// the box at once, so a triple-click can't happen. Keyboard selections never count: only a pointer
// release is looked at. Table cell editors are left to the table cell handling.
import type { Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView } from '@codemirror/view';
import { annotateRange } from '../commands/annotate-selection';
import { isCommentBoxOpen } from '../comment-box/comment-box';
import { isTableCellEditor, keepsOwnDrag } from '../guards';
import { triggerHeld } from '../drag/trigger';
import { notify } from '../notice';
import type { ReviewMarksSettings } from '../settings';
import { releaseDecision, type Release } from './release';
import type { ReviewModeStore } from './store';

/** Where a pointerdown on `target` went down, seen from `view`. */
function whereDown(view: EditorView, target: EventTarget | null): Release['down'] {
	if (!(target instanceof Node) || !view.contentDOM.contains(target)) return 'elsewhere';
	const el = target.nodeType === Node.ELEMENT_NODE ? (target as Element) : target.parentElement;
	if (!el || el.closest('.cm-editor') !== view.dom) return 'elsewhere';
	return keepsOwnDrag(el) ? 'keeps-own' : 'content';
}

interface Down {
	where: Release['down'];
	/** A box open when the pointer went down: the press closes it, but the gesture is still ignored. */
	boxOpen: boolean;
}

class ReleaseHandler {
	private down: Down | null = null;
	private timer: number | null = null;

	constructor(
		private readonly view: EditorView,
		private readonly store: ReviewModeStore,
		private readonly settings: () => ReviewMarksSettings,
		private readonly isMac: boolean,
	) {
		const win = this.win;
		// Window capture runs before the comment box's own document listener closes it.
		win.addEventListener('pointerdown', this.onDown, true);
		win.addEventListener('pointerup', this.onUp, true);
	}

	private get win(): Window {
		return this.view.dom.ownerDocument.defaultView ?? window;
	}

	destroy(): void {
		const win = this.win;
		win.removeEventListener('pointerdown', this.onDown, true);
		win.removeEventListener('pointerup', this.onUp, true);
		if (this.timer !== null) win.clearTimeout(this.timer);
	}

	private readonly onDown = (e: PointerEvent): void => {
		// With the drag trigger held the gesture is annotate-on-drag's, which keeps working as before.
		const ours = e.button === 0 && !triggerHeld(e, this.settings().dragTrigger, this.isMac);
		this.down = ours ? { where: whereDown(this.view, e.target), boxOpen: isCommentBoxOpen() } : null;
	};

	private readonly onUp = (e: PointerEvent): void => {
		const down = this.down;
		this.down = null;
		if (!this.store.on || e.button !== 0 || e.pointerType === 'touch') return;
		if (!this.view.hasFocus || isTableCellEditor(this.view)) return;
		// Let CodeMirror finish its own selection handling first.
		this.timer = this.win.setTimeout(() => {
			this.timer = null;
			this.release(down);
		}, 0);
	};

	private release(down: Down | null): void {
		const { view } = this;
		if (!view.dom.isConnected || !this.store.on) return;
		const decision = releaseDecision({
			text: view.state.doc.toString(),
			ranges: view.state.selection.ranges,
			commentBoxOpen: (down?.boxOpen ?? false) || isCommentBoxOpen(),
			down: down?.where ?? null,
		});
		if ('refuse' in decision) notify(decision.refuse);
		else if ('start' in decision) annotateRange(view, decision.start.from, decision.start.to, this.settings());
	}
}

/** The editor extension. Register it on desktop only. `isMac` is `Platform.isMacOS`. */
export function editorRelease(store: ReviewModeStore, settings: () => ReviewMarksSettings, isMac: boolean): Extension {
	return ViewPlugin.define((view) => new ReleaseHandler(view, store, settings, isMac));
}
