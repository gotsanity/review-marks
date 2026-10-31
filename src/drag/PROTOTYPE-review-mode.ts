// PROTOTYPE, throwaway (wayfinder "Prototype: Review Mode selection in Live Preview and Source mode").
// Not production code: no tests, no settings, no polish. It lives on branch
// prototype/review-mode-selection only.
//
// Review Mode is toggled from the sidebar header (or "PROTOTYPE: toggle review mode"); the variant is
// picked there too:
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
export type ProtoChoice = 'A' | 'A+' | 'B';
const SETTLE_MS = 400;

let enabled = false;
let choice: ProtoChoice = 'A';
let last = '-';
const listeners = new Set<() => void>();
const render = () => listeners.forEach((l) => l());

export const protoVariant = (): ProtoVariant => (enabled ? choice : 'off');

export function protoLog(msg: string): void {
	last = msg;
	console.log('[review-mode prototype]', msg);
	render();
}

export const PROTO_CHOICES: [ProtoChoice, string][] = [
	['A', 'A: native selection, opens on release'],
	['A+', 'A+: native selection, opens after 400 ms'],
	['B', 'B: plugin takes over the drag'],
];

/** Draws the sidebar header controls: the Review Mode toggle, the variant picker and the last event. */
export function protoHeader(container: HTMLElement): () => void {
	const el = container.createDiv({ cls: 'rm-proto-head' });
	el.setAttr('style', 'display:flex;flex-direction:column;gap:6px;padding:6px 0 10px;border-bottom:1px solid var(--background-modifier-border);margin-bottom:8px');
	const toggle = el.createEl('button');
	toggle.addEventListener('click', () => {
		enabled = !enabled;
		protoLog(enabled ? `review mode on (${choice})` : 'review mode off');
	});
	const row = el.createDiv();
	row.setAttr('style', 'display:flex;gap:4px;align-items:center;font-size:var(--font-ui-smaller)');
	row.createSpan({ text: 'PROTOTYPE variant:' });
	const picks = PROTO_CHOICES.map(([c, title]) => {
		const b = row.createEl('button', { text: c, attr: { title } });
		b.addEventListener('click', () => {
			choice = c;
			protoLog(`variant -> ${c}`);
		});
		return [c, b] as const;
	});
	const desc = el.createDiv();
	desc.setAttr('style', 'font-size:var(--font-ui-smaller);color:var(--text-muted)');
	const lastEl = el.createDiv();
	lastEl.setAttr('style', 'font-size:var(--font-ui-smaller);color:var(--text-faint);word-break:break-word');
	const draw = () => {
		toggle.setText(enabled ? 'Review mode: ON' : 'Review mode: off');
		toggle.toggleClass('mod-cta', enabled);
		for (const [c, b] of picks) b.toggleClass('mod-cta', c === choice);
		desc.setText(PROTO_CHOICES.find(([c]) => c === choice)?.[1] ?? '');
		lastEl.setText(`last: ${last}`);
	};
	listeners.add(draw);
	draw();
	return () => listeners.delete(draw);
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
		if (protoVariant() !== 'A' && protoVariant() !== 'A+') return;
		if (e.button !== 0) return;
		// Only selections the editor itself made (the gesture began in this editor and it has focus).
		if (!this.view.hasFocus) return;
		// Let CodeMirror finish its own mouse-selection handling first.
		const wait = protoVariant() === 'A+' ? SETTLE_MS : 0;
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

/** Registers the native-selection variants and a status bar readout of the last event. */
export function registerReviewModePrototype(plugin: Plugin, settings: () => ReviewMarksSettings): void {
	plugin.registerEditorExtension(ViewPlugin.define((view) => new NativeSelection(view, settings)));
	const bar = plugin.addStatusBarItem();
	const draw = () => bar.setText(`PROTO review mode: ${protoVariant()}`);
	listeners.add(draw);
	draw();
	plugin.addCommand({
		id: 'prototype-toggle-review-mode',
		name: 'PROTOTYPE: toggle review mode',
		callback: () => {
			enabled = !enabled;
			protoLog(enabled ? `review mode on (${choice})` : 'review mode off');
		},
	});
}
