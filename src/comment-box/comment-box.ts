// The inline comment box: a small floating textarea anchored under a Target. It knows nothing
// about notes: callers decide what saving and cancelling do.
// Desktop: Enter saves, Shift+Enter adds a line. Mobile: Enter adds a line, only Save saves.
// Esc and Cancel cancel. Clicking away saves if there is text and cancels if not; for an emptied
// existing Comment it also says, as Enter does, that a Comment cannot be empty.
import { Platform } from 'obsidian';
import type { EditorView } from '@codemirror/view';

export interface CommentBoxOptions {
	view: EditorView;
	/** The Annotation's ID: shown in the header and used to find the Target to sit under. */
	id: string;
	initial: string;
	/** Called with the typed Comment, never empty. */
	onSave: (comment: string) => void;
	/** Called on Esc, Cancel, or when the box closes with nothing typed. */
	onCancel: () => void;
	/**
	 * If set, saving with nothing typed (Enter or Save) calls this and keeps the box open, instead
	 * of cancelling. For an existing Comment, which must not be saved empty.
	 */
	onEmptySave?: () => void;
}

type Close = 'save' | 'cancel' | 'away';

let active: CommentBox | null = null;

/** Opens the box, first closing any open one as if clicked away from. */
export function openCommentBox(options: CommentBoxOptions): CommentBox {
	active?.close('away');
	active = new CommentBox(options);
	return active;
}

/** Closes the open box as if clicked away from: saves if there is text. */
export function closeActiveCommentBox(): void {
	active?.close('away');
}

export class CommentBox {
	private readonly el: HTMLElement;
	private readonly input: HTMLTextAreaElement;
	private readonly cleanup: (() => void)[] = [];
	private closed = false;

	constructor(private readonly options: CommentBoxOptions) {
		const { view, id, initial } = options;
		const doc = view.dom.ownerDocument;
		const win = doc.defaultView ?? window;

		this.el = doc.body.createDiv({ cls: Platform.isMobile ? 'rm-cbox is-mobile' : 'rm-cbox' });
		this.el.createDiv({ cls: 'rm-cbox-head', text: `Comment [^${id}]` });
		this.input = this.el.createEl('textarea', {
			cls: 'rm-cbox-input',
			attr: { rows: '1', placeholder: 'Write a comment…', 'aria-label': 'Comment' },
		});
		this.input.value = initial;
		const foot = this.el.createDiv({ cls: 'rm-cbox-foot' });
		foot.createSpan({
			cls: 'rm-cbox-hint',
			text: Platform.isMobile ? '' : 'Enter saves · Shift+Enter new line · Esc cancels',
		});
		foot.createEl('button', { cls: 'rm-cbox-btn', text: 'Cancel' }).addEventListener('click', () => this.close('cancel'));
		foot.createEl('button', { cls: 'rm-cbox-btn mod-cta', text: 'Save' }).addEventListener('click', () => this.close('save'));

		this.input.addEventListener('keydown', (e) => {
			if (e.isComposing) return;
			if (e.key === 'Enter' && !e.shiftKey && !Platform.isMobile) {
				e.preventDefault();
				e.stopPropagation();
				this.close('save');
			} else if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.close('cancel');
			}
		});
		this.input.addEventListener('input', () => {
			this.grow();
			this.place();
		});

		const away = (e: Event) => {
			if (!(e.target instanceof Node) || !this.el.contains(e.target)) this.close('away');
		};
		const reposition = () => this.place();
		doc.addEventListener('pointerdown', away, true);
		doc.addEventListener('scroll', reposition, true);
		win.addEventListener('resize', reposition);
		// The on-screen keyboard shrinks the visual viewport, and on iOS also scrolls it.
		win.visualViewport?.addEventListener('resize', reposition);
		win.visualViewport?.addEventListener('scroll', reposition);
		this.cleanup.push(() => {
			doc.removeEventListener('pointerdown', away, true);
			doc.removeEventListener('scroll', reposition, true);
			win.removeEventListener('resize', reposition);
			win.visualViewport?.removeEventListener('resize', reposition);
			win.visualViewport?.removeEventListener('scroll', reposition);
		});

		this.grow();
		this.place();
		this.input.focus({ preventScroll: true });
		this.input.setSelectionRange(initial.length, initial.length);
		// The Target's decorations settle a frame or two after the edit that created it.
		let frames = 0;
		const settle = () => {
			if (this.closed) return;
			this.place();
			if (++frames < 3) win.requestAnimationFrame(settle);
		};
		win.requestAnimationFrame(settle);
	}

	/** The textarea, for tests and callers that need to type into it. */
	get textarea(): HTMLTextAreaElement {
		return this.input;
	}

	close(how: Close): void {
		if (this.closed) return;
		const empty = this.input.value.trim() === '';
		if (how === 'save' && this.options.onEmptySave && empty) {
			this.options.onEmptySave();
			return;
		}
		// Clicked away from an emptied existing Comment: the box closes, but says why nothing was saved.
		if (how === 'away' && this.options.onEmptySave && empty && this.options.initial.trim() !== '') this.options.onEmptySave();
		this.closed = true;
		if (active === this) active = null;
		for (const f of this.cleanup) f();
		const text = this.input.value;
		this.el.remove();
		if (!this.options.view.dom.isConnected) return;
		if (how === 'cancel' || text.trim() === '') this.options.onCancel();
		else this.options.onSave(text);
	}

	private grow(): void {
		this.el.setCssProps({ '--rm-cbox-input-height': 'auto' });
		const height = Math.min(this.input.scrollHeight + 2, 220);
		this.el.setCssProps({ '--rm-cbox-input-height': `${height}px` });
	}

	/** Below the Target, or above it if there's no room below, always inside the visible area. */
	private place(): void {
		const { view, id } = this.options;
		if (!view.dom.isConnected) {
			this.close('away');
			return;
		}
		const win = view.dom.ownerDocument.defaultView ?? window;
		const vv = win.visualViewport;
		const vTop = vv ? vv.offsetTop : 0;
		const vBottom = vv ? vv.offsetTop + vv.height : win.innerHeight;
		const vRight = vv ? vv.offsetLeft + vv.width : win.innerWidth;
		const anchor = this.anchorRect(view, id);
		const h = this.el.offsetHeight;
		const w = this.el.offsetWidth;
		let top = anchor.bottom + 4;
		if (top + h > vBottom - 4) {
			const above = anchor.top - h - 4;
			top = above >= vTop + 4 ? above : vBottom - h - 4;
		}
		top = Math.max(vTop + 4, top);
		const left = Math.max(4, Math.min(anchor.left, vRight - w - 4));
		this.el.setCssProps({ '--rm-top': `${top}px`, '--rm-left': `${left}px` });
	}

	private anchorRect(view: EditorView, id: string): { left: number; top: number; bottom: number } {
		const rects: DOMRect[] = [];
		view.dom.querySelectorAll(`.rm-target[data-rm-id="${id}"]`).forEach((el) => {
			for (const r of Array.from(el.getClientRects())) if (r.width || r.height) rects.push(r);
		});
		const first = rects[0];
		if (first) {
			const oneLine = rects.every((r) => Math.abs(r.top - first.top) < 4);
			return {
				left: oneLine ? first.left : Math.min(...rects.map((r) => r.left)),
				top: Math.min(...rects.map((r) => r.top)),
				bottom: Math.max(...rects.map((r) => r.bottom)),
			};
		}
		// Source mode has no Target decorations: sit under the cursor instead.
		const c = view.coordsAtPos(view.state.selection.main.head);
		if (c) return { left: c.left, top: c.top, bottom: c.bottom };
		const s = view.scrollDOM.getBoundingClientRect();
		return { left: s.left + 16, top: s.top + s.height / 3, bottom: s.top + s.height / 3 };
	}
}
