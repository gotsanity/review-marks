// PROTOTYPE, throwaway (wayfinder "Prototype: Review Mode selection in Live Preview and Source mode").
// Not production code: no tests, no settings, no polish. It lives on branch
// prototype/review-mode-selection only.
//
// Variants, cycled by the "PROTOTYPE: next review mode variant" command or by clicking the status bar:
//   off  - Review Mode off.
//   A    - native selection; annotate as soon as the pointer is released with a non-empty selection.
//   A+   - native selection; annotate once the selection has settled (no new click within SETTLE_MS),
//          so a double-click can grow into a triple-click first.
//   B    - take over the gesture like annotate-on-drag, but with no keys held. A plain click puts the
//          cursor back where it landed.
import { ViewPlugin, type EditorView } from '@codemirror/view';
import type { Plugin } from 'obsidian';
import { annotateRange } from '../commands/annotate-selection';
import { isCommentBoxOpen } from '../comment-box/comment-box';
import type { ReviewMarksSettings } from '../settings';

export type ProtoVariant = 'off' | 'A' | 'A+' | 'B';
const ORDER: ProtoVariant[] = ['off', 'A', 'A+', 'B'];
const SETTLE_MS = 400;

let variant: ProtoVariant = 'off';
let last = '-';
let render: () => void = () => {};

export const protoVariant = (): ProtoVariant => variant;

export function protoLog(msg: string): void {
	last = msg;
	console.log('[review-mode prototype]', msg);
	render();
}

class NativeSelection {
	private timer: number | null = null;

	constructor(
		private readonly view: EditorView,
		private readonly settings: () => ReviewMarksSettings,
	) {
		view.dom.addEventListener('pointerdown', this.onDown, true);
		view.dom.ownerDocument.addEventListener('pointerup', this.onUp, true);
	}

	destroy(): void {
		this.view.dom.removeEventListener('pointerdown', this.onDown, true);
		this.view.dom.ownerDocument.removeEventListener('pointerup', this.onUp, true);
		this.clear();
	}

	private clear(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = null;
	}

	// A new click inside the settle window cancels the pending annotation (double -> triple click).
	private readonly onDown = (): void => {
		if (this.timer !== null) protoLog('pending annotation cancelled: another click');
		this.clear();
	};

	private readonly onUp = (e: PointerEvent): void => {
		if (variant !== 'A' && variant !== 'A+') return;
		if (e.button !== 0) return;
		// Only selections the editor itself made (the gesture began in this editor and it has focus).
		if (!this.view.hasFocus) return;
		// Let CodeMirror finish its own mouse-selection handling first.
		const wait = variant === 'A+' ? SETTLE_MS : 0;
		this.clear();
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.fire(e.detail);
		}, wait);
	};

	private fire(clicks: number): void {
		const { view } = this;
		if (!view.dom.isConnected) return;
		const sel = view.state.selection.main;
		const tag = `release (click x${clicks}) sel ${sel.from}-${sel.to}`;
		if (sel.empty) return protoLog(`${tag}: empty, ignored`);
		if (view.state.selection.ranges.length > 1) return protoLog(`${tag}: multiple cursors, ignored`);
		if (isCommentBoxOpen()) return protoLog(`${tag}: comment box open, ignored`);
		const text = view.state.sliceDoc(sel.from, sel.to);
		protoLog(`${tag} "${text.length > 40 ? text.slice(0, 40) + '…' : text}": annotating (a refusal shows as a notice)`);
		annotateRange(view, sel.from, sel.to, this.settings());
	}
}

/** Registers the native-selection variants, the cycle command and the status bar readout. */
export function registerReviewModePrototype(plugin: Plugin, settings: () => ReviewMarksSettings): void {
	plugin.registerEditorExtension(ViewPlugin.define((view) => new NativeSelection(view, settings)));
	const bar = plugin.addStatusBarItem();
	bar.style.cursor = 'pointer';
	render = () => bar.setText(`PROTO review mode: ${variant} · ${last}`);
	const next = () => {
		variant = ORDER[(ORDER.indexOf(variant) + 1) % ORDER.length] ?? 'off';
		protoLog(`variant -> ${variant}`);
	};
	bar.addEventListener('click', next);
	plugin.addCommand({ id: 'prototype-next-review-mode-variant', name: 'PROTOTYPE: next review mode variant', callback: next });
	render();
}
