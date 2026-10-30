// The comment popover: the full Comment, rendered as Markdown, next to a Target or badge. It opens
// on hover (desktop, with the hover setting on), on tap (mobile, same setting), and always on a
// badge click. A click opens it pinned: it stays until a click outside, Escape or a second click.
import { Component, Keymap, MarkdownRenderer, Platform, type App } from 'obsidian';
import type { ReviewMarksSettings } from '../settings';

/** What the popover shows for an Annotation. `comment` is null when the definition is missing. */
export interface CommentRef {
	id: string;
	comment: string | null;
	sourcePath: string;
}

const ANCHOR = '.rm-target, .rm-badge';
const HIDE_DELAY = 250;
const GAP = 6;

/** The Target or badge an event happened on, if any. */
function anchorOf(target: EventTarget | null): HTMLElement | null {
	const el = target as Element | null;
	return typeof el?.closest === 'function' ? el.closest<HTMLElement>(ANCHOR) : null;
}

export class CommentPopover {
	private el: HTMLElement | null = null;
	private key = '';
	private pinned = false;
	private hideTimer: number | undefined;
	private content: Component | null = null;
	private stopOutside: (() => void) | null = null;
	private readonly handled = new WeakSet<Event>();

	constructor(
		private readonly app: App,
		private readonly owner: Component,
		private readonly settings: () => ReviewMarksSettings,
	) {
		owner.register(() => this.close());
	}

	/**
	 * Opens the popover for the Targets and badges inside `root`. `resolve` gives the Comment of
	 * an anchor (an element with `data-rm-id`), or null to ignore it. Returns a function that stops.
	 */
	attach(root: HTMLElement, resolve: (anchor: HTMLElement) => CommentRef | null): () => void {
		const over = (e: MouseEvent) => {
			const anchor = anchorOf(e.target);
			const ref = anchor && root.contains(anchor) ? resolve(anchor) : null;
			if (anchor && ref) this.hoverStart(anchor, ref);
		};
		const out = (e: MouseEvent) => {
			const anchor = anchorOf(e.target);
			if (anchor && !anchor.contains(e.relatedTarget as Node | null)) this.hoverEnd();
		};
		const click = (e: MouseEvent) => {
			// A root can be attached twice (Reading view re-runs post processors), or sit inside
			// another: a click must toggle the popover only once.
			if (this.handled.has(e)) return;
			const anchor = anchorOf(e.target);
			const ref = anchor && root.contains(anchor) ? resolve(anchor) : null;
			if (!anchor || !ref || !this.click(anchor, ref, anchor.hasClass('rm-badge'))) return;
			this.handled.add(e);
			e.preventDefault();
			e.stopPropagation();
		};
		root.addEventListener('mouseover', over);
		root.addEventListener('mouseout', out);
		root.addEventListener('click', click);
		return () => {
			root.removeEventListener('mouseover', over);
			root.removeEventListener('mouseout', out);
			root.removeEventListener('click', click);
		};
	}

	/** The pointer entered a Target or badge. */
	hoverStart(anchor: HTMLElement, ref: CommentRef): void {
		if (!this.settings().showHover || Platform.isMobile) return;
		window.clearTimeout(this.hideTimer);
		if (this.pinned || (this.el && this.key === keyOf(ref))) return;
		this.open(anchor, ref, false);
	}

	/** The pointer left a Target, a badge or the popover. */
	hoverEnd(): void {
		if (this.pinned || !this.el) return;
		window.clearTimeout(this.hideTimer);
		this.hideTimer = window.setTimeout(() => this.close(), HIDE_DELAY);
	}

	/** A click or tap. Returns true when it opened or closed the popover. */
	click(anchor: HTMLElement, ref: CommentRef, isBadge: boolean): boolean {
		if (!isBadge && !(Platform.isMobile && this.settings().showHover)) return false;
		if (this.pinned && this.key === keyOf(ref)) this.close();
		else this.open(anchor, ref, true);
		return true;
	}

	close(): void {
		window.clearTimeout(this.hideTimer);
		this.stopOutside?.();
		this.stopOutside = null;
		this.el?.remove();
		if (this.content) this.owner.removeChild(this.content);
		this.el = null;
		this.content = null;
		this.key = '';
		this.pinned = false;
	}

	private open(anchor: HTMLElement, ref: CommentRef, pin: boolean): void {
		this.close();
		const doc = anchor.ownerDocument;
		const el = doc.body.createDiv({ cls: 'rm-popover' });
		this.el = el;
		this.key = keyOf(ref);
		this.pinned = pin;

		el.createDiv({ cls: 'rm-popover-head', text: 'Comment' });
		const body = el.createDiv({ cls: 'rm-popover-body markdown-rendered' });
		if (ref.comment === null) {
			body.setText(`No comment found for [^${ref.id}].`);
		} else if (ref.comment.trim() === '') {
			body.setText('No comment yet.');
		} else {
			const content = new Component();
			this.content = this.owner.addChild(content);
			void MarkdownRenderer.render(this.app, ref.comment, body, ref.sourcePath, content).then(() => this.place(anchor));
		}
		// Links in the Comment open like links in the note.
		body.addEventListener('click', (e) => {
			const link = (e.target as Element | null)?.closest?.('a.internal-link');
			const href = link?.getAttribute('data-href') ?? link?.getAttribute('href');
			if (!href) return;
			e.preventDefault();
			void this.app.workspace.openLinkText(href, ref.sourcePath, Keymap.isModEvent(e));
			this.close();
		});
		el.addEventListener('mouseenter', () => window.clearTimeout(this.hideTimer));
		el.addEventListener('mouseleave', () => this.hoverEnd());
		if (pin) this.closeOnOutside(doc, anchor);
		this.place(anchor);
	}

	private closeOnOutside(doc: Document, anchor: HTMLElement): void {
		const down = (e: PointerEvent) => {
			const target = e.target as Node | null;
			if (!this.el?.contains(target) && !anchor.contains(target)) this.close();
		};
		const key = (e: KeyboardEvent) => {
			if (e.key === 'Escape') this.close();
		};
		doc.addEventListener('pointerdown', down, true);
		doc.addEventListener('keydown', key, true);
		this.stopOutside = () => {
			doc.removeEventListener('pointerdown', down, true);
			doc.removeEventListener('keydown', key, true);
		};
	}

	/** Below the anchor, or above it when there's no room below; always inside the window. */
	private place(anchor: HTMLElement): void {
		const el = this.el;
		if (!el) return;
		const win = anchor.ownerDocument.defaultView ?? window;
		const r = anchor.getBoundingClientRect();
		const below = r.bottom + GAP + el.offsetHeight <= win.innerHeight;
		const top = below ? r.bottom + GAP : r.top - el.offsetHeight - GAP;
		const left = Math.max(4, Math.min(r.left, win.innerWidth - el.offsetWidth - 4));
		el.setCssProps({ '--rm-top': `${Math.max(4, top)}px`, '--rm-left': `${left}px` });
	}
}

function keyOf(ref: CommentRef): string {
	return `${ref.sourcePath}#${ref.id}`;
}
